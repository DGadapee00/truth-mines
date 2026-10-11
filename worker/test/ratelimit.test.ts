import { describe, expect, it } from 'vitest';
import { LIMITS, rateLimit } from '../src/ratelimit';
import { MemoryKV } from './helpers';

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
