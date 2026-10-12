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

/**
 * xAI's streaming speech-to-text protocol, as documented at
 *   https://docs.x.ai/developers/model-capabilities/audio/speech-to-text
 *
 * THE DOC PAGE WAS NOT READABLE from the development sandbox (docs.x.ai is outside its network
 * allowlist), so this was written from the one independent client that implements it against that
 * page: Vercel's `@ai-sdk/xai` 5.0.20 (Apache-2.0), `src/xai-transcription-model.ts` and
 * `src/xai-transcription-model-options.ts`, whose docs link to the page above. What it fixes:
 *   - wss://api.x.ai/v1/stt, `Authorization: Bearer <key>` (a browser WebSocket cannot send that
 *     header, which is why this proxy exists). Everything else is a query parameter: `model`,
 *     `encoding` (pcm | mulaw | alaw | opus), `sample_rate`, `interim_results`, and `keyterm`
 *     once per term. There is no config frame.
 *   - The server first sends {"type":"transcript.created"}; audio is sent only after it.
 *   - Audio goes as binary frames. {"type":"audio.done"} marks the end of the audio.
 *   - The server sends {"type":"transcript.partial","text","is_final","speech_final"}: a partial
 *     with both flags true is a finished utterance, anything else is still in progress. When the
 *     audio is done it sends {"type":"transcript.done","text"}, the transcript for the session.
 *     {"type":"error","message"} reports a failure.
 * Still to confirm with a real key and the page itself: that `keyterm` is accepted on the
 * streaming endpoint and the 16 kHz setting is right for the Quest's microphone capture.
 *
 * The client's protocol (ours) is simpler: binary frames of 16 kHz 16-bit mono PCM, then a text
 * frame {"type":"end"} on release; back come {"type":"interim"|"final","text"}.
 */
export const STT_MODEL = 'grok-voice-transcribe-2.0';
export const STT_URL = 'wss://api.x.ai/v1/stt';
export const STT_SAMPLE_RATE = 16000;
/** Mathematical words the recogniser should expect (xAI "keyterm" prompting). */
export const KEYTERMS = ['prime', 'primes', 'sieve', 'composite', 'factor', 'factorization', 'divisor', 'multiple', 'monolith', 'Eratosthenes', 'Trurl', 'Möbius'];
/** A push-to-talk is seconds long; 60 s of 16 kHz 16-bit mono is 1.9 MB. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_SESSION_MS = 60_000;
/** How long to wait for xAI's transcript.created before giving up on the session. */
export const READY_TIMEOUT_MS = 8_000;
/** How long to wait for transcript.done after the audio ends before answering with what has arrived. */
export const END_GRACE_MS = 5_000;

export function sttUrl(): string {
  const q = new URLSearchParams({ model: STT_MODEL, encoding: 'pcm', sample_rate: String(STT_SAMPLE_RATE), interim_results: 'true' });
  for (const k of KEYTERMS) q.append('keyterm', k);
  return `${STT_URL}?${q.toString()}`;
}

type Upstream = { type?: unknown; text?: unknown; is_final?: unknown; speech_final?: unknown };

function parse(raw: unknown): Upstream | null {
  if (typeof raw !== 'string') return null;
  try {
    const m = JSON.parse(raw) as unknown;
    return m && typeof m === 'object' ? (m as Upstream) : null;
  } catch {
    return null;
  }
}

const size = (d: unknown) => (typeof d === 'string' ? d.length : d instanceof ArrayBuffer ? d.byteLength : ArrayBuffer.isView(d) ? d.byteLength : 0);

/** Proxy one push-to-talk to xAI. The caller has already checked the secret, the origin and the rate limit. */
export async function handleStt(req: Request, env: Pick<Env, 'XAI_API_KEY'>, deps: SttDeps): Promise<Response> {
  if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return fail(426, 'a WebSocket upgrade is required', { Upgrade: 'websocket' });
  const offered = (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim());
  if (!offered.includes('trurl.v1')) return fail(400, 'subprotocol trurl.v1 is required');

  const { socket: client, response } = deps.accept(req);
  let upstream: WebSocketLike | null = null;
  let ready = false; // xAI has sent transcript.created: audio may flow
  const pending: (string | ArrayBuffer | Uint8Array)[] = [];
  const committed: string[] = []; // utterances xAI has finished
  let inProgress = ''; // the utterance xAI is still working on
  let bytes = 0;
  let frames = 0;
  let done = false;
  let ended = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const heard = () => [...committed, inProgress].filter(Boolean).join(' ');
  const finish = (code: number, reason: string) => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
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
  const answer = (text: string) => {
    if (done) return;
    client.send(JSON.stringify({ type: 'final', text }));
    finish(1000, 'final');
  };
  timers.push(setTimeout(() => finish(1000, 'time limit'), MAX_SESSION_MS));
  const readyTimer = setTimeout(() => finish(1011, 'speech service unavailable'), READY_TIMEOUT_MS);
  timers.push(readyTimer);
  const toUpstream = (data: string | ArrayBuffer | Uint8Array) => (ready && upstream ? upstream.send(data) : pending.push(data));

  client.addEventListener('message', (ev) => {
    if (done) return;
    const d = ev.data;
    if (typeof d === 'string') {
      if (parse(d)?.type !== 'end' || ended) return; // nothing else from the client reaches xAI
      if (frames === 0) {
        answer(''); // a tap with no audio: nothing was said, and xAI need not be asked
        return;
      }
      ended = true;
      toUpstream(JSON.stringify({ type: 'audio.done' }));
      timers.push(setTimeout(() => answer(heard()), END_GRACE_MS));
      return;
    }
    if (ended) return;
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

  deps
    .connectUpstream(sttUrl(), { Authorization: `Bearer ${env.XAI_API_KEY}` })
    .then((ws) => {
      if (done) {
        ws.close(1000, 'done');
        return;
      }
      upstream = ws;
      ws.addEventListener('message', (ev) => {
        const m = parse(ev.data);
        if (!m || done) return;
        const text = typeof m.text === 'string' ? m.text : '';
        switch (m.type) {
          case 'transcript.created':
            ready = true;
            clearTimeout(readyTimer);
            for (const p of pending.splice(0)) ws.send(p);
            break;
          case 'transcript.partial':
            if (m.is_final === true && m.speech_final === true) {
              if (text) committed.push(text);
              inProgress = '';
            } else {
              inProgress = text;
            }
            client.send(JSON.stringify({ type: 'interim', text: heard() }));
            break;
          case 'transcript.done':
            answer(text || heard());
            break;
          case 'error':
            finish(1011, 'speech service error'); // xAI's message is not passed on
            break;
        }
      });
      ws.addEventListener('close', () => finish(1000, 'closed'));
      ws.addEventListener('error', () => finish(1011, 'speech service error'));
    })
    .catch(() => finish(1011, 'speech service unavailable'));

  return response;
}
