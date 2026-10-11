/**
 * Door states are computed from what has been earned, never stored. The rules (technical design,
 * "Door states are computed"):
 *   frontier  every id in entry_requires is earned
 *   dim       not a frontier, and every unmet requirement has all its own dependencies earned
 *   sealed    everything else
 * The first group of tests uses a tiny hand-made graph so each rule is visible; the last group
 * runs the real built data (needs `python -m pipeline`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { doorStates, type DoorState } from '../doors';
import { parseCathedral, parseGraph, parsePathways, PLANE_IDS, SchemaError, type CathedralFile, type GraphFile, type PathwaysFile, type PlaneId } from '../schema';

// ---------------------------------------------------------------- a tiny world

/** root: no dependencies. a, b: rest on the root. c: rests on a and b. d: rests on c. */
const DEPS: Record<string, string[]> = { root: [], a: ['root'], b: ['root'], c: ['a', 'b'], d: ['c'] };

const graph = {
  schema_version: 6,
  nodes: Object.entries(DEPS).map(([id, deps]) => ({ id, deps })),
} as unknown as GraphFile;

/** Twelve doors; the plane under test gets the given requirements, every other door is open. */
function world(plane: PlaneId, requires: string[]): { cathedral: CathedralFile; pathways: PathwaysFile } {
  return {
    cathedral: { doors: PLANE_IDS.map((p) => ({ plane: p })) } as unknown as CathedralFile,
    pathways: { pathways: PLANE_IDS.map((p) => ({ plane: p, entry_requires: p === plane ? requires : [], stretches: [] })) } as unknown as PathwaysFile,
  };
}

function state(requires: string[], earned: string[]): DoorState {
  const w = world('logic', requires);
  return doorStates(earned, w.cathedral, w.pathways, graph).logic!;
}

describe('doorStates on a small graph', () => {
  it('a door with no requirements is frontier', () => {
    expect(state([], [])).toBe('frontier');
  });

  it('a door whose requirements are all earned is frontier', () => {
    expect(state(['a', 'b'], ['a', 'b'])).toBe('frontier');
  });

  it('an unmet root requirement is dim, because it has no dependencies to wait for', () => {
    expect(state(['root'], [])).toBe('dim');
  });

  it('an unmet requirement whose dependencies are all earned is dim', () => {
    expect(state(['a'], ['root'])).toBe('dim');
    expect(state(['c'], ['a', 'b'])).toBe('dim');
  });

  it('an unmet requirement with an unearned dependency is sealed', () => {
    expect(state(['a'], [])).toBe('sealed');
    expect(state(['c'], ['a'])).toBe('sealed');
    expect(state(['d'], ['a', 'b'])).toBe('sealed');
  });

  it('every unmet requirement must be one step away: one dim and one sealed make a sealed door', () => {
    expect(state(['root', 'd'], [])).toBe('sealed');
    expect(state(['a', 'c'], ['root'])).toBe('sealed');
  });

  it('two dim requirements make a dim door, and a met one does not matter', () => {
    expect(state(['a', 'b'], ['root'])).toBe('dim');
    expect(state(['root', 'a'], ['root'])).toBe('dim');
  });

  it('earned ids the graph does not know are ignored', () => {
    expect(state(['a'], ['no-such-id'])).toBe('sealed');
    expect(state([], ['no-such-id'])).toBe('frontier');
  });

  it('answers for all twelve planes, keyed by plane id', () => {
    const w = world('logic', ['root']);
    const out = doorStates([], w.cathedral, w.pathways, graph);
    expect(Object.keys(out).sort()).toEqual([...PLANE_IDS].sort());
    expect(out.logic).toBe('dim');
    expect(out.sets).toBe('frontier');
  });

  it('accepts any iterable of earned ids and does not change it', () => {
    const w = world('logic', ['a']);
    const earned = new Set(['root']);
    expect(doorStates(earned, w.cathedral, w.pathways, graph).logic).toBe('dim');
    expect([...earned]).toEqual(['root']);
  });

  it('throws on a requirement the graph does not have', () => {
    const w = world('logic', ['no-such-id']);
    expect(() => doorStates([], w.cathedral, w.pathways, graph)).toThrow(SchemaError);
    expect(() => doorStates([], w.cathedral, w.pathways, graph)).toThrow(/no-such-id/);
  });

  it('throws on an unknown requirement even when an earlier one already seals the door', () => {
    const w = world('logic', ['d', 'no-such-id']);
    expect(() => doorStates([], w.cathedral, w.pathways, graph)).toThrow(/no-such-id/);
  });

  it('throws on a door that has no pathway', () => {
    const w = world('logic', []);
    w.pathways.pathways = w.pathways.pathways.filter((p) => p.plane !== 'topology');
    expect(() => doorStates([], w.cathedral, w.pathways, graph)).toThrow(/topology/);
  });

  it('earning more never makes a door sink: states only rise from sealed to dim to frontier', () => {
    const rank: Record<DoorState, number> = { sealed: 0, dim: 1, frontier: 2 };
    const ids = Object.keys(DEPS);
    // Every subset of the five ids, grown one id at a time in a fixed order, for every requirement set.
    const requirementSets = [[], ['root'], ['a'], ['c'], ['d'], ['a', 'b'], ['root', 'd'], ['c', 'd']];
    for (const requires of requirementSets) {
      for (let mask = 0; mask < 1 << ids.length; mask++) {
        const base = ids.filter((_, i) => mask & (1 << i));
        for (const extra of ids.filter((x) => !base.includes(x))) {
          expect(rank[state(requires, [...base, extra])], `${requires.join()} | ${base.join()} + ${extra}`).toBeGreaterThanOrEqual(rank[state(requires, base)]);
        }
      }
    }
  });
});

// ---------------------------------------------------------------- the built data

const root = new URL('../../', import.meta.url);
const read = (p: string) => {
  const url = new URL(p, root);
  if (!existsSync(url)) throw new Error(`${p} is missing: run \`npm run data\` (python -m pipeline) first`);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
};

describe('doorStates on the built data', () => {
  const realGraph = parseGraph(read('data/graph.json'));
  const cathedral = parseCathedral(read('data/cathedral.json'));
  const pathways = parsePathways(read('data/pathways.json'));
  const states = (earned: string[]) => doorStates(earned, cathedral, pathways, realGraph);

  it('gives every one of the twelve planes a state', () => {
    expect(Object.keys(states([])).sort()).toEqual([...PLANE_IDS].sort());
  });

  it('with nothing earned, lights exactly number theory', () => {
    const s = states([]);
    expect(PLANE_IDS.filter((p) => s[p] === 'frontier')).toEqual(['number-theory']);
  });

  it('with nothing earned, a door gated on a definition or axiom is dim and one gated on a theorem is sealed', () => {
    const s = states([]);
    expect(PLANE_IDS.filter((p) => s[p] === 'dim').sort()).toEqual(['geometry', 'infinity', 'linear-algebra', 'logic', 'sets']);
    expect(PLANE_IDS.filter((p) => s[p] === 'sealed').sort()).toEqual(['algebra-symmetry', 'calculus-analysis', 'combinatorics', 'complex-numbers', 'graph-theory', 'topology']);
  });

  it('earning 1arith, the road moment, lights algebra and symmetry and nothing else', () => {
    const before = states([]);
    const after = states(['1arith']);
    expect(after['algebra-symmetry']).toBe('frontier');
    expect(before['algebra-symmetry']).toBe('sealed');
    for (const p of PLANE_IDS) if (p !== 'algebra-symmetry') expect(after[p], p).toBe(before[p]);
  });

  it('earning df-prm, the sieve moment, changes no door yet', () => {
    expect(states(['df-prm'])).toEqual(states([]));
  });

  it('never lets a door sink, whatever order the prototype ideas are earned in', () => {
    const rank: Record<DoorState, number> = { sealed: 0, dim: 1, frontier: 2 };
    for (const order of [['df-prm', '1arith'], ['1arith', 'df-prm']]) {
      let earned: string[] = [];
      let prev = states(earned);
      for (const id of order) {
        earned = [...earned, id];
        const next = states(earned);
        for (const p of PLANE_IDS) expect(rank[next[p]!], `${p} after ${id}`).toBeGreaterThanOrEqual(rank[prev[p]!]);
        prev = next;
      }
    }
  });
});
