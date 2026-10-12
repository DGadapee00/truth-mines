import type { Env } from './env';

const LOCAL = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
  /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/,
];

export function originAllowed(origin: string, env: Pick<Env, 'ALLOWED_ORIGINS'>): boolean {
  const listed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return listed.includes(origin) || LOCAL.some((re) => re.test(origin));
}

/**
 * CORS headers for a request, or null when its Origin is not allowed (the production origin in
 * ALLOWED_ORIGINS, localhost, or a local-network dev address). A request with no Origin is not a
 * browser page; it gets no CORS headers and still has to present the secret.
 */
export function corsHeaders(req: Request, env: Pick<Env, 'ALLOWED_ORIGINS'>): Headers | null {
  const h = new Headers({ Vary: 'Origin' });
  const origin = req.headers.get('Origin');
  if (origin === null) return h;
  if (!originAllowed(origin, env)) return null;
  h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  h.set('Access-Control-Max-Age', '600');
  return h;
}
