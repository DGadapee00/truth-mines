import type { KVLike } from './env';

/** Per-endpoint limits. They bound the damage of a leaked secret; the real backstop is the spend limit at each provider. */
export const LIMITS = {
  trurl: { limit: 30, windowS: 60 },
  stt: { limit: 10, windowS: 60 },
  progress: { limit: 60, windowS: 60 },
} as const;

export type Bucket = keyof typeof LIMITS;

export type RateResult = { ok: true } | { ok: false; retryAfterS: number };

/**
 * A fixed-window counter in KV. KV is eventually consistent, so this is best effort: a burst can
 * overshoot a little, which is acceptable for one user. A KV failure throws, and the caller
 * refuses the request rather than letting spend through unmetered.
 */
export async function rateLimit(kv: KVLike, bucket: Bucket, nowMs: number): Promise<RateResult> {
  const { limit, windowS } = LIMITS[bucket];
  const window = Math.floor(nowMs / 1000 / windowS);
  const key = `rl:${bucket}:${window}`;
  const used = Number((await kv.get(key)) ?? '0') || 0;
  if (used >= limit) return { ok: false, retryAfterS: Math.max(1, (window + 1) * windowS - Math.floor(nowMs / 1000)) };
  await kv.put(key, String(used + 1), { expirationTtl: Math.max(60, windowS * 2) });
  return { ok: true };
}
