import { afterEach, describe, expect, it, vi } from 'vitest';
import { END_GRACE_MS, KEYTERMS, MAX_AUDIO_BYTES, READY_TIMEOUT_MS, STT_MODEL, handleStt, sttUrl, type SttDeps } from '../src/stt';
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
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve(); // let the connection promise resolve (works under fake timers too)
  };
  /** Open the session; by default xAI also says transcript.created, so audio may flow. */
  const open = async (created = true) => {
    const res = await handleStt(request, makeEnv(), deps);
    await settle();
    if (created) say({ type: 'transcript.created' });
    return res;
  };
  const say = (m: unknown) => upstream.emit('message', { data: JSON.stringify(m) });
  const audio = (n = 3200) => client.emit('message', { data: new ArrayBuffer(n) });
  const release = () => client.emit('message', { data: JSON.stringify({ type: 'end' }) });
  return { client, upstream, connected, open, say, audio, release, settle };
}

afterEach(() => vi.useRealTimers());

describe('the upstream request', () => {
  it('goes to wss://api.x.ai/v1/stt with the pinned model, raw 16 kHz PCM, interim results and every keyterm', () => {
    const u = new URL(sttUrl());
    expect(`${u.protocol}//${u.host}${u.pathname}`).toBe('wss://api.x.ai/v1/stt');
    expect(u.searchParams.get('model')).toBe('grok-voice-transcribe-2.0');
    expect(STT_MODEL).toBe('grok-voice-transcribe-2.0');
    expect(u.searchParams.get('encoding')).toBe('pcm');
    expect(u.searchParams.get('sample_rate')).toBe('16000');
    expect(u.searchParams.get('interim_results')).toBe('true');
    expect(u.searchParams.getAll('keyterm')).toEqual(KEYTERMS);
    expect(u.searchParams.getAll('keyterm')).toEqual(expect.arrayContaining(['sieve', 'composite', 'prime']));
  });

  it('is opened with the Worker’s key as a bearer token, and sends no config frame', async () => {
    const t = setup();
    await t.open();
    expect(t.connected).toHaveLength(1);
    expect(t.connected[0]!.url).toBe(sttUrl());
    expect(t.connected[0]!.headers).toEqual({ Authorization: `Bearer ${FAKE_XAI_KEY}` });
    expect(t.upstream.sent).toEqual([]);
  });
});

describe('handleStt: the session', () => {
  it('upgrades, and answers with the neutral subprotocol, never the secret', async () => {
    const t = setup();
    const res = await t.open();
    expect(res.headers.get('Sec-WebSocket-Protocol')).toBe('trurl.v1');
    expect(JSON.stringify([...res.headers])).not.toContain(SECRET);
  });

  it('refuses a request that is not a WebSocket upgrade, and one that does not offer trurl.v1', async () => {
    const env = makeEnv();
    const t = setup();
    const plain = await handleStt(new Request('https://worker.test/api/stt'), env, { accept: () => { throw new Error('no'); }, connectUpstream: async () => t.upstream });
    expect(plain.status).toBe(426);
    const noProto = setup({ subprotocols: `bearer.${SECRET}` });
    const res = await noProto.open(false);
    expect(res.status).toBe(400);
    expect(noProto.connected).toHaveLength(0);
  });

  it('holds audio until xAI says transcript.created, then sends it in order', async () => {
    const t = setup();
    await t.open(false);
    t.audio();
    t.audio();
    expect(t.upstream.binary()).toBe(0);
    t.say({ type: 'transcript.created' });
    expect(t.upstream.binary()).toBe(2);
    t.audio();
    expect(t.upstream.binary()).toBe(3);
  });

  it('on release sends audio.done after the audio, and not before xAI is ready', async () => {
    const t = setup();
    await t.open(false);
    t.audio();
    t.release();
    expect(t.upstream.sent).toEqual([]);
    t.say({ type: 'transcript.created' });
    expect(t.upstream.sent).toHaveLength(2);
    expect(typeof t.upstream.sent[0]).not.toBe('string');
    expect(t.upstream.sent[1]).toBe(JSON.stringify({ type: 'audio.done' }));
  });

  it('shows what xAI is hearing as it goes: finished utterances and the one in progress', async () => {
    const t = setup();
    await t.open();
    t.audio();
    t.say({ type: 'transcript.partial', text: 'why did', is_final: false, speech_final: false });
    t.say({ type: 'transcript.partial', text: 'why did nothing fall', is_final: true, speech_final: true });
    t.say({ type: 'transcript.partial', text: 'after', is_final: false, speech_final: false });
    t.say({ type: 'transcript.partial', text: 'after seven', is_final: true, speech_final: false });
    t.say({ type: 'transcript.partial', text: 'after seven again', is_final: false, speech_final: false }); // replaces, never repeats, the utterance in progress
    expect(t.client.json()).toEqual([
      { type: 'interim', text: 'why did' },
      { type: 'interim', text: 'why did nothing fall' },
      { type: 'interim', text: 'why did nothing fall after' },
      { type: 'interim', text: 'why did nothing fall after seven' },
      { type: 'interim', text: 'why did nothing fall after seven again' },
    ]);
    expect(t.client.closed).toBeNull();
  });

  it('answers with the final transcript when xAI sends transcript.done after the release, then closes both ends', async () => {
    const t = setup();
    await t.open();
    t.audio();
    t.release();
    t.say({ type: 'transcript.partial', text: 'why did nothing fall after seven', is_final: true, speech_final: true });
    expect(t.client.json().at(-1)).toEqual({ type: 'interim', text: 'why did nothing fall after seven' });
    t.say({ type: 'transcript.done', text: 'why did nothing fall after seven', duration: 3.1 });
    expect(t.client.json().at(-1)).toEqual({ type: 'final', text: 'why did nothing fall after seven' });
    expect(t.client.closed?.code).toBe(1000);
    expect(t.upstream.closed).not.toBeNull();
  });

  it('falls back to what it heard when transcript.done carries no text, and to an empty final when nothing was heard', async () => {
    const a = setup();
    await a.open();
    a.audio();
    a.release();
    a.say({ type: 'transcript.partial', text: 'seven', is_final: true, speech_final: true });
    a.say({ type: 'transcript.done', text: '' });
    expect(a.client.json().at(-1)).toEqual({ type: 'final', text: 'seven' });
    const b = setup();
    await b.open();
    b.audio();
    b.release();
    b.say({ type: 'transcript.done', text: '' });
    expect(b.client.json()).toEqual([{ type: 'final', text: '' }]);
  });

  it('answers a session with no audio by an empty final transcript, not an error, without asking xAI', async () => {
    const t = setup();
    await t.open();
    t.release();
    expect(t.client.json()).toEqual([{ type: 'final', text: '' }]);
    expect(t.client.closed?.code).toBe(1000);
    expect(t.upstream.sent).toEqual([]);
  });

  it('answers with what it has if xAI never sends transcript.done after the release', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.open();
    t.audio();
    t.release();
    t.say({ type: 'transcript.partial', text: 'seven', is_final: true, speech_final: true });
    await vi.advanceTimersByTimeAsync(END_GRACE_MS + 10);
    expect(t.client.json().at(-1)).toEqual({ type: 'final', text: 'seven' });
    expect(t.client.closed).not.toBeNull();
  });

  it('gives up with a generic close if xAI never says transcript.created', async () => {
    vi.useFakeTimers();
    const t = setup();
    await t.open(false);
    t.audio();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 10);
    expect(t.client.closed?.code).toBe(1011);
    expect(t.client.closed?.reason).not.toMatch(/xai|x\.ai/i);
  });

  it('closes the client with a generic code on an xAI error frame, passing on none of its message', async () => {
    const t = setup();
    await t.open();
    t.say({ type: 'error', message: 'invalid api key sk-something-secret' });
    expect(t.client.closed?.code).toBe(1011);
    expect(JSON.stringify([t.client.sent, t.client.closed])).not.toMatch(/invalid api key|sk-something/);
  });

  it('forwards no text frame from the client except the end marker, so the client cannot reconfigure xAI', async () => {
    const t = setup();
    await t.open();
    t.audio();
    const before = t.upstream.sent.length;
    for (const frame of [JSON.stringify({ type: 'config', model: 'something-expensive' }), JSON.stringify({ type: 'audio.done' }), 'not json']) t.client.emit('message', { data: frame });
    expect(t.upstream.sent.length).toBe(before);
    expect(t.client.sent).toEqual([]);
    expect(t.client.closed).toBeNull();
    expect(t.upstream.closed).toBeNull();
  });

  it('ignores audio after the release, and a second release', async () => {
    const t = setup();
    await t.open();
    t.audio();
    t.release();
    const n = t.upstream.sent.length;
    t.audio();
    t.release();
    expect(t.upstream.sent.length).toBe(n);
  });

  it('ignores upstream frames it cannot read', async () => {
    const t = setup();
    await t.open();
    t.upstream.emit('message', { data: 'garbage' });
    t.upstream.emit('message', { data: JSON.stringify({ unrelated: true }) });
    t.upstream.emit('message', { data: JSON.stringify({ type: 'something.new' }) });
    t.upstream.emit('message', { data: new ArrayBuffer(4) });
    expect(t.client.sent).toEqual([]);
    expect(t.client.closed).toBeNull();
  });

  it('closes both ends when either closes', async () => {
    const a = setup();
    await a.open();
    a.client.close(1001);
    expect(a.upstream.closed).not.toBeNull();
    const b = setup();
    await b.open();
    b.upstream.close(1006);
    expect(b.client.closed).not.toBeNull();
  });

  it('closes the client with a generic code when xAI cannot be reached, saying nothing of why', async () => {
    const t = setup({ upstreamFails: true });
    await t.open(false);
    expect(t.client.closed?.code).toBe(1011);
    expect(t.client.closed?.reason).not.toMatch(/boom|xai|x\.ai/i);
  });

  it('closes the session when the client sends more audio than a push-to-talk can hold', async () => {
    const t = setup();
    await t.open();
    const chunk = 512 * 1024;
    for (let sent = 0; sent <= MAX_AUDIO_BYTES + chunk && !t.client.closed; sent += chunk) t.audio(chunk);
    expect(t.client.closed?.code).toBe(1009);
    expect(t.upstream.closed).not.toBeNull();
  });

  it('never sends the xAI key to the client', async () => {
    const t = setup();
    await t.open();
    t.audio();
    t.release();
    t.say({ type: 'transcript.done', text: 'hello' });
    expect(JSON.stringify([t.client.sent, t.client.closed])).not.toContain(FAKE_XAI_KEY);
  });
});
