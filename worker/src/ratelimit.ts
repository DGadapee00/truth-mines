import type { KVLike } from './env';

/** Per-endpoint limits. They bound the damage of a leaked secret; the real backstop is the spend limit at each provider. */
export const LIMITS = {
  trurl: { limit: 30, windowS: 60 },
  stt: { limit: 10, windowS: 60 },
  progress: { limit: 60, windowS: 60 },
} as const;

export type Bucket = keyof typeof LIMITS;

export type RateResult = { ok: true } | { ok: false; retryAfterS: number };

/** Cloudflare KV allows one write per second to any one key; a faster write is refused. */
export const KV_MIN_WRITE_INTERVAL_MS = 1000;

interface Counter {
  /** The last value this isolate wrote: KV reads can lag, so never count less than this */
  written: number;
  /** Requests counted here and not yet in KV */
  pending: number;
  lastWriteMs: number;
}

const counters = new WeakMap<KVLike, Map<string, Counter>>();

function countersFor(kv: KVLike, keep: string): Map<string, Counter> {
  let m = counters.get(kv);
  if (!m) counters.set(kv, (m = new Map()));
  if (m.size > 32) for (const k of m.keys()) if (k !== keep) m.delete(k); // old windows
  return m;
}

/**
 * A fixed-window counter in KV, debounced: a window's key is written at most once a second however
 * many requests arrive. The requests between two writes are counted in memory (and folded into the
 * next write), so the count seen here is exact within an isolate and best effort across isolates,
 * and a burst can overshoot a little, which is acceptable for one user. A failed read throws, and the
 * caller refuses the request rather than letting spend through unmetered; a refused write is not an
 * error, since the count stays in memory and goes out with the next write.
 */
export async function rateLimit(kv: KVLike, bucket: Bucket, nowMs: number): Promise<RateResult> {
  const { limit, windowS } = LIMITS[bucket];
  const window = Math.floor(nowMs / 1000 / windowS);
  const key = `rl:${bucket}:${window}`;
  const mine = countersFor(kv, key);
  const c = mine.get(key) ?? { written: 0, pending: 0, lastWriteMs: -Infinity };
  mine.set(key, c);
  const stored = Number((await kv.get(key)) ?? '0') || 0;
  const used = Math.max(stored, c.written) + c.pending;
  if (used >= limit) return { ok: false, retryAfterS: Math.max(1, (window + 1) * windowS - Math.floor(nowMs / 1000)) };
  c.pending += 1;
  if (nowMs - c.lastWriteMs >= KV_MIN_WRITE_INTERVAL_MS) {
    c.lastWriteMs = nowMs; // an attempt counts, even a refused one: do not hammer the key
    const next = Math.max(stored, c.written) + c.pending;
    try {
      await kv.put(key, String(next), { expirationTtl: Math.max(60, windowS * 2) });
      c.written = next;
      c.pending = 0;
    } catch {
      /* kept in memory, written with the next one */
    }
  }
  return { ok: true };
}
