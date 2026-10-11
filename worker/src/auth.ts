import type { Env } from './env';

const BEARER = /^Bearer\s+(\S+)$/i;
const SUBPROTOCOL = 'bearer.';

/**
 * The secret a request presents: `Authorization: Bearer <secret>`, or, for a browser WebSocket
 * (which cannot set headers), a `bearer.<secret>` entry in `Sec-WebSocket-Protocol`.
 */
export function presentedSecret(req: Request): string | null {
  const m = BEARER.exec(req.headers.get('Authorization') ?? '');
  if (m) return m[1] ?? null;
  for (const part of (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',')) {
    const p = part.trim();
    if (p.startsWith(SUBPROTOCOL) && p.length > SUBPROTOCOL.length) return p.slice(SUBPROTOCOL.length);
  }
  return null;
}

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/**
 * Whether the request carries the app secret. Both sides are hashed first, so the comparison runs
 * over equal-length digests and visits every byte whatever the input. A Worker with no secret
 * configured refuses everything.
 */
export async function authorize(req: Request, env: Pick<Env, 'TRURL_APP_SECRET'>): Promise<boolean> {
  const want = env.TRURL_APP_SECRET;
  const got = presentedSecret(req);
  if (!want || got === null) return false;
  const [a, b] = await Promise.all([digest(want), digest(got)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
