import { describe, expect, it } from 'vitest';
import type { TrurlRequest } from '../../../core/schema';
import { askTrurl, type TrurlEvent } from './trurl-client';

const REQ: TrurlRequest = { schema_version: 2, plane: 'number-theory', stretch: 'nt-1', moment: 'nt-1-sieve', landmark: 'df-prm', looking_at: 'plaza:97', earned: [], doing: { predicted: [], struck: [], stopped: false }, dialogue: [], utterance: 'why?' };
const sse = (...events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

function fakeFetch(res: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return res();
  }) as unknown as typeof fetch;
  return { f, calls };
}
async function all(it: AsyncIterable<TrurlEvent>) {
  const out: TrurlEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}
const cfg = (f: typeof fetch, over = {}) => ({ workerUrl: 'https://w.example/', secret: 'sekrit', fetch: f, ...over });

describe('askTrurl', () => {
  it('posts the request to the Worker with the bearer secret and nothing else in the URL', async () => {
    const { f, calls } = fakeFetch(() => new Response(sse(['done', {}])));
    await all(askTrurl(cfg(f), REQ));
    expect(calls[0]!.url).toBe('https://w.example/api/trurl');
    const init = calls[0]!.init;
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer sekrit');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual(REQ);
    expect(calls[0]!.url).not.toContain('sekrit');
  });

  it('turns the stream into text, verdict and done events', async () => {
    const { f } = fakeFetch(() => new Response(sse(['text', { delta: 'Seven, ' }], ['text', { delta: 'you say?' }], ['verdict', { earned: ['df-prm'] }], ['done', {}])));
    expect(await all(askTrurl(cfg(f), REQ))).toEqual([
      { type: 'text', delta: 'Seven, ' },
      { type: 'text', delta: 'you say?' },
      { type: 'verdict', earned: ['df-prm'] },
      { type: 'done' },
    ]);
  });

  it('reports an HTTP failure with its status, and nothing from the body', async () => {
    for (const status of [401, 403, 413, 429, 503]) {
      const { f } = fakeFetch(() => new Response('{"error":"internal detail"}', { status }));
      const out = await all(askTrurl(cfg(f), REQ));
      expect(out, String(status)).toEqual([{ type: 'error', status }]);
    }
  });

  it('reports a network failure as an error with status 0', async () => {
    const { f } = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await all(askTrurl(cfg(f), REQ))).toEqual([{ type: 'error', status: 0 }]);
  });

  it('reports an error event from the Worker, and a stream that ends early', async () => {
    const a = fakeFetch(() => new Response(sse(['text', { delta: 'Se' }], ['error', { message: 'Trurl lost the thread.' }])));
    expect((await all(askTrurl(cfg(a.f), REQ))).at(-1)).toEqual({ type: 'error', status: 200 });
    const b = fakeFetch(() => new Response(sse(['text', { delta: 'Se' }])));
    expect((await all(askTrurl(cfg(b.f), REQ))).at(-1)).toEqual({ type: 'error', status: 200 });
  });

  it('stops quietly when the caller aborts', async () => {
    const ctl = new AbortController();
    const { f } = fakeFetch(() => {
      ctl.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    expect(await all(askTrurl(cfg(f), REQ, ctl.signal))).toEqual([]);
  });

  it('does not call out without a Worker address or a secret', async () => {
    const { f, calls } = fakeFetch(() => new Response(''));
    expect(await all(askTrurl(cfg(f, { secret: '' }), REQ))).toEqual([{ type: 'error', status: 401 }]);
    expect(await all(askTrurl(cfg(f, { workerUrl: '' }), REQ))).toEqual([{ type: 'error', status: 0 }]);
    expect(calls).toHaveLength(0);
  });
});
