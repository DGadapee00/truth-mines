import type { Env } from './env';
import { fail } from './http';

/** The slice of a WebSocket the proxy uses, so tests can use fakes. */
export interface WebSocketLike {
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message' | 'close' | 'error', fn: (ev: { data?: unknown; code?: number }) => void): void;
}

export interface SttDeps {
  /** Accept the client's upgrade: the Worker's end of the socket and the 101 response to return */
  accept(req: Request): { socket: WebSocketLike; response: Response };
  /** Open and resolve a connection to xAI, with the given headers */
  connectUpstream(url: string, headers: Record<string, string>): Promise<WebSocketLike>;
}

export const STT_MODEL = 'grok-voice-transcribe-2.0';
export const STT_URL = 'wss://api.x.ai/v1/stt';
/** Mathematical words the recogniser should expect (keyterm prompting). */
export const KEYTERMS = ['prime', 'primes', 'sieve', 'composite', 'factor', 'factorization', 'divisor', 'multiple', 'monolith', 'Eratosthenes', 'Trurl', 'Möbius'];
/** A push-to-talk is seconds long; 60 s of 16 kHz 16-bit mono is 1.9 MB. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_SESSION_MS = 60_000;

/**
 * The client's protocol (ours): binary frames of audio, then a text frame {"type":"end"} when the
 * button is released. Back come {"type":"interim"|"final","text":...}.
 *
 * UNVERIFIED against the live service (no key in development): the frames sent to xAI (a config
 * frame with the keyterms, then {"type":"end"}) and the names of the fields read back are
 * assumptions, kept in this file only. The first real key may need a small fix here.
 */
function transcript(raw: unknown): { text: string; final: boolean } | null {
  if (typeof raw !== 'string') return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const text = [m.text, m.transcript].find((x): x is string => typeof x === 'string');
  if (text === undefined) return null;
  const flag = [m.is_final, m.final, m.speech_final].find((x): x is boolean => typeof x === 'boolean');
  return { text, final: flag ?? m.type === 'final' };
}

const size = (d: unknown) => (typeof d === 'string' ? d.length : d instanceof ArrayBuffer ? d.byteLength : ArrayBuffer.isView(d) ? d.byteLength : 0);

/** Proxy one push-to-talk to xAI. The caller has already checked the secret, the origin and the rate limit. */
export async function handleStt(req: Request, env: Pick<Env, 'XAI_API_KEY'>, deps: SttDeps): Promise<Response> {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'a WebSocket upgrade is required', { Upgrade: 'websocket' });
  const offered = (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim());
  if (!offered.includes('trurl.v1')) return fail(400, 'subprotocol trurl.v1 is required');

  const { socket: client, response } = deps.accept(req);
  let upstream: WebSocketLike | null = null;
  const pending: (string | ArrayBuffer | Uint8Array)[] = [];
  let bytes = 0;
  let frames = 0;
  let done = false;
  let ended = false; // the button has been released

  const finish = (code: number, reason: string) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    try {
      client.close(code, reason);
    } catch {
      // already closed
    }
    try {
      upstream?.close(1000, 'done');
    } catch {
      // already closed
    }
  };
  const timer = setTimeout(() => finish(1000, 'time limit'), MAX_SESSION_MS);
  const toUpstream = (data: string | ArrayBuffer | Uint8Array) => (upstream ? upstream.send(data) : pending.push(data));

  client.addEventListener('message', (ev) => {
    if (done) return;
    const d = ev.data;
    if (typeof d === 'string') {
      let m: { type?: unknown } | null = null;
      try {
        m = JSON.parse(d) as { type?: unknown };
      } catch {
        return;
      }
      if (m?.type !== 'end') return; // nothing else from the client reaches xAI
      if (frames === 0) {
        client.send(JSON.stringify({ type: 'final', text: '' }));
        finish(1000, 'no audio');
        return;
      }
      ended = true;
      toUpstream(JSON.stringify({ type: 'end' }));
      return;
    }
    bytes += size(d);
    if (bytes > MAX_AUDIO_BYTES) {
      finish(1009, 'too much audio');
      return;
    }
    frames++;
    toUpstream(d as ArrayBuffer);
  });
  client.addEventListener('close', () => finish(1000, 'closed'));
  client.addEventListener('error', () => finish(1011, 'error'));

  const url = `${STT_URL}?model=${encodeURIComponent(STT_MODEL)}`;
  deps
    .connectUpstream(url, { Authorization: `Bearer ${env.XAI_API_KEY}` })
    .then((ws) => {
      if (done) {
        ws.close(1000, 'done');
        return;
      }
      upstream = ws;
      ws.addEventListener('message', (ev) => {
        const t = transcript(ev.data);
        if (!t || done) return;
        // A phrase xAI finalises while the button is still held is only an interim for the visitor:
        // the transcript is final once they have released and xAI has answered.
        const last = t.final && ended;
        client.send(JSON.stringify({ type: last ? 'final' : 'interim', text: t.text }));
        if (last) finish(1000, 'final');
      });
      ws.addEventListener('close', () => finish(1000, 'closed'));
      ws.addEventListener('error', () => finish(1011, 'speech service error'));
      ws.send(JSON.stringify({ type: 'config', interim_results: true, keyterms: KEYTERMS }));
      for (const p of pending.splice(0)) ws.send(p);
    })
    .catch(() => finish(1011, 'speech service unavailable'));

  return response;
}
