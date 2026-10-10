/**
 * The number theory plane's data (data/plane-number-theory.json, from pipeline/plane_nt.py) and
 * the sieve rules, checked with code written here: plain trial division and a seeded shuffle.
 * Needs `python -m pipeline` to have run (CI runs it first).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLANE_SCHEMA_VERSION, SchemaError, parsePlane, type PlaneFile } from '../schema';
import { createSieve, nearestSample } from '../sieve';

const root = new URL('../../', import.meta.url);
const url = new URL('data/plane-number-theory.json', root);
if (!existsSync(url)) throw new Error('data/plane-number-theory.json is missing: run `npm run data` (python -m pipeline) first');
const raw = JSON.parse(readFileSync(url, 'utf8')) as unknown;
const plane: PlaneFile = parsePlane(raw);

const factorsOf = (n: number): number[] => {
  const out: number[] = [];
  let m = n;
  for (let d = 2; d * d <= m; d++) {
    while (m % d === 0) {
      out.push(d);
      m /= d;
    }
  }
  if (m > 1) out.push(m);
  return out;
};
const isPrime = (n: number) => n >= 2 && factorsOf(n).length === 1;
const PRIMES = Array.from({ length: 99 }, (_, i) => i + 2).filter(isPrime);

/** mulberry32, so the shuffles are the same every run */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = <T>(xs: T[], r: () => number): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
};

describe('parsePlane', () => {
  it('reads the built file', () => {
    expect(plane.schema_version).toBe(PLANE_SCHEMA_VERSION);
    expect(plane.road.columns).toHaveLength(100);
  });
  it('refuses a file of another version, or without its parts', () => {
    expect(() => parsePlane({ ...(raw as object), schema_version: 99 })).toThrow(SchemaError);
    expect(() => parsePlane(null)).toThrow(SchemaError);
    expect(() => parsePlane({ ...(raw as object), road: {} })).toThrow(SchemaError);
    expect(() => parsePlane({ ...(raw as object), overlook: { samples: [], windows: [] } })).toThrow(SchemaError);
  });
});

describe('the road', () => {
  it('has every number built from its prime factors', () => {
    for (const c of plane.road.columns) {
      expect(c.factors).toEqual(factorsOf(c.n));
      expect(c.factors.reduce((a, b) => a * b, 1)).toBe(c.n);
      expect(c.factors.every(isPrime)).toBe(true);
      expect(c.kind).toBe(c.n === 1 ? 'unit' : isPrime(c.n) ? 'prime' : 'composite');
    }
  });
  it('has a stack of one block per factor, a prime as a single monolith, and a thread per block', () => {
    for (const c of plane.road.columns) {
      if (c.kind === 'composite') {
        expect(c.parts.map((p) => p.prime)).toEqual(c.factors);
        expect(c.threads).toHaveLength(c.factors.length);
      } else if (c.kind === 'prime') {
        expect(c.parts).toHaveLength(1);
        expect(c.parts[0]?.form).toBe('monolith');
        expect(c.threads).toHaveLength(0);
      } else expect(c.parts).toHaveLength(0);
    }
  });
  it('gives each of the 25 primes a colour', () => {
    expect(plane.primes.map((p) => p.p)).toEqual(PRIMES);
    expect(new Set(plane.primes.map((p) => p.color)).size).toBe(25);
  });
  it('has drafts for text, none of them reviewed', () => {
    expect(plane.texts.length).toBeGreaterThan(0);
    for (const t of plane.texts) expect(t.reviewed).toBe(false);
  });
});

describe('the sieve', () => {
  const play = (order: number[]) => {
    const s = createSieve(plane.plaza);
    for (const n of order) s.strike(n);
    // Strike whatever still stands, so every number has had its turn.
    for (const n of s.standing()) s.strike(n);
    return s.standing();
  };

  it('starts with 99 standing: 2 to 100', () => {
    expect(createSieve(plane.plaza).standing()).toEqual(Array.from({ length: 99 }, (_, i) => i + 2));
  });
  it('leaves exactly the 25 primes in any strike order', () => {
    expect(PRIMES).toHaveLength(25);
    const r = rng(2026);
    const nums = Array.from({ length: 99 }, (_, i) => i + 2);
    for (let k = 0; k < 1000; k++) expect(play(shuffled(nums, r).slice(0, Math.floor(r() * 100)))).toEqual(PRIMES);
    expect(play(nums.slice().reverse())).toEqual(PRIMES);
    expect(play(nums.filter((n) => !isPrime(n)))).toEqual(PRIMES);
  });
  it('knocks nothing more down once 2, 3, 5 and 7 have been struck', () => {
    const s = createSieve(plane.plaza);
    for (const p of [7, 3, 5, 2]) s.strike(p);
    expect(s.standing()).toEqual(PRIMES);
    for (const n of PRIMES) expect(s.strike(n)).toEqual([]);
  });
  it('crumbles the multiples after the struck number, in order', () => {
    const s = createSieve(plane.plaza);
    expect(s.strike(10)).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(s.isStanding(10)).toBe(true);
    // 10 itself still stands (it was struck, not crumbled), so 2 takes it; its other multiples are gone.
    const evens = Array.from({ length: 49 }, (_, i) => 2 * (i + 2));
    expect(s.strike(2)).toEqual(evens.filter((n) => n === 10 || n % 10 !== 0));
  });
  it('ignores a crumbled number, a second strike, 1 and numbers off the grid', () => {
    const s = createSieve(plane.plaza);
    s.strike(2);
    const after = s.standing();
    expect(s.strike(4)).toEqual([]);
    expect(s.strike(2)).toEqual([]);
    expect(s.strike(1)).toEqual([]);
    expect(s.strike(101)).toEqual([]);
    expect(s.strike(-3)).toEqual([]);
    expect(s.standing()).toEqual(after);
  });
  it('resets to the full grid', () => {
    const s = createSieve(plane.plaza);
    for (const n of [2, 3, 5, 7]) s.strike(n);
    s.reset();
    expect(s.standing()).toHaveLength(99);
    expect(s.strike(2)).toHaveLength(49);
  });
  it('uses exported multiples that are exactly the multiples after n', () => {
    for (const c of plane.plaza.grid) expect(plane.plaza.multiples[String(c.n)]).toEqual(Array.from({ length: 100 }, (_, i) => i + c.n + 1).filter((m) => m <= 100 && m % c.n === 0));
  });
});

describe('the overlook', () => {
  const by = new Map(plane.overlook.samples.map((s) => [s.x, s]));
  it('counts the primes at the known values', () => {
    expect([100, 1000, 10_000, 100_000, 1_000_000].map((x) => by.get(x)?.pi)).toEqual([25, 168, 1229, 9592, 78498]);
  });
  it('counts the primes up to 10,000 by trial division', () => {
    let count = 0;
    const upTo = new Map<number, number>();
    for (let n = 0; n <= 10_000; n++) {
      if (isPrime(n)) count++;
      upTo.set(n, count);
    }
    for (const s of plane.overlook.samples) if (s.x <= 10_000) expect(s.pi).toBe(upTo.get(s.x));
  });
  it('uses the natural logarithm, and the ratio is pi over the estimate', () => {
    for (const s of plane.overlook.samples) {
      expect(s.estimate).toBeCloseTo(s.x / Math.log(s.x), 3);
      expect(s.ratio).toBeCloseTo(s.pi / (s.x / Math.log(s.x)), 5);
    }
    const end = by.get(1_000_000);
    expect(Math.round(end?.estimate ?? 0)).toBe(72382);
    expect((end?.ratio ?? 0).toFixed(3)).toBe('1.084');
  });
  it('looks up the nearest sample and clamps beyond both ends', () => {
    const ss = plane.overlook.samples;
    expect(nearestSample(ss, -50)).toBe(ss[0]);
    expect(nearestSample(ss, 0)).toBe(ss[0]);
    expect(nearestSample(ss, 1e9)).toBe(ss.at(-1));
    expect(nearestSample(ss, 240)).toBe(ss.at(-1));
    for (const k of [1, 17, 120, 239]) {
      const s = ss[k] as (typeof ss)[number];
      expect(nearestSample(ss, s.s)).toBe(s);
      expect(nearestSample(ss, s.s + 0.1)).toBe(s);
    }
    const mid = ((ss[100]?.s ?? 0) + (ss[101]?.s ?? 0)) / 2;
    expect([ss[100], ss[101]]).toContain(nearestSample(ss, mid));
  });
});

describe('payload', () => {
  it('stays inside the 2 MB budget', () => {
    expect(readFileSync(url).length).toBeLessThan(2_000_000);
  });
});
