import { describe, expect, it } from 'vitest';
import { MineGraph, fold } from '../graph';
import { parseGraph, SchemaError, SCHEMA_VERSION, type MineNode } from '../schema';

const node = (id: string, kind: MineNode['kind'], deps: string[], name = '', depth = 0, chains: string[][] = []): MineNode => ({
  id,
  kind,
  name,
  label: name,
  statement: 'x',
  source: 'x',
  display: '',
  display_reviewed: false,
  subject: 's',
  depth,
  pos: [0, -depth, 0],
  deps,
  feeding_lemmas: deps.map(() => 0),
  chain: deps.map((_, i) => chains[i] ?? []),
  note: '',
});

//   ax1   ax2   df1
//    \   /  \   /
//     t1     t2
//      \    /
//        t3 —— t4
const file = {
  schema_version: SCHEMA_VERSION,
  nodes: [
    node('ax1', 'axiom', [], 'Axiom one'),
    node('ax2', 'axiom', [], 'Axiom two'),
    node('df1', 'definition', [], 'Definition of a widget'),
    node('t1', 'theorem', ['ax1', 'ax2'], 'Schröder–Bernstein theorem', 1),
    node('t2', 'theorem', ['ax2', 'df1'], 'Widgets exist', 1),
    node('t3', 'theorem', ['t1', 't2'], 'Fundamental theorem of widgets', 2),
    node('t4', 'theorem', ['t3'], 'Corollary', 3),
    node('t5', 'theorem', ['df1'], 'Rests on a definition only', 1),
  ],
};
const g = new MineGraph(parseGraph(file));

describe('MineGraph', () => {
  it('finds every ancestor up to the roots', () => {
    expect([...g.ancestors('t4')].sort()).toEqual(['ax1', 'ax2', 'df1', 't1', 't2', 't3']);
    expect(g.ancestors('ax1').size).toBe(0);
  });

  it('finds every descendant', () => {
    expect([...g.descendants('ax2')].sort()).toEqual(['t1', 't2', 't3', 't4']);
    expect([...g.descendants('t4')]).toEqual([]);
  });

  it('lists the tunnels a trace lights up', () => {
    const t = g.tunnelsWithin('t3', g.ancestors('t3')).map((e) => e.join('>')).sort();
    expect(t).toEqual(['t1>ax1', 't1>ax2', 't2>ax2', 't2>df1', 't3>t1', 't3>t2']);
  });

  it('follows the shortest chain to an axiom', () => {
    const p = g.pathToAxiom('t4');
    expect(p[0]).toBe('t4');
    expect(p).toHaveLength(4);
    expect(g.must(p.at(-1) as string).kind).toBe('axiom');
    expect(g.pathToAxiom('ax1')).toEqual(['ax1']);
    // No axiom above: the chain ends at a root.
    expect(g.pathToAxiom('t5')).toEqual(['t5', 'df1']);
  });

  it('searches names and labels, ignoring accents and case', () => {
    expect(g.search('schroder')[0]?.id).toBe('t1');
    expect(g.search('fund widg')[0]?.id).toBe('t3');
    expect(g.search('T4')[0]?.id).toBe('t4');
    expect(g.search('')).toEqual([]);
    expect(fold('Schröder')).toBe('schroder');
  });

  it('rejects a dependency that is not in the graph', () => {
    expect(() => new MineGraph(parseGraph({ ...file, nodes: [node('a', 'theorem', ['zz'])] }))).toThrow(/zz/);
  });
});

describe('criticalPath', () => {
  //  ax1 ─(1 step)─ t1 ─(5 steps)─ t3
  //  ax2 ─(1 step)─ t2 ─(2 steps)─ t3,   ax2 ─(9 steps)─ t1
  //  df1 ─ t5 (no axiom above t5)
  const cp = new MineGraph(
    parseGraph({
      schema_version: SCHEMA_VERSION,
      nodes: [
        node('ax1', 'axiom', []),
        node('ax2', 'axiom', []),
        node('df1', 'definition', []),
        node('t1', 'theorem', ['ax1', 'ax2'], '', 1, [[], Array.from({ length: 8 }, (_, i) => `l${i}`)]),
        node('t2', 'theorem', ['ax2'], '', 1),
        node('t3', 'theorem', ['t1', 't2'], '', 2, [['a', 'b', 'c', 'd'], ['e']]),
        node('t5', 'theorem', ['df1'], '', 1, [['f', 'g']]),
      ],
    }),
  );

  it('follows the tunnels that carry the most citation steps', () => {
    // t3 -> t1 is 5 steps, then t1 -> ax2 is 9: 14 beats t3 -> t2 -> ax2 (3 + 1) and t3 -> t1 -> ax1 (5 + 1).
    expect(cp.criticalPath('t3')).toEqual(['t3', 't1', 'ax2']);
    expect(cp.criticalLength('t3')).toBe(14);
  });

  it('is just the axiom for an axiom', () => {
    expect(cp.criticalPath('ax1')).toEqual(['ax1']);
    expect(cp.criticalLength('ax1')).toBe(0);
  });

  it('ends at a root when no axiom lies above', () => {
    expect(cp.criticalPath('t5')).toEqual(['t5', 'df1']);
    expect(cp.criticalLength('t5')).toBe(3);
  });

  it('agrees with the main graph fixture', () => {
    const p = g.criticalPath('t4');
    expect(p[0]).toBe('t4');
    expect(g.must(p.at(-1) as string).kind).toBe('axiom');
  });
});

describe('parseGraph', () => {
  it('refuses another schema version', () => {
    expect(() => parseGraph({ ...file, schema_version: SCHEMA_VERSION + 1 })).toThrow(SchemaError);
  });
  it('refuses a malformed node', () => {
    expect(() => parseGraph({ ...file, nodes: [{ ...node('a', 'axiom', []), pos: [0, 1] }] })).toThrow(/pos/);
    expect(() => parseGraph({ ...file, nodes: [{ ...node('a', 'axiom', []), kind: 'lemma' }] })).toThrow(/kind/);
  });
});
