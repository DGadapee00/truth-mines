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

  /**
   * The critical path: the longest dependency chain from this node up to the axioms, as
   * [id, …, axiom]. Each tunnel counts the citation steps it carries (its chain plus one), so the
   * path is the longest real citation route through the tunnels, the way depth is a longest path.
   * A node that rests on no axiom (a definition, or a result resting only on definitions) gets the
   * longest route to any root instead. Ties go to the deeper dependency, then the smaller id.
   */
  criticalPath(id: string): string[] {
    this.must(id);
    const toAxiom = this.longestTo(id, (n) => n.kind === 'axiom');
    if (toAxiom) return toAxiom.path;
    return this.longestTo(id, (n) => n.deps.length === 0)?.path ?? [id];
  }

  /** Length of the critical path in citation steps (the sum of its tunnels' weights). */
  criticalLength(id: string): number {
    const p = this.criticalPath(id);
    let total = 0;
    for (let i = 0; i + 1 < p.length; i++) total += this.weight(p[i] as string, p[i + 1] as string);
    return total;
  }

  /** Citation steps carried by the tunnel from `id` up to `dep`. */
  weight(id: string, dep: string): number {
    const n = this.must(id);
    const k = n.deps.indexOf(dep);
    if (k < 0) throw new Error(`${id} has no tunnel to ${dep}`);
    return (n.chain[k]?.length ?? 0) + 1;
  }

  private longestTo(id: string, end: (n: MineNode) => boolean): { len: number; path: string[] } | null {
    const memo = new Map<string, { len: number; next: string | null } | null>();
    const solve = (x: string): { len: number; next: string | null } | null => {
      if (memo.has(x)) return memo.get(x) ?? null;
      const n = this.must(x);
      let best: { len: number; next: string | null } | null = end(n) ? { len: 0, next: null } : null;
      if (!best) {
        for (const d of n.deps) {
          const sub = solve(d);
          if (!sub) continue;
          const len = sub.len + this.weight(x, d);
          const cur = best?.next ? this.must(best.next) : null;
          const dn = this.must(d);
          const better =
            !best || len > best.len || (len === best.len && cur && (dn.depth > cur.depth || (dn.depth === cur.depth && d < cur.id)));
          if (better) best = { len, next: d };
        }
      }
      memo.set(x, best);
      return best;
    };
    const top = solve(id);
    if (!top) return null;
    const path = [id];
    let step = top.next;
    while (step) {
      path.push(step);
      step = memo.get(step)?.next ?? null;
    }
    return { len: top.len, path };
  }

  /** Landmarks matching a query, best first: by name and by label, words matched as prefixes. */
  search(query: string, limit = 12): MineNode[] {
    const q = fold(query).trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    const scored: { n: MineNode; s: number }[] = [];
    for (const n of this.nodes) {
      const name = fold(n.label || n.name);
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

/** A display name: the landmark name (may hold $…$ math), or the set.mm label if unnamed. */
export function displayName(n: MineNode): string {
  return n.name || n.id;
}

/** The name as plain text: no TeX. */
export function plainName(n: MineNode): string {
  return n.label || n.id;
}
