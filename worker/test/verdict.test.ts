import { describe, expect, it } from 'vitest';
import { VerdictSplitter } from '../src/verdict';

/** Feed chunks, return everything shown to the visitor and the parsed verdict. */
function run(chunks: string[]): { shown: string; earned: string[] | null } {
  const s = new VerdictSplitter();
  let shown = '';
  for (const c of chunks) shown += s.push(c);
  const end = s.end();
  return { shown: shown + end.text, earned: end.earned };
}

const VERDICT = '<verdict>{"earned":["df-prm"]}</verdict>';

describe('VerdictSplitter', () => {
  it('passes plain text straight through and finds no verdict', () => {
    const s = new VerdictSplitter();
    expect(s.push('Seven, ')).toBe('Seven, ');
    expect(s.push('is lucky.')).toBe('is lucky.');
    expect(s.end()).toEqual({ text: '', earned: null });
  });

  it('strips a verdict at the end and parses it', () => {
    expect(run(['Nicely put.\n', VERDICT])).toEqual({ shown: 'Nicely put.\n', earned: ['df-prm'] });
  });

  it('reads an empty verdict as nothing earned, not as a missing one', () => {
    expect(run(['Not yet.', '<verdict>{"earned":[]}</verdict>'])).toEqual({ shown: 'Not yet.', earned: [] });
  });

  it('never lets the tag through when it is split across two or three chunks, at every split point', () => {
    const full = `Well said.\n${VERDICT}`;
    for (let i = 1; i < full.length; i++) {
      for (let j = i; j < full.length; j++) {
        const r = run([full.slice(0, i), full.slice(i, j), full.slice(j)]);
        expect(r.shown, `${i},${j}`).toBe('Well said.\n');
        expect(r.earned, `${i},${j}`).toEqual(['df-prm']);
      }
    }
  });

  it('streams text promptly: it holds back only what could still turn into the tag', () => {
    const s = new VerdictSplitter();
    expect(s.push('hello <ver')).toBe('hello ');
    expect(s.push('dict>')).toBe('');
    expect(s.push('{"earned":[]}</verdict>')).toBe('');
    expect(s.end()).toEqual({ text: '', earned: [] });
  });

  it('releases a held fragment that turns out not to be the tag', () => {
    const s = new VerdictSplitter();
    expect(s.push('a < b and <ver')).toBe('a < b and ');
    expect(s.push('y small')).toBe('<very small');
    expect(s.end()).toEqual({ text: '', earned: null });
  });

  it('flushes a trailing fragment of the tag at the end as ordinary text', () => {
    expect(run(['Hmm <ver'])).toEqual({ shown: 'Hmm <ver', earned: null });
  });

  it('treats the tag as a verdict only at the end: tag text used mid-sentence is not shown, and the prose after it still is', () => {
    const r = run(['I could write <verdict> here but that would be silly. ', 'Anyway, nicely put.\n', VERDICT]);
    expect(r.shown).not.toMatch(/verdict/i);
    expect(r.shown).toContain('but that would be silly.');
    expect(r.shown).toContain('Anyway, nicely put.');
    expect(r.earned).toEqual(['df-prm']);
  });

  it('shows no verdict text for a tag with no verdict at the end', () => {
    expect(run(['Sure. <verdict>']).shown).not.toMatch(/verdict/i);
  });

  it('gives no verdict for malformed JSON, a missing closing tag, the wrong shape or the wrong types', () => {
    for (const tail of ['<verdict>{earned: [df-prm]}</verdict>', '<verdict>{"earned":["df-prm"]}', '<verdict>["df-prm"]</verdict>', '<verdict>{"earned":"df-prm"}</verdict>', '<verdict>{"earned":[1,2]}</verdict>', '<verdict></verdict>', '<verdict>{"earned":["a"]}</verdict> and more words']) {
      const r = run(['Text. ', tail]);
      expect(r.earned, tail).toBeNull();
      expect(r.shown, tail).not.toMatch(/<\/?verdict>/);
    }
  });

  it('uses the last verdict when there are two', () => {
    expect(run(['One. <verdict>{"earned":["a"]}</verdict> Two. <verdict>{"earned":["df-prm"]}</verdict>']).earned).toEqual(['df-prm']);
  });

  it('ignores whitespace around the verdict', () => {
    expect(run(['Fine.\n\n  <verdict>\n{"earned": ["df-prm"]}\n</verdict>\n  \n']).earned).toEqual(['df-prm']);
  });

  it('copes with an empty reply', () => {
    expect(run([])).toEqual({ shown: '', earned: null });
    expect(run(['', ''])).toEqual({ shown: '', earned: null });
  });
});
