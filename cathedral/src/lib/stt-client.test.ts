import { describe, expect, it } from 'vitest';
import { openStt, sttUrl, type WebSocketCtor } from './stt-client';

class FakeWS {
  static last: FakeWS;
  readyState = 0;
  sent: (string | ArrayBuffer | ArrayBufferView)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  binaryType = '';
  closed = false;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeWS.last = this;
  }
  send(d: string | ArrayBuffer | ArrayBufferView) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  say(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}
const Ctor = FakeWS as unknown as WebSocketCtor;
const cfg = { workerUrl: 'https://w.example/', secret: 'sekrit', WebSocketImpl: Ctor };

describe('sttUrl', () => {
  it('maps http and https to ws and wss and adds the path', () => {
    expect(sttUrl('https://w.example/')).toBe('wss://w.example/api/stt');
    expect(sttUrl('http://localhost:8787')).toBe('ws://localhost:8787/api/stt');
  });
});

describe('openStt', () => {
  it('offers the secret and trurl.v1 as subprotocols and never puts the secret in the URL', () => {
    openStt(cfg);
    expect(FakeWS.last.protocols).toEqual(['bearer.sekrit', 'trurl.v1']);
    expect(FakeWS.last.url).not.toContain('sekrit');
  });

  it('holds audio sent before the socket opens, then sends it in order', () => {
    const s = openStt(cfg);
    s.send(Int16Array.from([1, 2]));
    s.send(Int16Array.from([3, 4]));
    expect(FakeWS.last.sent).toHaveLength(0);
    FakeWS.last.open();
    expect(FakeWS.last.sent).toHaveLength(2);
    s.send(Int16Array.from([5]));
    expect(FakeWS.last.sent).toHaveLength(3);
  });

  it('sends end after the audio, once, and resolves with the final transcript', async () => {
    const s = openStt(cfg);
    FakeWS.last.open();
    s.send(Int16Array.from([1]));
    s.end();
    s.end();
    expect(FakeWS.last.sent.at(-1)).toBe(JSON.stringify({ type: 'end' }));
    expect(FakeWS.last.sent.filter((x) => typeof x === 'string')).toHaveLength(1);
    FakeWS.last.say({ type: 'final', text: 'why did nothing fall' });
    expect(await s.result).toBe('why did nothing fall');
    expect(FakeWS.last.closed).toBe(true);
  });

  it('shows interim text as it comes', () => {
    const seen: string[] = [];
    const s = openStt({ ...cfg, onInterim: (t) => seen.push(t) });
    FakeWS.last.open();
    s.send(Int16Array.from([1]));
    FakeWS.last.say({ type: 'interim', text: 'why' });
    FakeWS.last.say({ type: 'interim', text: 'why did' });
    expect(seen).toEqual(['why', 'why did']);
  });

  it('resolves with the last interim text if the socket closes without a final', async () => {
    const s = openStt(cfg);
    FakeWS.last.open();
    FakeWS.last.say({ type: 'interim', text: 'seven' });
    FakeWS.last.onclose?.({ code: 1006 });
    expect(await s.result).toBe('seven');
  });

  it('resolves with nothing for a silent session', async () => {
    const s = openStt(cfg);
    FakeWS.last.open();
    s.end();
    FakeWS.last.say({ type: 'final', text: '' });
    expect(await s.result).toBe('');
  });

  it('rejects as unavailable if the socket errors before it ever opens', async () => {
    const s = openStt(cfg);
    FakeWS.last.onerror?.();
    FakeWS.last.onclose?.({ code: 1006 });
    await expect(s.result).rejects.toThrow(/unavailable/);
  });

  it('ignores frames it cannot read', async () => {
    const s = openStt(cfg);
    FakeWS.last.open();
    FakeWS.last.onmessage?.({ data: 'garbage' });
    FakeWS.last.onmessage?.({ data: new ArrayBuffer(2) });
    FakeWS.last.say({ type: 'weird' });
    FakeWS.last.say({ type: 'final', text: 'ok' });
    expect(await s.result).toBe('ok');
  });

  it('does not connect without a secret or an address', async () => {
    for (const bad of [{ ...cfg, secret: '' }, { ...cfg, workerUrl: '' }]) {
      const s = openStt(bad);
      await expect(s.result).rejects.toThrow(/unavailable|unauthorized/);
    }
  });

  it('can be cancelled, closing the socket and resolving with nothing', async () => {
    const s = openStt(cfg);
    FakeWS.last.open();
    s.cancel();
    expect(FakeWS.last.closed).toBe(true);
    expect(await s.result).toBe('');
  });
});
