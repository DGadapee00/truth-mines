import { describe, expect, it } from 'vitest';
import { MineGraph, fold } from '../graph';
import { parseGraph, SchemaError, SCHEMA_VERSION, type MineNode } from '../schema';

const node = (id: string, kind: MineNode['kind'], deps: string[], name = '', depth = 0): MineNode => ({
  id,
  kind,
  name,
  statement: 'x',
  subject: 's',
  depth,
  pos: [0, -depth, 0],
  deps,
  hidden_steps: deps.map(() => 0),
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

describe('parseGraph', () => {
  it('refuses another schema version', () => {
    expect(() => parseGraph({ ...file, schema_version: SCHEMA_VERSION + 1 })).toThrow(SchemaError);
  });
  it('refuses a malformed node', () => {
    expect(() => parseGraph({ ...file, nodes: [{ ...node('a', 'axiom', []), pos: [0, 1] }] })).toThrow(/pos/);
    expect(() => parseGraph({ ...file, nodes: [{ ...node('a', 'axiom', []), kind: 'lemma' }] })).toThrow(/kind/);
  });
});
