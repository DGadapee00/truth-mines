import type { OverlookSample, Plaza } from './schema';

/**
 * The sieve plaza's rules as a small state machine. The pipeline decides which multiples fall
 * when a number is struck (`plaza.multiples`); this keeps track of what stands. Pure logic with
 * no rendering, so it can be tested against every strike order.
 */
export interface Sieve {
  /** The numbers still standing, ascending */
  standing(): number[];
  isStanding(n: number): boolean;
  /** Strike n. Returns the multiples that crumbled, in order; [] if n is not standing. */
  strike(n: number): number[];
  reset(): void;
}

export function createSieve(plaza: Pick<Plaza, 'grid' | 'multiples'>): Sieve {
  const all = plaza.grid.map((c) => c.n).sort((a, b) => a - b);
  let standing = new Set(all);
  return {
    standing: () => all.filter((n) => standing.has(n)),
    isStanding: (n) => standing.has(n),
    strike(n) {
      if (!standing.has(n)) return [];
      const fell = (plaza.multiples[String(n)] ?? []).filter((m) => standing.has(m));
      for (const m of fell) standing.delete(m);
      return fell;
    },
    reset() {
      standing = new Set(all);
    },
  };
}

/** The sample whose position along the overlook road is nearest `s`; clamps beyond both ends. */
export function nearestSample(samples: readonly OverlookSample[], s: number): OverlookSample {
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((samples[mid] as OverlookSample).s <= s) lo = mid;
    else hi = mid;
  }
  const a = samples[lo] as OverlookSample;
  const b = samples[hi] as OverlookSample;
  return s - a.s <= b.s - s ? a : b;
}
