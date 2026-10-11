import { mergeProgress, emptyProgress, parseProgress } from '../../core/progress';
import { SchemaError, type Progress } from '../../core/schema';
import type { Env } from './env';
import { fail, json, readLimited } from './http';

const KEY = 'progress';
const MAX_BODY = 16 * 1024;

async function stored(env: Env): Promise<Progress> {
  const raw = await env.PROGRESS.get(KEY);
  if (raw === null) return emptyProgress();
  try {
    return parseProgress(JSON.parse(raw));
  } catch {
    return emptyProgress(); // a corrupt record is replaced by the next save rather than blocking the visitor
  }
}

/** GET returns the stored progress; PUT merges the sent progress into it and returns the result. */
export async function handleProgress(req: Request, env: Env): Promise<Response> {
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
    const merged = mergeProgress(await stored(env), incoming);
    await env.PROGRESS.put(KEY, JSON.stringify(merged));
    return json(200, merged);
  } catch {
    return fail(503, 'storage is unavailable');
  }
}
