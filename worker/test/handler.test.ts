import { describe, expect, it } from 'vitest';
import { createHandler, type Deps } from '../src/handler';
import { LIMITS } from '../src/ratelimit';
import { stubFetch, readEvents, type Script } from './anthropic-stub';
import { grounding, request } from './fixtures';
import { FAKE_ANTHROPIC_KEY, FAKE_XAI_KEY, SECRET, makeEnv, req } from './helpers';
import { FakeSocket } from './fake-socket';

function world(script: Script = { chunks: ['Hello.', '<verdict>{"earned":[]}</verdict>'] }) {
  const stub = stubFetch(script);
  const accepted: Request[] = [];
  const clock = { t: Date.UTC(2026, 9, 11, 12, 0, 5) };
  const deps: Deps = {
    grounding: grounding(),
    fetch: stub.fetch,
    now: () => clock.t,
    stt: {
      accept: (r) => {
        accepted.push(r);
        return { socket: new FakeSocket(), response: new Response('upgraded', { status: 200, headers: { 'Sec-WebSocket-Protocol': 'trurl.v1' } }) };
      },
      connectUpstream: async () => new FakeSocket(),
    },
  };
  return { handle: createHandler(deps), env: makeEnv(), stub, accepted, clock };
}

const post = (path: string, body: unknown, init: RequestInit & { auth?: string | false } = {}) => req(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init });
const wsUpgrade = (auth: string | false = SECRET) =>
  req('/api/stt', { auth: false, headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': auth ? `bearer.${auth}, trurl.v1` : 'trurl.v1' } });

describe('the front door', () => {
  it('refuses an unauthenticated request on every route, and an unknown path too, before anything else', async () => {
    const w = world();
    for (const path of ['/api/trurl', '/api/stt', '/api/progress', '/api/nothing', '/']) {
      for (const auth of [false, 'wrong'] as const) {
        const res = await w.handle(req(path, { auth }), w.env);
        expect(res.status, `${path} ${String(auth)}`).toBe(401);
      }
    }
    expect(w.stub.sent).toHaveLength(0);
  });

  it('answers an unknown path with 404 once authenticated', async () => {
    const w = world();
    expect((await w.handle(req('/api/nothing'), w.env)).status).toBe(404);
  });

  it('refuses a disallowed origin even with the right secret, and an OPTIONS from it', async () => {
    const w = world();
    const evil = { Origin: 'https://evil.example' };
    expect((await w.handle(req('/api/progress', { headers: evil }), w.env)).status).toBe(403);
    expect((await w.handle(req('/api/progress', { method: 'OPTIONS', headers: evil, auth: false }), w.env)).status).toBe(403);
  });

  it('answers a preflight from an allowed origin without a secret, with the CORS headers', async () => {
    const w = world();
    const res = await w.handle(req('/api/trurl', { method: 'OPTIONS', auth: false, headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } }), w.env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('adds CORS headers to real responses, including errors', async () => {
    const w = world();
    const origin = { Origin: 'https://truth-mines.example' };
    for (const res of [await w.handle(req('/api/progress', { headers: origin }), w.env), await w.handle(req('/api/progress', { headers: origin, auth: false }), w.env)]) {
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://truth-mines.example');
    }
  });

  it('never puts a secret or provider key in any error body', async () => {
    const w = world({ status: 500 });
    const seen: string[] = [];
    for (const r of [req('/api/progress', { auth: false }), req('/api/nothing'), req('/api/trurl'), post('/api/trurl', '{nope'), post('/api/trurl', request()), req('/api/progress', { method: 'DELETE' })]) {
      const res = await w.handle(r, w.env);
      seen.push(await res.text());
    }
    for (const body of seen) for (const s of [SECRET, FAKE_ANTHROPIC_KEY, FAKE_XAI_KEY]) expect(body).not.toContain(s);
  });
});

describe('rate limits', () => {
  it('refuses the 31st Trurl request in a minute with 429 and Retry-After, before asking Claude', async () => {
    const w = world();
    for (let i = 0; i < LIMITS.trurl.limit; i++) {
      const ok = await w.handle(post('/api/trurl', request()), w.env);
      expect(ok.status).toBe(200);
      await ok.text(); // the reply is lazy: read it so the call to Claude has happened
    }
    expect(w.stub.sent).toHaveLength(30);
    const res = await w.handle(post('/api/trurl', request()), w.env);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(w.stub.sent).toHaveLength(30);
  });

  it('refuses the 11th speech session in a minute without upgrading', async () => {
    const w = world();
    for (let i = 0; i < 10; i++) expect((await w.handle(wsUpgrade(), w.env)).status).toBe(200);
    expect(w.accepted).toHaveLength(10);
    expect((await w.handle(wsUpgrade(), w.env)).status).toBe(429);
    expect(w.accepted).toHaveLength(10);
  });

  it('refuses the 61st progress request in a minute', async () => {
    const w = world();
    for (let i = 0; i < LIMITS.progress.limit; i++) expect((await w.handle(req('/api/progress'), w.env)).status).toBe(200);
    expect((await w.handle(req('/api/progress'), w.env)).status).toBe(429);
  });

  it('opens a fresh window a minute later', async () => {
    const w = world();
    for (let i = 0; i < 10; i++) await w.handle(wsUpgrade(), w.env);
    expect((await w.handle(wsUpgrade(), w.env)).status).toBe(429);
    w.clock.t += 60_000;
    expect((await w.handle(wsUpgrade(), w.env)).status).toBe(200);
  });

  it('does not let unauthenticated requests use up the allowance', async () => {
    const w = world();
    for (let i = 0; i < 100; i++) await w.handle(post('/api/trurl', request(), { auth: 'wrong' }), w.env);
    expect([...w.env.PROGRESS.data.keys()].filter((k) => k.startsWith('rl:'))).toEqual([]);
    expect((await w.handle(post('/api/trurl', request()), w.env)).status).toBe(200);
  });

  it('refuses rather than lets spend through when the counter store is down', async () => {
    const w = world();
    w.env.PROGRESS.failing = true;
    const res = await w.handle(post('/api/trurl', request()), w.env);
    expect(res.status).toBe(503);
    expect(w.stub.sent).toHaveLength(0);
  });
});

describe('POST /api/trurl', () => {
  it('streams a reply for a valid request', async () => {
    const w = world();
    const res = await w.handle(post('/api/trurl', request()), w.env);
    expect(res.status).toBe(200);
    const events = await readEvents(res);
    expect(events.map((e) => e.event)).toEqual(['text', 'verdict', 'done']);
  });

  it('refuses other methods, bad JSON, big bodies and invalid requests without asking Claude', async () => {
    const w = world();
    expect((await w.handle(req('/api/trurl'), w.env)).status).toBe(405);
    expect((await w.handle(post('/api/trurl', '{nope'), w.env)).status).toBe(400);
    expect((await w.handle(post('/api/trurl', { ...request(), utterance: 'x'.repeat(40_000) }), w.env)).status).toBe(413);
    expect((await w.handle(post('/api/trurl', request({ utterance: '   ' })), w.env)).status).toBe(400);
    expect((await w.handle(post('/api/trurl', request({ utterance: 'y'.repeat(10_000) })), w.env)).status).toBe(400);
    expect((await w.handle(post('/api/trurl', { ...request(), model: 'claude-opus-5-5' }), w.env)).status).toBe(400);
    expect((await w.handle(post('/api/trurl', request({ plane: 'nowhere' })), w.env)).status).toBe(400);
    expect(w.stub.sent).toHaveLength(0);
  });

  it('turns a 400 into JSON with a short message', async () => {
    const w = world();
    const res = await w.handle(post('/api/trurl', request({ utterance: '' })), w.env);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(((await res.json()) as { error: string }).error).toMatch(/utterance/);
  });
});

describe('/api/stt and /api/progress through the front door', () => {
  it('upgrades a WebSocket whose secret is in the subprotocol', async () => {
    const w = world();
    expect((await w.handle(wsUpgrade(), w.env)).status).toBe(200);
    expect((await w.handle(wsUpgrade(false), w.env)).status).toBe(401);
    expect((await w.handle(wsUpgrade('wrong'), w.env)).status).toBe(401);
  });

  it('round-trips progress', async () => {
    const w = world();
    const body = { schema_version: 1, earned: ['1arith'], pathways: {}, updated_at: '2026-10-11T08:00:00Z' };
    expect((await w.handle(req('/api/progress', { method: 'PUT', body: JSON.stringify(body) }), w.env)).status).toBe(200);
    expect(await (await w.handle(req('/api/progress'), w.env)).json()).toEqual(body);
  });
});
