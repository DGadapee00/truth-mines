import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES, STT_MODEL, handleStt, type SttDeps } from '../src/stt';
import { FAKE_XAI_KEY, SECRET, makeEnv } from './helpers';
import { FakeSocket } from './fake-socket';

function setup(opts: { upstreamFails?: boolean; subprotocols?: string } = {}) {
  const client = new FakeSocket();
  const upstream = new FakeSocket();
  const connected: { url: string; headers: Record<string, string> }[] = [];
  const deps: SttDeps = {
    accept: () => ({ socket: client, response: new Response('upgraded', { status: 200, headers: { 'Sec-WebSocket-Protocol': 'trurl.v1' } }) }),
    connectUpstream: async (url, headers) => {
      connected.push({ url, headers });
      if (opts.upstreamFails) throw new Error('boom');
      return upstream;
    },
  };
  const request = new Request('https://worker.test/api/stt', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': opts.subprotocols ?? `bearer.${SECRET}, trurl.v1` } });
  const env = makeEnv();
  const start = () => handleStt(request, env, deps);
  const settle = () => new Promise((r) => setTimeout(r, 5));
  return { client, upstream, connected, start, settle, env };
}

const audio = (n = 3200) => new ArrayBuffer(n);

describe('handleStt', () => {
  it('upgrades, and answers with the neutral subprotocol, never the secret', async () => {
    const t = setup();
    const res = await t.start();
    expect(res.headers.get('Sec-WebSocket-Protocol')).toBe('trurl.v1');
    expect(JSON.stringify([...res.headers])).not.toContain(SECRET);
  });

  it('refuses a request that is not a WebSocket upgrade, and one that does not offer trurl.v1', async () => {
    const env = makeEnv();
    const t = setup();
    const plain = await handleStt(new Request('https://worker.test/api/stt'), env, { accept: () => { throw new Error('no'); }, connectUpstream: async () => t.upstream });
    expect(plain.status).toBe(426);
    const noProto = setup({ subprotocols: `bearer.${SECRET}` });
    expect((await noProto.start()).status).toBe(400);
    expect(noProto.connected).toHaveLength(0);
  });

  it('opens xAI with the Worker’s key, the pinned model and mathematical keyterms, and sends the key nowhere else', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    expect(t.connected).toHaveLength(1);
    const c = t.connected[0]!;
    expect(c.url.startsWith('wss://api.x.ai/v1/stt')).toBe(true);
    expect(c.url).toContain(STT_MODEL);
    expect(c.headers.Authorization).toBe(`Bearer ${FAKE_XAI_KEY}`);
    const config = t.upstream.json()[0]!;
    expect(JSON.stringify(config)).toMatch(/sieve/);
    expect(JSON.stringify(config)).toMatch(/composite/);
    expect(JSON.stringify([t.client.sent, t.client.json()])).not.toContain(FAKE_XAI_KEY);
    expect(JSON.stringify(config)).not.toContain(FAKE_XAI_KEY);
  });

  it('relays audio up and interim and final transcripts down', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    t.client.emit('message', { data: audio() });
    t.client.emit('message', { data: audio() });
    expect(t.upstream.binary()).toBe(2);
    t.upstream.emit('message', { data: JSON.stringify({ type: 'transcript', text: 'why did', is_final: false }) });
    t.client.emit('message', { data: JSON.stringify({ type: 'end' }) });
    t.upstream.emit('message', { data: JSON.stringify({ type: 'transcript', text: 'why did nothing fall after seven', is_final: true }) });
    expect(t.client.json()).toEqual([
      { type: 'interim', text: 'why did' },
      { type: 'final', text: 'why did nothing fall after seven' },
    ]);
    expect(t.client.closed).not.toBeNull();
    expect(t.upstream.closed).not.toBeNull();
  });

  it('shows a phrase xAI finalises while the button is held as interim, and keeps the session open', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    t.client.emit('message', { data: audio() });
    t.upstream.emit('message', { data: JSON.stringify({ text: 'why did nothing fall', is_final: true }) });
    expect(t.client.json()).toEqual([{ type: 'interim', text: 'why did nothing fall' }]);
    expect(t.client.closed).toBeNull();
  });

  it('holds audio that arrives before xAI is connected and sends it once it is', async () => {
    const t = setup();
    const p = t.start();
    t.client.emit('message', { data: audio() });
    await p;
    await t.settle();
    expect(t.upstream.binary()).toBe(1);
  });

  it('forwards no text frame from the client except the end marker, so the client cannot reconfigure xAI', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    const before = t.upstream.sent.length;
    t.client.emit('message', { data: JSON.stringify({ type: 'config', model: 'something-expensive' }) });
    t.client.emit('message', { data: 'not json' });
    expect(t.upstream.sent.length).toBe(before);
    expect(t.client.sent).toEqual([]); // the session is untouched: nothing answered, nothing closed
    expect(t.client.closed).toBeNull();
    expect(t.upstream.closed).toBeNull();
  });

  it('answers a session with no audio by an empty final transcript, not an error, without asking xAI', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    t.client.emit('message', { data: JSON.stringify({ type: 'end' }) });
    expect(t.client.json()).toEqual([{ type: 'final', text: '' }]);
    expect(t.client.closed?.code).toBe(1000);
    expect(t.upstream.closed).not.toBeNull();
  });

  it('answers an empty or silent transcript from xAI as an empty final', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    t.client.emit('message', { data: audio() });
    t.client.emit('message', { data: JSON.stringify({ type: 'end' }) });
    t.upstream.emit('message', { data: JSON.stringify({ type: 'transcript', text: '', is_final: true }) });
    expect(t.client.json().at(-1)).toEqual({ type: 'final', text: '' });
  });

  it('understands the other plausible field names for a transcript', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    t.client.emit('message', { data: audio() });
    t.upstream.emit('message', { data: JSON.stringify({ transcript: 'seven', final: false }) });
    expect(t.client.json()).toEqual([{ type: 'interim', text: 'seven' }]);
  });

  it('ignores upstream frames it cannot read', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    t.upstream.emit('message', { data: 'garbage' });
    t.upstream.emit('message', { data: JSON.stringify({ unrelated: true }) });
    t.upstream.emit('message', { data: new ArrayBuffer(4) });
    expect(t.client.sent).toEqual([]);
  });

  it('closes both ends when either closes', async () => {
    const a = setup();
    await a.start();
    await a.settle();
    a.client.close(1001);
    expect(a.upstream.closed).not.toBeNull();
    const b = setup();
    await b.start();
    await b.settle();
    b.upstream.close(1006);
    expect(b.client.closed).not.toBeNull();
  });

  it('closes the client with a generic code when xAI cannot be reached, saying nothing of why', async () => {
    const t = setup({ upstreamFails: true });
    await t.start();
    await t.settle();
    expect(t.client.closed?.code).toBe(1011);
    expect(t.client.closed?.reason).not.toMatch(/boom|xai|x\.ai/i);
  });

  it('closes the session when the client sends more audio than a push-to-talk can hold', async () => {
    const t = setup();
    await t.start();
    await t.settle();
    const chunk = 512 * 1024;
    for (let sent = 0; sent <= MAX_AUDIO_BYTES + chunk && !t.client.closed; sent += chunk) t.client.emit('message', { data: audio(chunk) });
    expect(t.client.closed?.code).toBe(1009);
    expect(t.upstream.closed).not.toBeNull();
  });
});
