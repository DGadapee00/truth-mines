import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSieve } from '../sieve';
import { parsePlane } from '../schema';
import {
  PLANE_LIMIT,
  ROAD_STACKS_REQUIRED,
  checkFactors,
  checkNext,
  createDoing,
  doingDone,
  isAttempt,
  isPrime,
  noFacts,
  parseNumbers,
  primeFactors,
  roadDone,
  safeToStop,
  sayingDone,
  sieveDone,
  stackOf,
} from '../doing';

describe('primeFactors and isPrime', () => {
  it('factor with multiplicity, smallest first', () => {
    expect(primeFactors(12)).toEqual([2, 2, 3]);
    expect(primeFactors(97)).toEqual([97]);
    expect(primeFactors(96)).toEqual([2, 2, 2, 2, 2, 3]);
    expect(primeFactors(64)).toEqual([2, 2, 2, 2, 2, 2]);
  });
  it('agree with trial division for 2 to the limit', () => {
    for (let n = 2; n <= PLANE_LIMIT; n++) {
      expect(primeFactors(n).reduce((a, b) => a * b, 1)).toBe(n);
      expect(isPrime(n)).toBe(Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0));
    }
  });
  it('1, 0, negatives and fractions are not prime', () => {
    for (const n of [1, 0, -3, 2.5]) expect(isPrime(n)).toBe(false);
  });
});

describe('parseNumbers', () => {
  const cases: [string, number[]][] = [
    ['2, 2, 3', [2, 2, 3]],
    ['2 2 3', [2, 2, 3]],
    ['2 x 2 x 3', [2, 2, 3]],
    ['2 · 2 · 3', [2, 2, 3]],
    ['2*2*3', [2, 2, 3]],
    ['two times two times three', [2, 2, 3]],
    ['Two, two and three.', [2, 2, 3]],
    ['12 = 2 × 2 × 3', [12, 2, 2, 3]],
    ['2² · 3', [2, 2, 3]],
    ['2^2 x 3', [2, 2, 3]],
    ['2 ^ 3', [2, 2, 2]],
    ['2⁵ · 3', [2, 2, 2, 2, 2, 3]],
    ['two squared times three', [2, 2, 3]],
    ['three cubed', [3, 3, 3]],
    ['twenty-one', [21]],
    ['twenty one', [21]],
    ['ninety seven', [97]],
    ['a hundred', [100]],
    ['one hundred', [100]],
    ['seven', [7]],
    ['forty', [40]],
    ['thirty and five', [30, 5]],
    ['I think it is 3 and 5', [3, 5]],
    ['no numbers here', []],
    ['', []],
    ['the 7th', [7]],
  ];
  it.each(cases)('%s', (text, want) => {
    expect(parseNumbers(text)).toEqual(want);
  });
  it('never yields NaN or a negative number, whatever it is given', () => {
    for (const t of ['- 3', '3-', '^', '^ ^ 2', '2 ^', 'squared', 'cubed', '2 ^ 99', 'hundred', 'twenty twenty']) {
      for (const n of parseNumbers(t)) expect(Number.isInteger(n) && n >= 0).toBe(true);
    }
  });
});

describe('sayingDone', () => {
  it.each(['done', 'I am done', "that's all", 'thats it', 'nothing more would fall', 'stop', 'no more', "that's enough", 'all done', 'finished'])('%s', (t) => {
    expect(sayingDone(t)).toBe(true);
  });
  it('does not mistake a number or a question for being done', () => {
    for (const t of ['2, 2, 3', 'seven', 'strike seven', 'why did that happen', 'what is a prime']) expect(sayingDone(t)).toBe(false);
  });
});

describe('isAttempt: an answer to the activity, or a remark to Trurl', () => {
  it.each(['2, 2, 3', '2 2 3', 'two times two times three', 'I think 12 is 2 times 2 times 3', 'strike 7', 'the next prime is 3', 'seven', 'twenty one', '12 = 2² · 3', 'it is 3 and 5', '97', 'maybe 2, 3, 5'])('%s', (t) => {
    expect(isAttempt(t)).toBe(true);
  });
  it.each(['why did nothing fall after seven?', 'nothing falls because every composite has a prime factor of at most 7', 'what is a prime', 'hello', '', 'because the square root of 100 is 10', 'the numbers left are the primes', 'is 91 prime?'])('%s', (t) => {
    expect(isAttempt(t)).toBe(false);
  });
});

describe('checkFactors', () => {
  it('accepts the primes that multiply to n, in any order', () => {
    expect(checkFactors(12, [2, 2, 3])).toEqual({ kind: 'right' });
    expect(checkFactors(12, [3, 2, 2])).toEqual({ kind: 'right' });
    expect(checkFactors(97, [97])).toEqual({ kind: 'right' });
    expect(checkFactors(64, [2, 2, 2, 2, 2, 2])).toEqual({ kind: 'right' });
  });
  it('says what is wrong without saying what is right', () => {
    expect(checkFactors(12, [2, 3])).toEqual({ kind: 'product', got: 6 });
    expect(checkFactors(12, [2, 2, 3, 3])).toEqual({ kind: 'product', got: 36 });
    expect(checkFactors(12, [4, 3])).toEqual({ kind: 'not-prime', value: 4 });
    expect(checkFactors(12, [12])).toEqual({ kind: 'not-prime', value: 12 });
    expect(checkFactors(12, [])).toEqual({ kind: 'nothing' });
    expect(checkFactors(12, [1, 12])).toEqual({ kind: 'not-prime', value: 1 });
  });
  it('is right for every n up to the limit exactly when the said primes are its prime factors', () => {
    for (let n = 2; n <= PLANE_LIMIT; n++) {
      expect(checkFactors(n, primeFactors(n)).kind).toBe('right');
      expect(checkFactors(n, [...primeFactors(n), 2]).kind).not.toBe('right');
    }
  });
});

describe('stackOf', () => {
  it('uses the column being looked at', () => {
    expect(stackOf([2, 2, 3], 12)).toEqual({ n: 12, factors: [2, 2, 3] });
    expect(stackOf([2, 2, 3], null)).toBeNull();
  });
  it('lets the visitor name the column: "12 is 2, 2, 3"', () => {
    expect(stackOf([12, 2, 2, 3], null)).toEqual({ n: 12, factors: [2, 2, 3] });
    expect(stackOf([12, 2, 2, 3], 18)).toEqual({ n: 12, factors: [2, 2, 3] });
  });
  it('ignores the column number said before the factors when it is the one looked at', () => {
    expect(stackOf([12, 2, 3, 3], 12)).toEqual({ n: 12, factors: [2, 3, 3] });
  });
  it('treats a single number as a factor of the focused column', () => {
    expect(stackOf([11], 11)).toEqual({ n: 11, factors: [11] });
    expect(stackOf([3], 12)).toEqual({ n: 12, factors: [3] });
  });
  it('never looks at the seed stone, 1', () => {
    expect(stackOf([1], 1)).toBeNull();
  });
});

describe('the sieve', () => {
  const upTo = (n: number) => Array.from({ length: n - 1 }, (_, i) => i + 2);
  it('the next prime to strike is the smallest standing number', () => {
    expect(checkNext(2, upTo(100))).toEqual({ kind: 'next' });
    expect(checkNext(4, upTo(100))).toEqual({ kind: 'not-next' });
    expect(checkNext(3, upTo(100))).toEqual({ kind: 'not-next' });
    const afterTwo = upTo(100).filter((n) => n === 2 || n % 2 === 1); // 2 itself stays standing, struck
    expect(checkNext(2, afterTwo, [2])).toEqual({ kind: 'not-next' }); // already struck
    expect(checkNext(3, afterTwo, [2])).toEqual({ kind: 'next' });
    expect(checkNext(9, afterTwo, [2])).toEqual({ kind: 'not-next' });
    expect(checkNext(4, afterTwo, [2])).toEqual({ kind: 'gone' });
    expect(checkNext(101, afterTwo, [2])).toEqual({ kind: 'out-of-range' });
    expect(checkNext(1, afterTwo, [2])).toEqual({ kind: 'out-of-range' });
  });
  it('it is safe to stop when the smallest standing number has no multiple left to knock down', () => {
    expect(safeToStop(upTo(100))).toBe(false);
    expect(safeToStop([2, 3, 5, 7, 11, 13, ...upTo(100).filter((n) => n > 13)], [2, 3, 5])).toBe(false); // 7 x 7 = 49 is still standing
    expect(safeToStop([2, 3, 5, 7, 11, 13, 17], [2, 3, 5, 7])).toBe(true); // 11 x 11 = 121 is past 100
    expect(safeToStop([])).toBe(true);
  });
});

describe('what counts as done', () => {
  const sieveRun = { predicted: [], struck: [2, 3, 5, 7], stopped: true };
  it('the road: three composite stacks taken apart', () => {
    expect(ROAD_STACKS_REQUIRED).toBe(3);
    expect(roadDone({ ...noFacts(), predicted: [12, 18] })).toBe(false);
    expect(roadDone({ ...noFacts(), predicted: [12, 18, 8] })).toBe(true);
    expect(roadDone({ ...noFacts(), predicted: [11, 13, 17, 19] })).toBe(false); // primes are not stacks
    expect(roadDone({ ...noFacts(), predicted: [12, 12, 12] })).toBe(false); // the same stack three times
    expect(roadDone({ ...noFacts(), predicted: [12, 18, 1000] })).toBe(false); // not on the road
  });
  it('the sieve: the primes struck in order, every prime up to the square root, and a right call to stop', () => {
    expect(sieveDone(sieveRun)).toBe(true);
    expect(sieveDone({ ...sieveRun, struck: [2, 3, 5, 7, 11] })).toBe(true); // striking on is harmless
    expect(sieveDone({ ...sieveRun, stopped: false })).toBe(false);
    expect(sieveDone({ ...sieveRun, struck: [2, 3, 5] })).toBe(false); // 7 never named
    expect(sieveDone({ ...sieveRun, struck: [2, 3, 7, 5] })).toBe(false); // out of order
    expect(sieveDone({ ...sieveRun, struck: [3, 5, 7] })).toBe(false);
    expect(sieveDone({ ...sieveRun, struck: [2, 3, 4, 5, 7] })).toBe(false); // 4 is not a prime
    expect(sieveDone({ ...sieveRun, struck: [] })).toBe(false);
  });
  it('the overlook has no doing, so it never completes', () => {
    expect(doingDone('overlook', { predicted: [12, 18, 8], struck: [2, 3, 5, 7], stopped: true })).toBe(false);
  });
});

describe('the session’s doing', () => {
  it('starts with nothing done', () => {
    const d = createDoing();
    expect(d.facts()).toEqual(noFacts());
    expect(d.done('road')).toBe(false);
    expect(d.done('sieve')).toBe(false);
  });
  it('records stacks once each, and finishes the road at three', () => {
    const d = createDoing();
    for (const n of [12, 12, 18, 8]) d.recordStack(n);
    expect(d.facts().predicted).toEqual([12, 18, 8]);
    expect(d.done('road')).toBe(true);
    expect(d.revealed(12)).toBe(true);
    expect(d.revealed(20)).toBe(false);
  });
  it('finishes the sieve only when it has been struck in order and stopped', () => {
    const d = createDoing();
    for (const n of [2, 3, 5, 7]) d.recordStrike(n);
    expect(d.done('sieve')).toBe(false);
    d.recordStop();
    expect(d.done('sieve')).toBe(true);
  });
  it('a finished sieve stays finished, with the facts of that run, when the plaza is reset; an unfinished one starts over', () => {
    const d = createDoing();
    d.recordStrike(2);
    d.resetSieve();
    expect(d.facts().struck).toEqual([]);
    for (const n of [2, 3, 5, 7]) d.recordStrike(n);
    d.recordStop();
    d.resetSieve();
    d.recordStrike(2);
    expect(d.done('sieve')).toBe(true);
    expect(d.facts()).toEqual({ predicted: [], struck: [2, 3, 5, 7], stopped: true });
  });
  it('hands out copies, so what it says it did cannot be changed from outside', () => {
    const d = createDoing();
    d.recordStack(12);
    d.facts().predicted.push(99);
    expect(d.facts().predicted).toEqual([12]);
  });
});

describe('against the built plane', () => {
  const url = new URL('../../data/plane-number-theory.json', import.meta.url);
  if (!existsSync(url)) throw new Error('data/plane-number-theory.json is missing: run `npm run data` first');
  const plane = parsePlane(JSON.parse(readFileSync(url, 'utf8')));

  it('the doing and the plane agree on the limit and on each stack’s primes', () => {
    expect(plane.plaza.grid.at(-1)!.n).toBe(PLANE_LIMIT);
    expect(plane.road.columns).toHaveLength(PLANE_LIMIT);
    for (const c of plane.road.columns) if (c.n >= 2) expect(primeFactors(c.n), `column ${c.n}`).toEqual(c.factors);
  });

  it('naming the next prime each time, the plaza leaves exactly the survivors, and it is safe to stop exactly then', () => {
    const sieve = createSieve(plane.plaza);
    const struck: number[] = [];
    let stopsSafe = -1;
    for (let guard = 0; guard < 30; guard++) {
      if (safeToStop(sieve.standing(), struck) && stopsSafe < 0) stopsSafe = struck.length;
      const next = sieve.standing().find((n) => !struck.includes(n))!;
      if (next === undefined) break;
      expect(checkNext(next, sieve.standing(), struck)).toEqual({ kind: 'next' });
      sieve.strike(next);
      struck.push(next);
      if (struck.length >= 6) break;
    }
    expect(struck.slice(0, 4)).toEqual([2, 3, 5, 7]);
    expect(stopsSafe).toBe(4); // after 2, 3, 5 and 7, not before
    expect(sieve.standing()).toEqual(plane.plaza.survivors);
    expect(plane.plaza.sufficient_primes).toEqual([2, 3, 5, 7]);
    expect(sieveDone({ predicted: [], struck: struck.slice(0, 4), stopped: true })).toBe(true);
  });

  it('it is never safe to stop earlier, and naming a composite or a number out of turn is never accepted', () => {
    const sieve = createSieve(plane.plaza);
    const struck: number[] = [];
    for (const p of [2, 3, 5]) {
      expect(safeToStop(sieve.standing(), struck)).toBe(false);
      for (const bad of sieve.standing().filter((n) => n !== sieve.standing().find((x) => !struck.includes(x)))) expect(checkNext(bad, sieve.standing(), struck).kind).not.toBe('next');
      sieve.strike(p);
      struck.push(p);
    }
    expect(safeToStop(sieve.standing(), struck)).toBe(false); // 7 is still to be struck: 7 x 7 = 49
  });
});
