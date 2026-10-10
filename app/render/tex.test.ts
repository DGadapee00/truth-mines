import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGraph } from '../../core/schema';
import { texToSvg } from './tex';

describe('statements', () => {
  it('every landmark statement typesets without a MathJax error', () => {
    const g = parseGraph(JSON.parse(readFileSync(new URL('../../data/graph.json', import.meta.url), 'utf8')));
    const bad = g.nodes.map((n) => ({ id: n.id, err: texToSvg(n.statement, true).error })).filter((x) => x.err);
    expect(bad).toEqual([]);
  });
});
