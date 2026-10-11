import { mergeProgress, emptyProgress, parseProgress } from '../../core/progress';
import { SchemaError, type Progress } from '../../core/schema';
import type { Env, KVLike } from './env';
import { KV_MIN_WRITE_INTERVAL_MS } from './ratelimit';
import { fail, json, readLimited } from './http';

const KEY = 'progress';
const MAX_BODY = 16 * 1024;

/** When this isolate last wrote the record: KV refuses a second write to a key within a second */
const lastWrite = new WeakMap<KVLike, number>();

async function stored(env: Env): Promise<Progress> {
  const raw = await env.PROGRESS.get(KEY);
  if (raw === null) return emptyProgress();
  try {
    return parseProgress(JSON.parse(raw));
  } catch {
    return emptyProgress(); // a corrupt record is replaced by the next save rather than blocking the visitor
  }
}

/**
 * GET returns the stored progress; PUT merges the sent progress into it and returns the result, so
 * a sync is one PUT and needs no GET before it. A PUT that changes nothing writes nothing, and one
 * that arrives within a second of the last write is told to wait (429) rather than sent to KV to fail.
 */
export async function handleProgress(req: Request, env: Env, now: () => number = Date.now): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'PUT') return fail(405, 'method not allowed', { Allow: 'GET, PUT' });
  try {
    if (req.method === 'GET') return json(200, await stored(env));
    const body = await readLimited(req, MAX_BODY);
    if (body === null) return fail(413, 'progress is too large');
    let incoming: Progress;
    try {
      incoming = parseProgress(JSON.parse(body));
    } catch (e) {
      return fail(400, e instanceof SchemaError ? e.message : 'not valid JSON');
    }
    const before = await stored(env);
    const merged = mergeProgress(before, incoming);
    if (JSON.stringify(merged) === JSON.stringify(before)) return json(200, merged); // nothing new: no write
    const wait = (lastWrite.get(env.PROGRESS) ?? -Infinity) + KV_MIN_WRITE_INTERVAL_MS - now();
    if (wait > 0) return fail(429, 'saved a moment ago, try again', { 'Retry-After': String(Math.ceil(wait / 1000)) });
    lastWrite.set(env.PROGRESS, now());
    await env.PROGRESS.put(KEY, JSON.stringify(merged));
    return json(200, merged);
  } catch {
    return fail(503, 'storage is unavailable');
  }
}
