import { STT_RATE } from './pcm';

export interface WebSocketLike {
  readyState: number;
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(d: string | ArrayBuffer | ArrayBufferView): void;
  close(): void;
}
export type WebSocketCtor = new (url: string, protocols: string[]) => WebSocketLike;

export interface SttConfig {
  workerUrl: string;
  secret: string;
  onInterim?: (text: string) => void;
  WebSocketImpl?: WebSocketCtor;
}

export class SttError extends Error {}

/** wss://<worker>/api/stt (ws:// for a local Worker) */
export function sttUrl(workerUrl: string): string {
  return `${workerUrl.replace(/\/+$/, '').replace(/^http/, 'ws')}/api/stt`;
}

/**
 * One push-to-talk to the Worker's speech-to-text proxy (worker/src/stt.ts): stream 16 kHz 16-bit
 * PCM with `send`, call `end` on release, and `result` resolves with the transcript. The secret
 * travels as a subprotocol, because a browser WebSocket cannot set headers and a URL would be logged.
 */
export function openStt(cfg: SttConfig) {
  let resolve!: (t: string) => void;
  let reject!: (e: Error) => void;
  const result = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  result.catch(() => undefined); // the caller reads it; an unread rejection is not an error of ours
  const noop = { send() {}, end() {}, cancel() {}, result, sampleRate: STT_RATE };
  if (!cfg.secret) {
    reject(new SttError('unauthorized'));
    return noop;
  }
  if (!cfg.workerUrl) {
    reject(new SttError('unavailable'));
    return noop;
  }
  const ws = new (cfg.WebSocketImpl ?? (WebSocket as unknown as WebSocketCtor))(sttUrl(cfg.workerUrl), [`bearer.${cfg.secret}`, 'trurl.v1']);
  ws.binaryType = 'arraybuffer';
  const held: ArrayBufferView[] = [];
  let opened = false;
  let ended = false;
  let settled = false;
  let heard = '';
  const settle = (text: string) => {
    if (settled) return;
    settled = true;
    resolve(text);
    try {
      ws.close();
    } catch {
      // already closed
    }
  };
  ws.onopen = () => {
    opened = true;
    for (const h of held.splice(0)) ws.send(h);
    if (ended) ws.send(JSON.stringify({ type: 'end' }));
  };
  ws.onmessage = (e) => {
    if (typeof e.data !== 'string') return;
    let m: { type?: unknown; text?: unknown };
    try {
      m = JSON.parse(e.data) as { type?: unknown; text?: unknown };
    } catch {
      return;
    }
    if (typeof m.text !== 'string') return;
    if (m.type === 'interim') {
      heard = m.text;
      cfg.onInterim?.(m.text);
    } else if (m.type === 'final') settle(m.text);
  };
  ws.onerror = () => undefined;
  ws.onclose = () => {
    if (settled) return;
    if (!opened) {
      settled = true;
      reject(new SttError('unavailable'));
    } else settle(heard);
  };
  return {
    sampleRate: STT_RATE,
    send(pcm: Int16Array): void {
      if (ended || settled) return;
      if (opened) ws.send(pcm);
      else held.push(pcm);
    },
    end(): void {
      if (ended || settled) return;
      ended = true;
      if (opened) ws.send(JSON.stringify({ type: 'end' }));
    },
    cancel(): void {
      settle('');
    },
    result,
  };
}

export type SttSession = ReturnType<typeof openStt>;
