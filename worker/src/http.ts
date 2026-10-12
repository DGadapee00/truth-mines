/** A JSON response. Error bodies carry a short message and nothing from upstream or from internals. */
export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

export const fail = (status: number, message: string, headers: Record<string, string> = {}) => json(status, { error: message }, headers);

/** Read a request body as text, refusing anything over `max` bytes (by header first, then by what actually arrived). */
export async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > max) return null;
  const text = await req.text();
  return new TextEncoder().encode(text).length > max ? null : text;
}
