import type { GroundingFile } from '../../core/schema';
import { authorize } from './auth';
import { corsHeaders } from './cors';
import type { Env } from './env';
import { fail, readLimited } from './http';
import { handleProgress } from './progress';
import { rateLimit, type Bucket } from './ratelimit';
import { RequestError, parseTrurlRequest } from './request';
import { handleStt, type SttDeps } from './stt';
import { streamTrurl } from './trurl';

/** Everything the Worker reaches outside itself for, so tests can replace it. */
export interface Deps {
  grounding: GroundingFile;
  fetch: typeof fetch;
  now(): number;
  stt: SttDeps;
}

const ROUTES: Record<string, Bucket> = { '/api/trurl': 'trurl', '/api/stt': 'stt', '/api/progress': 'progress' };
const MAX_TRURL_BODY = 32 * 1024;

function withCors(res: Response, cors: Headers): Response {
  if (res.status === 101) return res; // an upgrade carries its headers as they are
  const headers = new Headers(res.headers);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
}

async function trurl(req: Request, env: Env, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'method not allowed', { Allow: 'POST' });
  const body = await readLimited(req, MAX_TRURL_BODY);
  if (body === null) return fail(413, 'the request is too large');
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return fail(400, 'not valid JSON');
  }
  try {
    return streamTrurl(parseTrurlRequest(raw, deps.grounding), env, deps.grounding, deps.fetch);
  } catch (e) {
    if (e instanceof RequestError) return fail(e.status, e.message);
    throw e;
  }
}

/**
 * The Worker. Order matters: the origin is checked first, then the secret, and only an
 * authenticated request counts against a rate limit or reaches a route. Nothing in an error
 * response comes from upstream or from a provider key.
 */
export function createHandler(deps: Deps): (req: Request, env: Env) => Promise<Response> {
  return async (req, env) => {
    const cors = corsHeaders(req, env);
    if (cors === null) return fail(403, 'origin not allowed');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const respond = (res: Response) => withCors(res, cors);

    if (!(await authorize(req, env))) return respond(fail(401, 'unauthorized', { 'WWW-Authenticate': 'Bearer' }));

    const path = new URL(req.url).pathname;
    const bucket = ROUTES[path];
    if (!bucket) return respond(fail(404, 'not found'));

    try {
      const verdict = await rateLimit(env.PROGRESS, bucket, deps.now());
      if (!verdict.ok) return respond(fail(429, 'too many requests', { 'Retry-After': String(verdict.retryAfterS) }));
    } catch {
      return respond(fail(503, 'rate limiting is unavailable'));
    }

    if (bucket === 'progress') return respond(await handleProgress(req, env));
    if (bucket === 'stt') return respond(await handleStt(req, env, deps.stt));
    return respond(await trurl(req, env, deps));
  };
}
