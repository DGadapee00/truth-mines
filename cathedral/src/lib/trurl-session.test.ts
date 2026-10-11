import { describe, expect, it } from 'vitest';
import type { TrurlRequest } from '../../../core/schema';
import type { TrurlEvent } from './trurl-client';
import { createTrurlSession, type TrurlContext } from './trurl-session';

const CTX: TrurlContext = { plane: 'number-theory', stretch: 'nt-1', moment: 'nt-1-sieve', landmark: 'df-prm', looking_at: 'plaza:97' };

function setup(script: (req: TrurlRequest, signal: AbortSignal) => TrurlEvent[] | AsyncIterable<TrurlEvent>, opts: { secret?: boolean; earned?: string[] } = {}) {
  const requests: TrurlRequest[] = [];
  const earned: string[][] = [];
  let ctx = CTX;
  const hasSecret = opts.secret ?? true;
  const s = createTrurlSession({
    ask: (req, signal) => {
      requests.push(req);
      const r = script(req, signal);
      return (async function* () {
        for await (const e of r as AsyncIterable<TrurlEvent>) yield e;
      })();
    },
    context: () => ctx,
    earned: () => opts.earned ?? [],
    onEarned: (ids) => earned.push(ids),
    enabled: () => hasSecret,
  });
  return { s, requests, earned, setCtx: (c: TrurlContext) => (ctx = c) };
}
const arr = (...e: TrurlEvent[]) => e;

describe('the Trurl session', () => {
  it('streams a reply into the caption word by word and ends idle', async () => {
    const t = setup(() => arr({ type: 'text', delta: 'Seven, ' }, { type: 'text', delta: 'you say?' }, { type: 'verdict', earned: [] }, { type: 'done' }));
    const seen: string[] = [];
    t.s.subscribe((st) => seen.push(`${st.status}:${st.caption}`));
    await t.s.say('why did nothing fall after seven?');
    expect(seen).toContain('thinking:');
    expect(seen).toContain('talking:Seven, ');
    expect(seen).toContain('talking:Seven, you say?');
    expect(t.s.state().status).toBe('idle');
    expect(t.s.state().caption).toBe('Seven, you say?');
  });

  it('sends the context, the earned ideas, the dialogue so far and the utterance', async () => {
    const t = setup(() => arr({ type: 'text', delta: 'Hm.' }, { type: 'done' }), { earned: ['1arith'] });
    await t.s.say('first');
    await t.s.say('second');
    expect(t.requests[0]).toEqual({ schema_version: 1, ...CTX, earned: ['1arith'], dialogue: [], utterance: 'first' });
    expect(t.requests[1]!.dialogue).toEqual([{ role: 'user', text: 'first' }, { role: 'trurl', text: 'Hm.' }]);
    expect(t.requests[1]!.utterance).toBe('second');
  });

  it('keeps only the latest 12 turns of dialogue', async () => {
    const t = setup(() => arr({ type: 'text', delta: 'ok' }, { type: 'done' }));
    for (let i = 0; i < 15; i++) await t.s.say(`line ${i}`);
    expect(t.requests.at(-1)!.dialogue.length).toBeLessThanOrEqual(12);
    expect(t.requests.at(-1)!.dialogue.at(-1)).toEqual({ role: 'trurl', text: 'ok' });
  });

  it('applies a verdict by calling onEarned, once, and only with ids', async () => {
    const t = setup(() => arr({ type: 'text', delta: 'Nicely put.' }, { type: 'verdict', earned: ['df-prm'] }, { type: 'done' }));
    await t.s.say('a prime has only 1 and itself as divisors');
    expect(t.earned).toEqual([['df-prm']]);
  });

  it('does not call onEarned for an empty verdict, or when the reply fails after it', async () => {
    const a = setup(() => arr({ type: 'text', delta: 'Not yet.' }, { type: 'verdict', earned: [] }, { type: 'done' }));
    await a.s.say('hmm');
    expect(a.earned).toEqual([]);
  });

  it('ignores an empty or whitespace utterance without calling Claude', async () => {
    const t = setup(() => arr({ type: 'done' }));
    for (const u of ['', '   ', '\n\t']) expect(await t.s.say(u)).toBe(false);
    expect(t.requests).toHaveLength(0);
    expect(t.s.state().status).toBe('idle');
  });

  it('trims the utterance and cuts one beyond 600 characters rather than sending it', async () => {
    const t = setup(() => arr({ type: 'done' }));
    await t.s.say('  hello  ');
    expect(t.requests[0]!.utterance).toBe('hello');
    await t.s.say('x'.repeat(2000));
    expect(t.requests[1]!.utterance.length).toBe(600);
  });

  it('with no secret on the device, calls nothing and shows a hint instead of a reply', async () => {
    const t = setup(() => arr({ type: 'done' }), { secret: false });
    expect(t.s.state().disabled).toBe('no-secret');
    expect(t.s.state().hint).toMatch(/secret/i);
    expect(await t.s.say('hello?')).toBe(false);
    expect(t.requests).toHaveLength(0);
  });

  it('on a 401 turns Trurl off with a hint and does not retry, until told the secret has changed', async () => {
    let calls = 0;
    const t = setup(() => {
      calls++;
      return arr({ type: 'error', status: 401 });
    });
    await t.s.say('hello');
    expect(t.s.state().disabled).toBe('unauthorized');
    expect(t.s.state().hint).toMatch(/secret/i);
    await t.s.say('hello again');
    await t.s.say('and again');
    expect(calls).toBe(1);
    t.s.reset();
    expect(t.s.state().disabled).toBeNull();
    await t.s.say('now?');
    expect(calls).toBe(2);
  });

  it('answers other failures with a short in-world caption and stays usable', async () => {
    for (const status of [0, 429, 503, 200]) {
      const t = setup(() => arr({ type: 'text', delta: 'Se' }, { type: 'error', status }));
      await t.s.say('hi');
      const st = t.s.state();
      expect(st.status).toBe('idle');
      expect(st.disabled).toBeNull();
      expect(st.caption.length).toBeGreaterThan(0);
      expect(st.caption.length).toBeLessThan(80);
      expect(t.earned).toEqual([]);
    }
  });

  it('never applies a verdict from a reply that then failed', async () => {
    const t = setup(() => arr({ type: 'verdict', earned: ['df-prm'] }, { type: 'error', status: 0 }));
    await t.s.say('hi');
    expect(t.earned).toEqual([]);
  });

  it('a new utterance cancels the reply in progress and starts a fresh caption', async () => {
    let first: AbortSignal | undefined;
    const t = setup((req, signal) => {
      if (req.utterance === 'one') {
        first = signal;
        return (async function* () {
          yield { type: 'text', delta: 'slow ' } as TrurlEvent;
          await new Promise((r) => setTimeout(r, 30));
          if (!signal.aborted) yield { type: 'text', delta: 'reply' } as TrurlEvent;
        })();
      }
      return arr({ type: 'text', delta: 'second' }, { type: 'done' });
    });
    const a = t.s.say('one');
    await new Promise((r) => setTimeout(r, 5));
    await t.s.say('two');
    await a;
    expect(first?.aborted).toBe(true);
    expect(t.s.state().caption).toBe('second');
  });

  it('records the ribbon as thinking until the first word arrives, talking while words come, and idle after', async () => {
    const states: string[] = [];
    const t = setup(() => arr({ type: 'text', delta: 'a' }, { type: 'done' }));
    t.s.subscribe((st) => states.push(st.status));
    await t.s.say('hi');
    expect(states[0]).toBe('thinking');
    expect(states).toContain('talking');
    expect(states.at(-1)).toBe('idle');
  });

  it('can be told a caption has been read, clearing it', async () => {
    const t = setup(() => arr({ type: 'text', delta: 'Hello' }, { type: 'done' }));
    await t.s.say('hi');
    t.s.clearCaption();
    expect(t.s.state().caption).toBe('');
  });
});
