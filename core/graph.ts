import type { GraphFile, MineNode } from './schema';

/**
 * The mine's graph and the questions the app asks of it. Pure logic: no rendering here.
 *
 * Edges point from a result to what it depends on (`deps`), so "up" (towards the axioms) follows
 * deps and "down" follows dependents.
 */
export class MineGraph {
  readonly nodes: readonly MineNode[];
  private readonly byId = new Map<string, MineNode>();
  private readonly dependents = new Map<string, string[]>();
  private readonly ancestorCache = new Map<string, ReadonlySet<string>>();

  constructor(file: GraphFile) {
    this.nodes = file.nodes;
    for (const n of file.nodes) {
      if (this.byId.has(n.id)) throw new Error(`duplicate node ${n.id}`);
      this.byId.set(n.id, n);
      this.dependents.set(n.id, []);
    }
    for (const n of file.nodes) {
      for (const d of n.deps) {
        const list = this.dependents.get(d);
        if (!list) throw new Error(`${n.id} depends on ${d}, which is not in the graph`);
        list.push(n.id);
      }
    }
  }

  get(id: string): MineNode | undefined {
    return this.byId.get(id);
  }

  must(id: string): MineNode {
    const n = this.byId.get(id);
    if (!n) throw new Error(`no node ${id}`);
    return n;
  }

  /** Nodes that depend directly on this one. */
  dependentsOf(id: string): readonly string[] {
    return this.dependents.get(id) ?? [];
  }

  /** Everything this node rests on, all the way up (not including itself). */
  ancestors(id: string): ReadonlySet<string> {
    const hit = this.ancestorCache.get(id);
    if (hit) return hit;
    const out = this.walk(id, (x) => this.must(x).deps);
    this.ancestorCache.set(id, out);
    return out;
  }

  /** Everything that rests on this node, all the way down (not including itself). */
  descendants(id: string): ReadonlySet<string> {
    return this.walk(id, (x) => this.dependentsOf(x));
  }

  /** Tunnels inside a set of nodes plus `id`: the edges a trace lights up, as [from, to] pairs. */
  tunnelsWithin(id: string, set: ReadonlySet<string>): [string, string][] {
    const inside = new Set(set);
    inside.add(id);
    const out: [string, string][] = [];
    for (const x of inside) for (const d of this.must(x).deps) if (inside.has(d)) out.push([x, d]);
    return out;
  }

  /**
   * The shortest chain of tunnels from this node up to an axiom: [id, ..., axiom].
   * A node that reaches no axiom (a definition, or something resting only on definitions)
   * gets the shortest chain to any root.
   */
  pathToAxiom(id: string): string[] {
    const prev = new Map<string, string | null>([[id, null]]);
    const queue = [id];
    let rootFallback: string | null = null;
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i] as string;
      const n = this.must(x);
      if (n.kind === 'axiom') return this.unwind(prev, x);
      if (!n.deps.length && rootFallback === null) rootFallback = x;
      for (const d of n.deps) {
        if (!prev.has(d)) {
          prev.set(d, x);
          queue.push(d);
        }
      }
    }
    return this.unwind(prev, rootFallback ?? id);
  }

  /** Landmarks matching a query, best first: by name and by label, words matched as prefixes. */
  search(query: string, limit = 12): MineNode[] {
    const q = fold(query).trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    const scored: { n: MineNode; s: number }[] = [];
    for (const n of this.nodes) {
      const name = fold(n.name);
      const id = n.id.toLowerCase();
      let s = 0;
      if (id === q) s += 100;
      else if (id.startsWith(q)) s += 40;
      if (name === q) s += 90;
      else if (name.startsWith(q)) s += 60;
      const nameWords = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const all = words.every((w) => nameWords.some((nw) => nw.startsWith(w)) || id.startsWith(w));
      if (all) s += 20 + 5 * words.length;
      else if (name.includes(q)) s += 10;
      if (s > 0) scored.push({ n, s: s - n.depth / 1000 });
    }
    scored.sort((a, b) => b.s - a.s || a.n.id.localeCompare(b.n.id));
    return scored.slice(0, limit).map((x) => x.n);
  }

  private walk(id: string, next: (x: string) => readonly string[]): Set<string> {
    const seen = new Set<string>();
    const stack = [...next(id)];
    while (stack.length) {
      const x = stack.pop() as string;
      if (seen.has(x)) continue;
      seen.add(x);
      for (const y of next(x)) if (!seen.has(y)) stack.push(y);
    }
    return seen;
  }

  private unwind(prev: Map<string, string | null>, end: string): string[] {
    const path: string[] = [];
    let x: string | null = end;
    while (x !== null) {
      path.push(x);
      x = prev.get(x) ?? null;
    }
    return path.reverse();
  }
}

/** Lower case, accents removed: "Schröder" matches "schroder". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** A display name: the landmark name, or the label for an unnamed axiom. */
export function displayName(n: MineNode): string {
  return n.name || n.id;
}
