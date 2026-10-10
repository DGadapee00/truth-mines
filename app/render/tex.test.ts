import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGraph } from '../../core/schema';
import { nameError } from '../ui/name';
import { texToSvg } from './tex';

const g = parseGraph(JSON.parse(readFileSync(new URL('../../data/graph.json', import.meta.url), 'utf8')));

describe('text in the data typesets', () => {
  it('every translated statement, without a MathJax error', () => {
    expect(g.nodes.map((n) => ({ id: n.id, err: texToSvg(n.statement, true).error })).filter((x) => x.err)).toEqual([]);
  });
  it('every display form, without a MathJax error', () => {
    expect(g.nodes.filter((n) => n.display).map((n) => ({ id: n.id, err: texToSvg(n.display, true).error })).filter((x) => x.err)).toEqual([]);
  });
  it('every name, through KaTeX', () => {
    expect(g.nodes.map((n) => ({ id: n.id, err: nameError(n.name) })).filter((x) => x.err)).toEqual([]);
  });
  it('no 3D label carries TeX', () => {
    expect(g.nodes.filter((n) => /[\\$]/.test(n.label)).map((n) => n.label)).toEqual([]);
  });
});
