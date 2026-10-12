import { describe, expect, it } from 'vitest';
import { createDoing, primeFactors } from '../../../core/doing';
import type { Line } from '../copy';
import { createActivity, type ActivityPlane } from './activity';

/** A plane that is just the rules: what stands, and what has been revealed */
function world(zone: 'road' | 'plaza' | 'overlook' = 'road', looking: number | null = null) {
  const standing = new Set(Array.from({ length: 99 }, (_, i) => i + 2));
  const struck: number[] = [];
  const revealed = new Set<number>();
  const said: Line[] = [];
  const done: string[] = [];
  const doing = createDoing();
  const state = { zone, looking };
  const plane: ActivityPlane = {
    standing: () => [...standing].sort((a, b) => a - b),
    struck: () => [...struck],
    strike(n) {
      struck.push(n);
      for (let m = 2 * n; m <= 100; m += n) standing.delete(m);
    },
    reveal: (n) => revealed.add(n),
    isRevealed: (n) => revealed.has(n),
    labelOf: (n) => `${n} = ${primeFactors(n).join(' · ')}`,
  };
  const a = createActivity({ doing, plane, zone: () => state.zone, looking: () => state.looking, say: (l) => said.push(l), onDone: (k) => done.push(k) });
  return { a, doing, plane, said, done, revealed, struck, state };
}

describe('on the road', () => {
  it('a right answer for the stack in view takes it apart, and says what it was', () => {
    const w = world('road', 12);
    expect(w.a.utter('2, 2, 3')).toBe(true);
    expect(w.revealed.has(12)).toBe(true);
    expect(w.doing.facts().predicted).toEqual([12]);
    expect(w.said.at(-1)!.text).toBe('Yes. 12 = 2 · 2 · 3.');
  });

  it('works by voice words, powers and any order', () => {
    for (const [n, said] of [[12, 'three times two times two'], [72, '2 cubed times 3 squared'], [30, '5, 3, 2'], [97, 'ninety seven']] as const) {
      const w = world('road', n);
      expect(w.a.utter(said), said).toBe(true);
      expect(w.revealed.has(n), said).toBe(true);
    }
  });

  it('a stack can be named in the answer: "18 is 2, 3, 3", with nothing in view', () => {
    const w = world('road', null);
    expect(w.a.utter('18 is 2 times 3 times 3')).toBe(true);
    expect(w.revealed.has(18)).toBe(true);
  });

  it('a wrong answer takes nothing apart and says what is wrong, not what is right', () => {
    const w = world('road', 12);
    w.a.utter('2, 3');
    w.a.utter('4, 3');
    w.a.utter('2, 2, 3, 3');
    expect(w.revealed.size).toBe(0);
    expect(w.doing.facts().predicted).toEqual([]);
    expect(w.said.map((l) => l.text)).toEqual(['Those multiply to 6, not 12. Try again.', '4 is not a prime: it can be split further. Try again.', 'Those multiply to 36, not 12. Try again.']);
    for (const l of w.said) expect(l.text).not.toMatch(/2 · 2 · 3|2, 2, 3/);
  });

  it('with no stack in view and no column named, asks the visitor to look', () => {
    const w = world('road', null);
    expect(w.a.utter('2, 3')).toBe(true);
    expect(w.said.at(-1)!.id).toBe('road-look-first');
    expect(w.doing.facts().predicted).toEqual([]);
  });

  it('is finished at three different stacks, and says so once', () => {
    const w = world('road', 12);
    w.a.utter('2 2 3');
    w.state.looking = 18;
    w.a.utter('2 3 3');
    expect(w.done).toEqual([]);
    w.state.looking = 8;
    w.a.utter('2 2 2');
    expect(w.done).toEqual(['road']);
    w.state.looking = 20;
    w.a.utter('2 2 5');
    expect(w.done).toEqual(['road']);
  });

  it('a stack taken apart again is not counted twice', () => {
    const w = world('road', 12);
    w.a.utter('2 2 3');
    w.a.utter('2 2 3');
    expect(w.doing.facts().predicted).toEqual([12]);
    expect(w.said.at(-1)!.id).toBe('road-again');
  });

  it('what is not an answer goes on to Trurl', () => {
    const w = world('road', 12);
    for (const t of ['why is it always the same?', 'is it possible to split twelve some other way', 'hello trurl']) expect(w.a.utter(t), t).toBe(false);
    expect(w.said).toEqual([]);
  });

  it('on the overlook everything goes to Trurl', () => {
    const w = world('overlook', 12);
    expect(w.a.utter('2, 2, 3')).toBe(false);
  });
});

describe('in the plaza', () => {
  it('naming the next prime strikes it, and the next is the smallest still standing', () => {
    const w = world('plaza');
    for (const n of [2, 3, 5, 7]) expect(w.a.utter(`${n}`), `${n}`).toBe(true);
    expect(w.struck).toEqual([2, 3, 5, 7]);
    expect(w.doing.facts().struck).toEqual([2, 3, 5, 7]);
    expect(w.plane.standing()).toHaveLength(25);
  });

  it('also by pointing', () => {
    const w = world('plaza');
    w.a.name(2);
    expect(w.struck).toEqual([2]);
  });

  it('a wrong name strikes nothing and says why not, without saying which is right', () => {
    const w = world('plaza');
    w.a.utter('9');
    w.a.utter('4');
    expect(w.struck).toEqual([]);
    expect(w.said.map((l) => l.id)).toEqual(['sieve-not-next', 'sieve-not-next']);
    w.a.utter('2');
    w.a.utter('4');
    expect(w.said.at(-1)!.id).toBe('sieve-gone');
    w.a.utter('2');
    expect(w.said.at(-1)!.id).toBe('sieve-struck');
    w.a.utter('150');
    expect(w.said.at(-1)!.id).toBe('sieve-range');
    expect(w.struck).toEqual([2]);
    for (const l of w.said) expect(l.text).not.toMatch(/\b3\b/);
  });

  it('saying it is safe to stop is judged: not before 2, 3, 5 and 7, and right after them', () => {
    const w = world('plaza');
    w.a.utter('done');
    expect(w.said.at(-1)!.id).toBe('sieve-start');
    w.a.utter('2');
    w.a.utter("that's all");
    expect(w.said.at(-1)!.id).toBe('sieve-early');
    for (const n of [3, 5]) w.a.utter(String(n));
    w.a.utter('nothing more would fall');
    expect(w.said.at(-1)!.id).toBe('sieve-early'); // 7 x 7 = 49 is still standing
    expect(w.done).toEqual([]);
    w.a.utter('7');
    w.a.utter('I am done');
    expect(w.said.at(-1)!.id).toBe('sieve-stop');
    expect(w.done).toEqual(['sieve']);
    expect(w.doing.done('sieve')).toBe(true);
  });

  it('striking on after 7 is harmless; stopping is the visitor’s call', () => {
    const w = world('plaza');
    for (const n of [2, 3, 5, 7, 11]) w.a.utter(String(n));
    expect(w.struck).toEqual([2, 3, 5, 7, 11]);
    expect(w.done).toEqual([]);
    w.a.utter('done');
    expect(w.done).toEqual(['sieve']);
  });

  it('what is not an answer goes on to Trurl', () => {
    const w = world('plaza');
    for (const t of ['why did nothing fall after seven?', 'because every composite has a small prime factor', 'what is left']) expect(w.a.utter(t), t).toBe(false);
  });
});
