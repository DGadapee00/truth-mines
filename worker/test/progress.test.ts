import { describe, expect, it } from 'vitest';
import { earn, emptyProgress, setResume } from '../../core/progress';
import { handleProgress } from '../src/progress';
import { StrictKV, makeEnv, req } from './helpers';

const T1 = '2026-10-10T21:00:00Z';
const T2 = '2026-10-10T22:00:00Z';
const T3 = '2026-10-11T08:00:00Z';

/** A clock that has moved on two seconds at every call, so successive saves are never within KV's one-write-a-second limit */
let clock = Date.UTC(2026, 9, 11);
const later = () => (clock += 2000);

const put = (env: ReturnType<typeof makeEnv>, body: unknown) => handleProgress(req('/api/progress', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) }), env, later);
const get = (env: ReturnType<typeof makeEnv>) => handleProgress(req('/api/progress'), env);

describe('GET /api/progress', () => {
  it('returns empty progress when nothing is stored', async () => {
    const res = await get(makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(emptyProgress());
  });

  it('is never cached', async () => {
    expect((await get(makeEnv())).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('PUT /api/progress', () => {
  it('stores progress and a later GET returns it', async () => {
    const env = makeEnv();
    const p = setResume(earn(emptyProgress(), ['1arith'], T1), 'number-theory', 'nt-1', { pos: [0, 0, 12.5], yaw: 0 }, T1);
    const res = await put(env, p);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(p);
    expect(await (await get(env)).json()).toEqual(p);
  });

  it('merges: two devices’ earned ideas both survive', async () => {
    const env = makeEnv();
    await put(env, earn(emptyProgress(), ['1arith'], T1));
    const res = await put(env, earn(emptyProgress(), ['df-prm'], T2));
    expect(((await res.json()) as { earned: string[] }).earned).toEqual(['1arith', 'df-prm']);
    expect(((await (await get(env)).json()) as { earned: string[] }).earned).toEqual(['1arith', 'df-prm']);
  });

  it('does not let an older pathway entry overwrite a newer one', async () => {
    const env = makeEnv();
    await put(env, setResume(emptyProgress(), 'number-theory', 'nt-1', { pos: [0, 0, 20], yaw: 1 }, T3));
    const res = await put(env, setResume(emptyProgress(), 'number-theory', 'nt-1', { pos: [0, 0, 1], yaw: 0 }, T1));
    expect(((await res.json()) as { pathways: Record<string, { resume: { pos: number[] } }> }).pathways['number-theory']!.resume.pos).toEqual([0, 0, 20]);
  });

  it('refuses invalid JSON, the wrong schema version and the wrong shape with 400', async () => {
    const env = makeEnv();
    for (const body of ['{nope', JSON.stringify({ ...emptyProgress(), schema_version: 2 }), JSON.stringify({ earned: 'x' }), 'null', '[]']) {
      const res = await put(env, body);
      expect(res.status, body).toBe(400);
    }
    expect(env.PROGRESS.data.size).toBe(0);
  });

  it('refuses a body over 16 KB with 413, by header and by size', async () => {
    const env = makeEnv();
    const big = { ...emptyProgress(), earned: Array.from({ length: 2000 }, (_, i) => `label-number-${i}`) };
    expect((await put(env, big)).status).toBe(413);
    const lie = req('/api/progress', { method: 'PUT', body: '{}', headers: { 'Content-Length': '99999' } });
    expect((await handleProgress(lie, env)).status).toBe(413);
  });

  it('answers 503 without internals when KV is down, on both GET and PUT', async () => {
    const env = makeEnv();
    env.PROGRESS.failing = true;
    for (const res of [await get(env), await put(env, emptyProgress())]) {
      expect(res.status).toBe(503);
      expect(JSON.stringify(await res.json())).not.toMatch(/kv down|stack|at Object/i);
    }
  });

  it('treats a corrupt stored value as empty rather than failing the visitor for good', async () => {
    const env = makeEnv();
    env.PROGRESS.data.set('progress', '{corrupt');
    const p = earn(emptyProgress(), ['1arith'], T1);
    expect(await (await put(env, p)).json()).toEqual(p);
  });

  it('refuses other methods with 405', async () => {
    expect((await handleProgress(req('/api/progress', { method: 'DELETE' }), makeEnv())).status).toBe(405);
    expect((await handleProgress(req('/api/progress', { method: 'POST', body: '{}' }), makeEnv())).status).toBe(405);
  });
});

describe('KV writes from /api/progress', () => {
  const strict = () => {
    let now = Date.UTC(2026, 9, 11, 12);
    const kv = new StrictKV(() => now);
    return { env: makeEnv({ PROGRESS: kv }), kv, at: (ms: number) => (now = ms), clock: () => now };
  };
  const send = (t: ReturnType<typeof strict>, p: unknown) => handleProgress(req('/api/progress', { method: 'PUT', body: JSON.stringify(p) }), t.env, t.clock);

  it('a sync is one write of the record', async () => {
    const t = strict();
    expect((await send(t, earn(emptyProgress(), ['1arith'], T1))).status).toBe(200);
    expect(t.kv.writesTo('progress')).toBe(1);
  });

  it('a PUT that changes nothing writes nothing, so a fresh device or an idle sync costs no write', async () => {
    const t = strict();
    await send(t, emptyProgress());
    expect(t.kv.writes).toEqual([]);
    const p = earn(emptyProgress(), ['1arith'], T1);
    await send(t, p);
    t.at(t.clock() + 5000);
    expect((await send(t, p)).status).toBe(200);
    expect((await send(t, emptyProgress())).status).toBe(200);
    expect(t.kv.writesTo('progress')).toBe(1);
  });

  it('a second change within a second is told to wait (429, Retry-After), not sent to KV to fail, and goes through after the wait', async () => {
    const t = strict();
    await send(t, earn(emptyProgress(), ['1arith'], T1));
    t.at(t.clock() + 400);
    const res = await send(t, earn(emptyProgress(), ['df-prm'], T2));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('1');
    expect(t.kv.writesTo('progress')).toBe(1);
    t.at(t.clock() + 700);
    expect((await send(t, earn(emptyProgress(), ['df-prm'], T2))).status).toBe(200);
    expect(t.kv.writesTo('progress')).toBe(2);
    expect(((await (await get(t.env)).json()) as { earned: string[] }).earned).toEqual(['1arith', 'df-prm']);
  });
});
