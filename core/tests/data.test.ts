/**
 * The built data, checked as a whole. Needs `python -m pipeline` to have run (CI runs it first).
 *
 * The key check: for every landmark, the ancestors core/ finds by walking the collapsed tunnels
 * are exactly the landmarks the pipeline found by walking the FULL set.mm graph. Collapsing and
 * reducing tunnels must never lose or invent a dependency.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MineGraph } from '../graph';
import { parseGraph, parseMeta } from '../schema';

const root = new URL('../../', import.meta.url);
const read = (p: string) => {
  const url = new URL(p, root);
  if (!existsSync(url)) throw new Error(`${p} is missing: run \`npm run data\` (python -m pipeline) first`);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
};

describe('built data', () => {
  const graph = parseGraph(read('data/graph.json'));
  const meta = parseMeta(read('data/meta.json'));
  const full = read('pipeline/build/check-ancestors.json') as Record<string, string[]>;
  const g = new MineGraph(graph);

  it('has the landmarks the pipeline counted', () => {
    expect(graph.nodes.length).toBe(meta.counts.nodes);
    expect(Object.keys(full).length).toBe(graph.nodes.length);
  });

  it('matches full-graph ancestors for every landmark', () => {
    const wrong: string[] = [];
    for (const n of graph.nodes) {
      const got = [...g.ancestors(n.id)].sort();
      const want = full[n.id] ?? [];
      if (got.join() !== want.join()) wrong.push(n.id);
    }
    expect(wrong).toEqual([]);
  });

  it('puts every landmark deeper than everything it depends on', () => {
    for (const n of graph.nodes) for (const d of n.deps) expect(g.must(d).depth).toBeLessThan(n.depth);
  });

  it('fixes height by depth', () => {
    for (const n of graph.nodes) expect(n.pos[1]).toBeCloseTo(-n.depth * meta.metres_per_depth, 2);
  });

  it('uses only subjects meta knows', () => {
    const ids = new Set(meta.subjects.map((s) => s.id));
    for (const n of graph.nodes) expect(ids.has(n.subject)).toBe(true);
  });

  it('reaches an axiom from every theorem that rests on one', () => {
    for (const n of graph.nodes) {
      const up = g.ancestors(n.id);
      const hasAxiom = [...up].some((x) => g.must(x).kind === 'axiom');
      const p = g.pathToAxiom(n.id);
      if (hasAxiom) expect(g.must(p.at(-1) as string).kind).toBe('axiom');
    }
  });

  it('gives every landmark a critical path that is a chain of real tunnels, ending at an axiom when one lies above', () => {
    for (const n of graph.nodes) {
      const p = g.criticalPath(n.id);
      expect(p[0]).toBe(n.id);
      for (let i = 0; i + 1 < p.length; i++) expect(g.must(p[i] as string).deps).toContain(p[i + 1]);
      const end = g.must(p.at(-1) as string);
      const axiomAbove = [...g.ancestors(n.id)].some((x) => g.must(x).kind === 'axiom') || n.kind === 'axiom';
      expect(axiomAbove ? end.kind === 'axiom' : end.deps.length === 0).toBe(true);
      // A route through real citations can never be longer than the node is deep.
      expect(g.criticalLength(n.id)).toBeLessThanOrEqual(n.depth);
    }
  });

  it('stays inside the payload budget', () => {
    expect(readFileSync(new URL('data/graph.json', root)).length).toBeLessThan(2_000_000);
  });
});
