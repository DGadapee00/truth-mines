/**
 * Earning by doing, as pure rules. An idea joins the visitor's map only if they did something that
 * shows they grasp it, in this session, and then explained it to Trurl. This file is the doing:
 *
 *   road   Take a stack apart. The visitor says or types the primes that multiply to a column's
 *          number ("2, 2, 3" for 12). A right answer assembles the stack; a few of them finish it.
 *   sieve  Predict the sieve. The visitor names the next prime to strike, each time, and says when it
 *          is safe to stop (nothing standing would fall any more).
 *
 * The app, the Worker and the tests all use these functions, so "the doing happened" means the same
 * thing everywhere. Nothing here draws anything or talks to anyone.
 */

/** The road and the plaza go up to this number (pipeline/config.yaml: number_theory_plane.limit; a test keeps them equal) */
export const PLANE_LIMIT = 100;
/** How many composite stacks the visitor takes apart before Trurl asks his question */
export const ROAD_STACKS_REQUIRED = 3;

export function primeFactors(n: number): number[] {
  const out: number[] = [];
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    while (m % p === 0) {
      out.push(p);
      m /= p;
    }
  }
  if (m > 1) out.push(m);
  return out;
}

export const isPrime = (n: number): boolean => Number.isInteger(n) && n >= 2 && primeFactors(n).length === 1;

// ---------------------------------------------------------------- what was said

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SUPER: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/**
 * Every whole number the text names, in order, with a power written out: "2² · 3", "2^2 x 3",
 * "two squared times three" and "2, 2, 3" all give 2, 2, 3. Digits and number words up to a hundred
 * are understood (speech to text gives either); anything else is ignored.
 */
export function parseNumbers(text: string): number[] {
  const t = text
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (s) => `^${[...s].map((c) => SUPER[c]).join('')}`)
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/\^\s*/g, ' ^ ')
    .replace(/[^a-z0-9^]+/g, ' ')
    .trim();
  if (!t) return [];
  const tokens = t.split(/\s+/);
  const out: number[] = [];
  let pendingTens = 0; // "twenty" waiting for a units word
  const flush = () => {
    if (pendingTens) out.push(pendingTens);
    pendingTens = 0;
  };
  const repeat = (extra: number) => {
    const last = out[out.length - 1];
    if (last !== undefined) for (let i = 0; i < extra; i++) out.push(last);
  };
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]!;
    if (w === '^') {
      flush();
      const e = Number(tokens[i + 1]);
      if (Number.isInteger(e) && e >= 2 && e <= 12 && out.length) {
        repeat(e - 1);
        i++;
      }
    } else if (/^\d+$/.test(w)) {
      flush();
      out.push(Number(w));
    } else if (w in UNITS) {
      if (pendingTens && UNITS[w]! >= 1 && UNITS[w]! <= 9) {
        out.push(pendingTens + UNITS[w]!);
        pendingTens = 0;
      } else {
        flush();
        out.push(UNITS[w]!);
      }
    } else if (w in TENS) {
      flush();
      pendingTens = TENS[w]!;
    } else if (w === 'hundred') {
      if (pendingTens) flush();
      if (out.length && out[out.length - 1] === 1) out[out.length - 1] = 100;
      else out.push(100);
    } else if (w === 'squared') {
      flush();
      repeat(1);
    } else if (w === 'cubed') {
      flush();
      repeat(2);
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/** The visitor is saying they are finished: "done", "that's all", "nothing more", "stop". */
export function sayingDone(text: string): boolean {
  return /\b(done|finished|stop|that'?s (all|it|enough)|nothing (more|else|left|else would fall)|no more|enough|all done)\b/i.test(text);
}

const FILLER = new Set([
  'a', 'an', 'and', 'are', 'as', 'by', 'comma', 'equals', 'factor', 'factors', 'i', 'is', 'it', 'its', 'let', 'me', 'multiply', 'multiplied', 'next', 'number', 'of', 'ok', 'okay', 'one',
  'plus', 'prime', 'primes', 'say', 'strike', 'struck', 'the', 'then', 'think', 'times', 'to', 'try', 'will', 'x', 'so', 'maybe', 'its', 'be',
]);

/**
 * Whether what was said is an answer to the activity ("2, 2, 3", "I think 12 is 2 times 2 times 3",
 * "strike 7") and not a remark to Trurl ("why did nothing fall after seven?"): it names numbers and
 * has at most one other word.
 */
export function isAttempt(text: string): boolean {
  if (parseNumbers(text).length === 0) return false;
  if (/\?/.test(text)) return false;
  const other = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !(w in UNITS) && !(w in TENS) && !['hundred', 'squared', 'cubed', 'st', 'nd', 'rd', 'th'].includes(w) && !FILLER.has(w));
  return other.length <= 1;
}

// ---------------------------------------------------------------- the road

export type FactorAnswer = { kind: 'right' } | { kind: 'nothing' } | { kind: 'not-prime'; value: number } | { kind: 'product'; got: number };

/** Whether `said` is exactly the primes that multiply to n, in any order. */
export function checkFactors(n: number, said: number[]): FactorAnswer {
  if (said.length === 0) return { kind: 'nothing' };
  const composite = said.find((x) => !isPrime(x));
  if (composite !== undefined) return { kind: 'not-prime', value: composite };
  const product = said.reduce((a, b) => a * b, 1);
  if (product !== n) return { kind: 'product', got: product };
  return { kind: 'right' };
}

/**
 * Which column a prediction is about. "12 is 2, 2, 3" names its own column (the first number is the
 * product of the rest); otherwise it is the one the visitor is looking at, and every number said is a factor.
 */
export function stackOf(said: number[], looking: number | null): { n: number; factors: number[] } | null {
  const [first, ...rest] = said;
  if (first !== undefined && rest.length >= 1 && first >= 2 && first <= PLANE_LIMIT && rest.reduce((a, b) => a * b, 1) === first) return { n: first, factors: rest };
  if (looking !== null && looking >= 2) {
    if (first === looking && rest.length >= 1) return { n: looking, factors: rest }; // "12, 2, 2, 3" or "12 = 2 x 3 x 3"
    return { n: looking, factors: said };
  }
  return null;
}

// ---------------------------------------------------------------- the sieve

export type NameAnswer = { kind: 'next' } | { kind: 'gone' } | { kind: 'not-next' } | { kind: 'out-of-range' };

/**
 * The next prime to strike is the smallest number still standing that has not been struck. A struck
 * number stays standing (it glows), so `struck` says which to skip. `standing` is ascending.
 */
export function checkNext(n: number, standing: readonly number[], struck: readonly number[] = []): NameAnswer {
  if (!Number.isInteger(n) || n < 2 || n > PLANE_LIMIT) return { kind: 'out-of-range' };
  if (!standing.includes(n)) return { kind: 'gone' };
  return n === standing.find((x) => !struck.includes(x)) ? { kind: 'next' } : { kind: 'not-next' };
}

/** Nothing standing would fall any more: the next number to strike has no multiple left to knock down (its square is past the limit). */
export function safeToStop(standing: readonly number[], struck: readonly number[] = [], limit = PLANE_LIMIT): boolean {
  const p = standing.find((x) => !struck.includes(x));
  return p === undefined || p * p > limit;
}

// ---------------------------------------------------------------- what was done

/** Plain facts about what the visitor did in this session. Numbers only: they go to the Worker, and nothing a visitor typed does. */
export interface DoingFacts {
  /** Columns whose stack the visitor took apart rightly, in order, no repeats */
  predicted: number[];
  /** Numbers struck in the sieve, in order, each one rightly named as the next prime */
  struck: number[];
  /** The visitor said it was safe to stop, and it was */
  stopped: boolean;
}

export const noFacts = (): DoingFacts => ({ predicted: [], struck: [], stopped: false });

export function roadDone(f: DoingFacts): boolean {
  return new Set(f.predicted.filter((n) => Number.isInteger(n) && n >= 4 && n <= PLANE_LIMIT && !isPrime(n))).size >= ROAD_STACKS_REQUIRED;
}

export function sieveDone(f: DoingFacts, limit = PLANE_LIMIT): boolean {
  if (!f.stopped) return false;
  // Every strike was the next prime, so the strikes are the primes in order from 2 ...
  const primes: number[] = [];
  for (let n = 2; primes.length < f.struck.length; n++) if (isPrime(n)) primes.push(n);
  if (!f.struck.every((n, i) => n === primes[i])) return false;
  // ... and none of the primes whose square is within the limit was skipped
  for (let n = 2; n * n <= limit; n++) if (isPrime(n) && !f.struck.includes(n)) return false;
  return true;
}

export type DoingKind = 'road' | 'sieve' | 'overlook';

/** Whether the doing for a kind of moment has happened. A moment with no doing (the overlook) is never "done": it earns nothing. */
export function doingDone(kind: DoingKind, f: DoingFacts): boolean {
  if (kind === 'road') return roadDone(f);
  if (kind === 'sieve') return sieveDone(f);
  return false;
}

/**
 * The session's doing: what the visitor has done since the page was opened. It is never saved, so a
 * verdict can only follow a doing from this visit. A sieve that was finished stays finished if the
 * plaza is then reset (the visitor is mid-conversation, not starting over).
 */
export function createDoing() {
  let facts = noFacts();
  let finishedSieve: { struck: number[]; stopped: boolean } | null = null;
  const latch = () => {
    if (!finishedSieve && sieveDone(facts)) finishedSieve = { struck: [...facts.struck], stopped: facts.stopped };
  };
  const snapshot = (): DoingFacts => ({ predicted: [...facts.predicted], struck: [...(finishedSieve ?? facts).struck], stopped: (finishedSieve ?? facts).stopped });
  return {
    facts: snapshot,
    done: (kind: DoingKind): boolean => doingDone(kind, snapshot()),
    revealed: (n: number): boolean => facts.predicted.includes(n),
    /** The visitor took column n apart rightly */
    recordStack(n: number): void {
      if (!facts.predicted.includes(n)) facts = { ...facts, predicted: [...facts.predicted, n] };
    },
    /** The visitor rightly named n as the next prime and it was struck */
    recordStrike(n: number): void {
      facts = { ...facts, struck: [...facts.struck, n] };
    },
    /** The visitor said it was safe to stop, and it was */
    recordStop(): void {
      facts = { ...facts, stopped: true };
      latch();
    },
    /** The plaza was reset: a new run of the sieve begins */
    resetSieve(): void {
      facts = { ...facts, struck: [], stopped: false };
    },
  };
}

export type Doing = ReturnType<typeof createDoing>;
