import { describe, expect, it } from 'vitest';
import { parseSse } from './sse';

async function* chunks(...parts: (string | Uint8Array)[]): AsyncGenerator<Uint8Array> {
  const enc = new TextEncoder();
  for (const p of parts) yield typeof p === 'string' ? enc.encode(p) : p;
}
async function collect(it: AsyncIterable<unknown>) {
  const out: unknown[] = [];
  for await (const e of it) out.push(e);
  return out;
}

describe('parseSse', () => {
  it('reads events in order', async () => {
    const out = await collect(parseSse(chunks('event: text\ndata: {"delta":"a"}\n\nevent: done\ndata: {}\n\n')));
    expect(out).toEqual([{ event: 'text', data: { delta: 'a' } }, { event: 'done', data: {} }]);
  });

  it('copes with an event split across chunks at every byte', async () => {
    const full = 'event: text\ndata: {"delta":"héllo"}\n\nevent: verdict\ndata: {"earned":["a"]}\n\n';
    const bytes = new TextEncoder().encode(full);
    for (let i = 1; i < bytes.length; i++) {
      const out = await collect(parseSse(chunks(bytes.slice(0, i), bytes.slice(i))));
      expect(out, `split ${i}`).toEqual([{ event: 'text', data: { delta: 'héllo' } }, { event: 'verdict', data: { earned: ['a'] } }]);
    }
  });

  it('accepts CRLF line endings', async () => {
    expect(await collect(parseSse(chunks('event: text\r\ndata: {"delta":"x"}\r\n\r\n')))).toEqual([{ event: 'text', data: { delta: 'x' } }]);
  });

  it('drops a trailing event that never finished, and skips blocks it cannot read', async () => {
    expect(await collect(parseSse(chunks('event: text\ndata: {"delta":"a"}\n\nevent: text\ndata: {"delta":"b"}')))).toEqual([{ event: 'text', data: { delta: 'a' } }]);
    expect(await collect(parseSse(chunks('event: text\ndata: {oops}\n\n: a comment\n\nevent: done\ndata: {}\n\n')))).toEqual([{ event: 'done', data: {} }]);
  });

  it('yields nothing for an empty stream', async () => {
    expect(await collect(parseSse(chunks()))).toEqual([]);
  });
});
