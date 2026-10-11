import { floatToPcm16 } from './pcm';
import type { SttSession } from './stt-client';

/** The microphone. `start` streams 16 kHz PCM chunks until `stop`; `prepare` asks permission once, ahead of time. */
export interface Mic {
  prepare(): Promise<boolean>;
  start(onChunk: (pcm: Int16Array) => void): void;
  stop(): void;
}

export type PttError = 'no-microphone' | 'unavailable' | 'unauthorized';

export interface PttDeps {
  mic: Mic;
  /** Open a speech-to-text session; interim text is reported as it comes */
  open(onInterim: (text: string) => void): SttSession;
  onInterim(text: string): void;
  /** The final transcript of a real utterance (never empty) */
  onTranscript(text: string): void;
  onError(kind: PttError): void;
  now(): number;
  /** A hold shorter than this is a tap, not speech */
  minHoldMs: number;
}

/**
 * Hold a button and speak: the microphone streams to the Worker's speech-to-text while held; on
 * release the final transcript goes to Trurl. A tap, an empty transcript or a failed service says
 * nothing and sends nothing.
 */
export function createPushToTalk(d: PttDeps) {
  let stt: SttSession | null = null;
  let since = 0;
  return {
    state: (): 'idle' | 'listening' => (stt ? 'listening' : 'idle'),
    async prepare(): Promise<boolean> {
      const ok = await d.mic.prepare();
      if (!ok) d.onError('no-microphone');
      return ok;
    },
    start(): void {
      if (stt) return;
      since = d.now();
      const session = d.open((t) => d.onInterim(t));
      stt = session;
      d.mic.start((pcm) => session.send(pcm));
    },
    async stop(): Promise<void> {
      const session = stt;
      if (!session) return;
      stt = null;
      d.mic.stop();
      if (d.now() - since < d.minHoldMs) {
        session.cancel();
        return;
      }
      session.end();
      try {
        const text = (await session.result).trim();
        if (text) d.onTranscript(text);
      } catch (e) {
        d.onError((e as Error).message === 'unauthorized' ? 'unauthorized' : 'unavailable');
      }
    },
    cancel(): void {
      const session = stt;
      stt = null;
      d.mic.stop();
      session?.cancel();
    },
  };
}

export type PushToTalk = ReturnType<typeof createPushToTalk>;

/** The real microphone: permission asked once, the stream kept muted between holds, 16 kHz PCM out. */
export class BrowserMic implements Mic {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async prepare(): Promise<boolean> {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      for (const t of this.stream.getAudioTracks()) t.enabled = false;
      return true;
    } catch {
      return false;
    }
  }

  start(onChunk: (pcm: Int16Array) => void): void {
    if (!this.stream) return;
    for (const t of this.stream.getAudioTracks()) t.enabled = true;
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    const ctx = this.ctx;
    this.source = ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but works everywhere including the Quest browser, needs no separate worklet file, and a few hundred ms of speech is all this carries.
    this.node = ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => onChunk(floatToPcm16(e.inputBuffer.getChannelData(0), ctx.sampleRate));
    this.source.connect(this.node);
    this.node.connect(ctx.destination);
  }

  stop(): void {
    this.node?.disconnect();
    this.source?.disconnect();
    if (this.node) this.node.onaudioprocess = null;
    this.node = null;
    this.source = null;
    if (this.stream) for (const t of this.stream.getAudioTracks()) t.enabled = false;
  }
}
