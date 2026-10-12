import { describe, expect, it } from 'vitest';
import { createPushToTalk, type Mic } from './ptt';
import { SttError, type SttSession } from './stt-client';

class FakeMic implements Mic {
  prepared = 0;
  live = false;
  onChunk: ((pcm: Int16Array) => void) | null = null;
  ok = true;
  async prepare() {
    this.prepared++;
    return this.ok;
  }
  start(onChunk: (pcm: Int16Array) => void) {
    this.live = true;
    this.onChunk = onChunk;
  }
  stop() {
    this.live = false;
  }
}

function fakeStt(result: Promise<string>) {
  const log: string[] = [];
  const session = {
    sampleRate: 16000,
    result,
    send: () => log.push('send'),
    end: () => log.push('end'),
    cancel: () => log.push('cancel'),
  } as unknown as SttSession;
  return { session, log };
}

function setup(text: string | Error) {
  const mic = new FakeMic();
  let now = 1000;
  const said: string[] = [];
  const errors: string[] = [];
  const interims: string[] = [];
  const stt = fakeStt(text instanceof Error ? Promise.reject(text) : Promise.resolve(text));
  const ptt = createPushToTalk({
    mic,
    open: (onInterim) => {
      onInterim('why');
      return stt.session;
    },
    onInterim: (t) => interims.push(t),
    onTranscript: (t) => said.push(t),
    onError: (k) => errors.push(k),
    now: () => now,
    minHoldMs: 250,
  });
  const hold = async (ms: number) => {
    ptt.start();
    now += ms;
    await ptt.stop();
  };
  return { ptt, mic, stt, said, errors, interims, hold };
}

describe('push-to-talk', () => {
  it('streams the microphone to speech-to-text while held, and stops the microphone on release', async () => {
    const t = setup('hello there');
    t.ptt.start();
    expect(t.mic.live).toBe(true);
    expect(t.ptt.state()).toBe('listening');
    t.mic.onChunk?.(Int16Array.from([1, 2, 3]));
    t.mic.onChunk?.(Int16Array.from([4]));
    expect(t.stt.log).toEqual(['send', 'send']);
    await t.ptt.stop();
    expect(t.mic.live).toBe(false);
    expect(t.ptt.state()).toBe('idle');
  });

  it('treats a tap shorter than the minimum as nothing said and cancels the session', async () => {
    const t = setup('anything');
    await t.hold(100);
    expect(t.said).toEqual([]);
    expect(t.stt.log).toContain('cancel');
    expect(t.mic.live).toBe(false);
  });

  it('says what was heard after a proper hold', async () => {
    const t = setup('why did nothing fall after seven');
    await t.hold(1200);
    expect(t.said).toEqual(['why did nothing fall after seven']);
    expect(t.stt.log).toContain('end');
  });

  it('sends nothing for an empty or whitespace transcript', async () => {
    for (const text of ['', '   ']) {
      const t = setup(text);
      await t.hold(1200);
      expect(t.said, JSON.stringify(text)).toEqual([]);
      expect(t.errors).toEqual([]);
    }
  });

  it('reports an unavailable or unauthorised speech service without saying anything', async () => {
    const a = setup(new SttError('unavailable'));
    await a.hold(1200);
    expect(a.errors).toEqual(['unavailable']);
    expect(a.said).toEqual([]);
    const b = setup(new SttError('unauthorized'));
    await b.hold(1200);
    expect(b.errors).toEqual(['unauthorized']);
  });

  it('reports a missing microphone, and does not start', async () => {
    const t = setup('x');
    t.mic.ok = false;
    expect(await t.ptt.prepare()).toBe(false);
    expect(t.errors).toEqual(['no-microphone']);
  });

  it('ignores a second press while one is live, and a release with no press', async () => {
    const t = setup('hello there');
    t.ptt.start();
    t.ptt.start();
    expect(t.stt.log).toEqual([]);
    await t.ptt.stop();
    await t.ptt.stop();
    expect(t.errors).toEqual([]);
  });

  it('passes interim text through while held', () => {
    const t = setup('x');
    t.ptt.start();
    expect(t.interims).toEqual(['why']);
  });

  it('can be cancelled mid-hold (the page lost focus): nothing is said', async () => {
    const t = setup('hello');
    t.ptt.start();
    t.ptt.cancel();
    expect(t.mic.live).toBe(false);
    expect(t.stt.log).toContain('cancel');
    expect(t.said).toEqual([]);
  });
});
