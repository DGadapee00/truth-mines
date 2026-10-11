import { describe, expect, it } from 'vitest';
import { LIMITS, rateLimit } from '../src/ratelimit';
import { KvWriteRateError, MemoryKV, StrictKV } from './helpers';

const T0 = Date.UTC(2026, 9, 11, 12, 0, 5); // 5 s into a minute

describe('rateLimit', () => {
  it('allows 30 Trurl requests in a minute and refuses the 31st with the time left', async () => {
    const kv = new MemoryKV();
    expect(LIMITS.trurl.limit).toBe(30);
    for (let i = 0; i < 30; i++) expect((await rateLimit(kv, 'trurl', T0 + i)).ok).toBe(true);
    const r = await rateLimit(kv, 'trurl', T0 + 100);
    expect(r).toEqual({ ok: false, retryAfterS: 55 });
  });

  it('allows 10 speech sessions in a minute and refuses the 11th', async () => {
    const kv = new MemoryKV();
    expect(LIMITS.stt.limit).toBe(10);
    for (let i = 0; i < 10; i++) expect((await rateLimit(kv, 'stt', T0)).ok).toBe(true);
    expect((await rateLimit(kv, 'stt', T0)).ok).toBe(false);
  });

  it('keeps a separate count per endpoint', async () => {
    const kv = new MemoryKV();
    for (let i = 0; i < 10; i++) await rateLimit(kv, 'stt', T0);
    expect((await rateLimit(kv, 'stt', T0)).ok).toBe(false);
    expect((await rateLimit(kv, 'trurl', T0)).ok).toBe(true);
    expect((await rateLimit(kv, 'progress', T0)).ok).toBe(true);
  });

  it('starts a fresh count in the next minute', async () => {
    const kv = new MemoryKV();
    for (let i = 0; i < 10; i++) await rateLimit(kv, 'stt', T0);
    expect((await rateLimit(kv, 'stt', T0)).ok).toBe(false);
    expect((await rateLimit(kv, 'stt', T0 + 60_000)).ok).toBe(true);
  });

  it('throws when KV is down, so the caller refuses rather than letting spend through', async () => {
    const kv = new MemoryKV();
    kv.failing = true;
    await expect(rateLimit(kv, 'trurl', T0)).rejects.toThrow();
  });

  it('treats a garbled counter as zero rather than locking out', async () => {
    const kv = new MemoryKV();
    kv.data.set(`rl:trurl:${Math.floor(T0 / 1000 / 60)}`, 'garbage');
    expect((await rateLimit(kv, 'trurl', T0)).ok).toBe(true);
  });
});

describe('rateLimit and KV’s one write a second per key', () => {
  it('writes a window’s counter at most once a second, however many requests arrive', async () => {
    let now = T0;
    const kv = new StrictKV(() => now);
    for (let i = 0; i < 25; i++) {
      now = T0 + i * 100; // ten requests a second for 2.5 s
      expect((await rateLimit(kv, 'trurl', now)).ok).toBe(true);
    }
    expect(kv.refused).toEqual([]);
    expect(kv.writes.length).toBe(3); // at 0, 1.0 and 2.0 s
    for (let i = 1; i < kv.writes.length; i++) expect(kv.writes[i]!.at - kv.writes[i - 1]!.at).toBeGreaterThanOrEqual(1000);
  });

  it('still counts every request, those not yet written included, and refuses the 31st', async () => {
    let now = T0;
    const kv = new StrictKV(() => now);
    for (let i = 0; i < 30; i++) {
      now = T0 + i * 20;
      expect((await rateLimit(kv, 'trurl', now)).ok).toBe(true);
    }
    now = T0 + 700;
    expect((await rateLimit(kv, 'trurl', now)).ok).toBe(false);
  });

  it('counts across the second a write is due: the pending ones go out with it', async () => {
    let now = T0;
    const kv = new StrictKV(() => now);
    for (let i = 0; i < 5; i++) await rateLimit(kv, 'stt', now + i);
    now = T0 + 1500;
    await rateLimit(kv, 'stt', now);
    expect(kv.data.get(`rl:stt:${Math.floor(T0 / 1000 / 60)}`)).toBe('6');
  });

  it('does not fail a request when KV refuses the counter’s write (another isolate wrote it a moment ago): it is counted in memory', async () => {
    const kv = new MemoryKV();
    kv.put = async () => {
      throw new KvWriteRateError('429');
    };
    for (let i = 0; i < 10; i++) expect((await rateLimit(kv, 'stt', T0 + i * 2000)).ok).toBe(true);
    expect((await rateLimit(kv, 'stt', T0 + 20_000)).ok).toBe(false);
  });
});
