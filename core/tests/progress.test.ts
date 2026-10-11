/**
 * Progress is what the visitor has done, and nothing derivable. Two devices write it, maybe while
 * offline, so merging must lose no earned idea and give the same answer in any order.
 */
import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { earn, emptyProgress, mergeProgress, parseProgress, setResume, validResume } from '../progress';
import { parsePathways, PROGRESS_SCHEMA_VERSION, SchemaError, type PathwaysFile, type Progress } from '../schema';

const root = new URL('../../', import.meta.url);
const read = (p: string) => {
  const url = new URL(p, root);
  if (!existsSync(url)) throw new Error(`${p} is missing: run \`npm run data\` (python -m pipeline) first`);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
};
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Key order must not matter, so compare by sorted-key JSON. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

const T1 = '2026-10-10T21:00:00Z';
const T2 = '2026-10-10T22:00:00Z';
const T3 = '2026-10-11T08:30:00Z';

const sample: Progress = {
  schema_version: 1,
  earned: ['1arith'],
  pathways: { 'number-theory': { stretch: 'nt-1', resume: { pos: [0, 0, 12.5], yaw: 0 }, updated_at: T1 } },
  updated_at: T1,
};

// A small seeded generator, so the property tests are the same on every run.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDS = ['1arith', 'df-prm', 'infpn', 'ax-mp', 'efipi'];
const PLANES = ['number-theory', 'algebra-symmetry', 'logic'];
const STAMPS = [T1, T2, T3]; // few, so that ties happen

function generate(r: () => number): Progress {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const p = emptyProgress();
  p.earned = IDS.filter(() => r() < 0.5).sort();
  for (const plane of PLANES) {
    if (r() < 0.6) p.pathways[plane] = { stretch: pick(['nt-1', 'nt-2']), resume: { pos: [Math.floor(r() * 3), 0, Math.floor(r() * 3)], yaw: pick([0, 1.5]) }, updated_at: pick(STAMPS) };
  }
  p.updated_at = pick(STAMPS);
  return p;
}

describe('emptyProgress', () => {
  it('has nothing earned and is a valid progress file', () => {
    const p = emptyProgress();
    expect(p).toEqual({ schema_version: PROGRESS_SCHEMA_VERSION, earned: [], pathways: {}, updated_at: '1970-01-01T00:00:00Z' });
    expect(parseProgress(p)).toEqual(p);
  });
});

describe('parseProgress', () => {
  it('reads what the design shows', () => {
    expect(parseProgress(sample)).toEqual(sample);
  });

  it('rejects a wrong schema version, a non-array earned and a malformed resume', () => {
    expect(() => parseProgress({ ...sample, schema_version: 2 })).toThrow(/schema version 2/);
    expect(() => parseProgress({ ...sample, earned: '1arith' })).toThrow(SchemaError);
    expect(() => parseProgress({ ...sample, earned: ['1arith', ''] })).toThrow(SchemaError);
    const bad = copy(sample);
    (bad.pathways['number-theory']!.resume as unknown as { pos: number[] }).pos = [0, 0];
    expect(() => parseProgress(bad)).toThrow(/resume/);
    const nan = copy(sample);
    nan.pathways['number-theory']!.resume.yaw = Number.NaN;
    expect(() => parseProgress(nan)).toThrow(/resume/);
  });

  it('rejects things that are not objects, and timestamps that are not times', () => {
    for (const raw of [null, undefined, 3, 'x', []]) expect(() => parseProgress(raw)).toThrow(SchemaError);
    expect(() => parseProgress({ ...sample, updated_at: 'yesterday' })).toThrow(/updated_at/);
    const bad = copy(sample);
    bad.pathways['number-theory']!.updated_at = '2026-13-45T99:00:00Z';
    expect(() => parseProgress(bad)).toThrow(/updated_at/);
  });

  it('sorts and dedupes earned, and returns a copy', () => {
    const raw = { ...copy(sample), earned: ['infpn', '1arith', 'infpn'] };
    const p = parseProgress(raw);
    expect(p.earned).toEqual(['1arith', 'infpn']);
    p.earned.push('x');
    expect(raw.earned).toEqual(['infpn', '1arith', 'infpn']);
  });

  it('drops fields it does not know', () => {
    expect(parseProgress({ ...sample, extra: 1 })).toEqual(sample);
  });
});

describe('earn', () => {
  it('adds ids, keeps them sorted and stamps the time', () => {
    const p = earn(sample, ['df-prm'], T2);
    expect(p.earned).toEqual(['1arith', 'df-prm']);
    expect(p.updated_at).toBe(T2);
  });

  it('is idempotent: earning what is already earned changes nothing, not even the time', () => {
    const once = earn(sample, ['df-prm'], T2);
    expect(earn(once, ['df-prm'], T3)).toEqual(once);
    expect(earn(sample, [], T3)).toEqual(sample);
  });

  it('does not change its input', () => {
    const before = canon(sample);
    earn(sample, ['df-prm'], T2);
    expect(canon(sample)).toBe(before);
  });
});

describe('setResume', () => {
  it('records where the visitor stood in a pathway and when', () => {
    const p = setResume(sample, 'algebra-symmetry', 'as-1', { pos: [1, 0, 2], yaw: 0.5 }, T2);
    expect(p.pathways['algebra-symmetry']).toEqual({ stretch: 'as-1', resume: { pos: [1, 0, 2], yaw: 0.5 }, updated_at: T2 });
    expect(p.pathways['number-theory']).toEqual(sample.pathways['number-theory']);
    expect(p.updated_at).toBe(T2);
    expect(sample.pathways['algebra-symmetry']).toBeUndefined();
  });

  it('does not keep a reference to the caller’s position array', () => {
    const pos: [number, number, number] = [1, 0, 2];
    const p = setResume(sample, 'logic', 'l-1', { pos, yaw: 0 }, T2);
    pos[0] = 99;
    expect(p.pathways.logic!.resume.pos[0]).toBe(1);
  });
});

describe('mergeProgress', () => {
  it('keeps every earned id from both sides', () => {
    const a = earn(emptyProgress(), ['1arith'], T1);
    const b = earn(emptyProgress(), ['df-prm', 'infpn'], T2);
    expect(mergeProgress(a, b).earned).toEqual(['1arith', 'df-prm', 'infpn']);
  });

  it('per pathway, the later updated_at wins, in either order', () => {
    const older = setResume(emptyProgress(), 'number-theory', 'nt-1', { pos: [0, 0, 1], yaw: 0 }, T1);
    const newer = setResume(emptyProgress(), 'number-theory', 'nt-1', { pos: [0, 0, 9], yaw: 1 }, T2);
    for (const m of [mergeProgress(older, newer), mergeProgress(newer, older)]) expect(m.pathways['number-theory']!.resume.pos).toEqual([0, 0, 9]);
  });

  it('compares timestamps as times, not as text', () => {
    const a = setResume(emptyProgress(), 'logic', 'l-1', { pos: [1, 0, 0], yaw: 0 }, '2026-10-10T21:00:00.500Z');
    const b = setResume(emptyProgress(), 'logic', 'l-1', { pos: [2, 0, 0], yaw: 0 }, '2026-10-10T21:00:00Z');
    expect(mergeProgress(a, b).pathways.logic!.resume.pos[0]).toBe(1);
    expect(mergeProgress(b, a).pathways.logic!.resume.pos[0]).toBe(1);
  });

  it('breaks a tie the same way from both sides', () => {
    const a = setResume(emptyProgress(), 'logic', 'l-1', { pos: [1, 0, 0], yaw: 0 }, T2);
    const b = setResume(emptyProgress(), 'logic', 'l-1', { pos: [2, 0, 0], yaw: 0 }, T2);
    expect(canon(mergeProgress(a, b))).toBe(canon(mergeProgress(b, a)));
  });

  it('keeps pathways that only one side has, so a pathway on one device is not lost', () => {
    const a = setResume(emptyProgress(), 'logic', 'l-1', { pos: [1, 0, 0], yaw: 0 }, T1);
    const b = setResume(emptyProgress(), 'sets', 's-1', { pos: [2, 0, 0], yaw: 0 }, T1);
    expect(Object.keys(mergeProgress(a, b).pathways).sort()).toEqual(['logic', 'sets']);
  });

  it('takes the later of the two top-level times', () => {
    expect(mergeProgress({ ...emptyProgress(), updated_at: T1 }, { ...emptyProgress(), updated_at: T3 }).updated_at).toBe(T3);
  });

  it('merging a device that earned something offline with the stored copy loses nothing', () => {
    const stored = earn(sample, ['df-prm'], T2); // on the Worker
    const headset = earn(sample, ['infpn'], T3); // earned offline in the headset
    expect(mergeProgress(stored, headset).earned).toEqual(['1arith', 'df-prm', 'infpn']);
  });

  it('does not change either input', () => {
    const a = copy(sample);
    const b = earn(sample, ['df-prm'], T2);
    const [ca, cb] = [canon(a), canon(b)];
    mergeProgress(a, b);
    expect([canon(a), canon(b)]).toEqual([ca, cb]);
  });

  it('is commutative, associative and idempotent (400 seeded cases)', () => {
    const r = rng(20261011);
    for (let i = 0; i < 400; i++) {
      const [a, b, c] = [generate(r), generate(r), generate(r)];
      expect(canon(mergeProgress(a, b)), 'commutative').toBe(canon(mergeProgress(b, a)));
      expect(canon(mergeProgress(mergeProgress(a, b), c)), 'associative').toBe(canon(mergeProgress(a, mergeProgress(b, c))));
      expect(canon(mergeProgress(a, a)), 'idempotent').toBe(canon(a));
      const m = mergeProgress(a, b);
      for (const id of [...a.earned, ...b.earned]) expect(m.earned, 'nothing earned is lost').toContain(id);
      expect(canon(mergeProgress(m, a)), 'absorbs its parts').toBe(canon(m));
    }
  });

  it('gives a result that parses', () => {
    const r = rng(7);
    for (let i = 0; i < 50; i++) {
      const m = mergeProgress(generate(r), generate(r));
      expect(parseProgress(m)).toEqual(m);
    }
  });
});

describe('validResume', () => {
  const pathways = {
    schema_version: 2,
    pathways: [{ plane: 'number-theory', gated_on: 'df-prm', entry_requires: [], stretches: [{ id: 'nt-1', plane_data: 'plane-number-theory.json', landmarks: ['1arith'], moments: [] }] }],
  } as unknown as PathwaysFile;

  it('returns the saved stretch and position when the stretch still exists', () => {
    expect(validResume(sample, pathways, 'number-theory')).toEqual({ stretch: 'nt-1', resume: { pos: [0, 0, 12.5], yaw: 0 } });
  });

  it('returns null when nothing is saved for the plane', () => {
    expect(validResume(sample, pathways, 'logic')).toBeNull();
    expect(validResume(emptyProgress(), pathways, 'number-theory')).toBeNull();
  });

  it('returns null when the saved stretch is no longer in the pathways, so a stale save cannot strand the visitor', () => {
    const stale = setResume(sample, 'number-theory', 'nt-gone', { pos: [0, 0, 5], yaw: 0 }, T2);
    expect(validResume(stale, pathways, 'number-theory')).toBeNull();
    expect(validResume(sample, pathways, 'no-such-plane')).toBeNull();
  });

  it('returns a copy', () => {
    const v = validResume(sample, pathways, 'number-theory')!;
    v.resume.pos[2] = 99;
    expect(sample.pathways['number-theory']!.resume.pos[2]).toBe(12.5);
  });

  it('works against the built pathways: the saved nt-1 stretch exists', () => {
    const real = parsePathways(read('data/pathways.json'));
    expect(validResume(sample, real, 'number-theory')?.stretch).toBe('nt-1');
  });
});

describe('the progress JSON Schema', () => {
  const validate = new Ajv2020({ strict: false }).compile(read('docs/schemas/progress.schema.json') as object);

  it('accepts what parseProgress accepts', () => {
    const r = rng(11);
    for (const p of [emptyProgress(), sample, ...Array.from({ length: 30 }, () => generate(r))]) expect(validate(p), JSON.stringify(validate.errors?.slice(0, 2))).toBe(true);
  });

  it('rejects what parseProgress rejects', () => {
    for (const bad of [{ ...sample, schema_version: 2 }, { ...sample, earned: 'x' }, { ...sample, updated_at: 5 }, { ...sample, earned: [''] }, { ...sample, pathways: { logic: { stretch: 'l', resume: { pos: [1, 2], yaw: 0 }, updated_at: T1 } } }]) {
      expect(validate(bad)).toBe(false);
      expect(() => parseProgress(bad)).toThrow(SchemaError);
    }
  });
});
