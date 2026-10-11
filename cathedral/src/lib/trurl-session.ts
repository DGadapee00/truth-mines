import type { DoingFacts } from '../../../core/doing';
import type { TrurlRequest, TrurlTurn } from '../../../core/schema';
import { TRURL_SCHEMA_VERSION } from '../../../core/schema';
import type { TrurlEvent } from './trurl-client';

/** Where the visitor is, as the Worker wants to hear it. */
export interface TrurlContext {
  plane: string | null;
  stretch: string | null;
  moment: string | null;
  landmark: string | null;
  looking_at: string | null;
}

export type TrurlDisabled = 'no-secret' | 'unauthorized' | null;

export interface TrurlState {
  /** thinking: asked, no word yet. talking: words arriving. */
  status: 'idle' | 'thinking' | 'talking';
  /** Trurl's words so far; they stay until the next utterance or clearCaption() */
  caption: string;
  /** The caption is a line written ahead of time that no person has reviewed (never true of a live reply) */
  draft: boolean;
  disabled: TrurlDisabled;
  /** A line to show instead of a reply when Trurl is off */
  hint: string | null;
}

export interface TrurlDeps {
  ask(req: TrurlRequest, signal: AbortSignal): AsyncIterable<TrurlEvent>;
  context(): TrurlContext;
  earned(): string[];
  /** What the visitor has done in this session: a verdict can only follow a doing from this visit */
  doing(): DoingFacts;
  /** Which of the ids a verdict names the doing of this session allows to be earned */
  allowed(ids: string[]): string[];
  onEarned(ids: string[]): void;
  /** Whether this device has what Trurl needs (a Worker address and the secret) */
  enabled(): boolean;
}

const MAX_TEXT = 600;
const MAX_TURNS = 12;
const HINTS = {
  'no-secret': 'Trurl is asleep: this device has no secret yet. Add it in the settings and Trurl will wake.',
  unauthorized: 'Trurl does not know this secret. Check it in the settings.',
} as const;

function failureLine(status: number): string {
  if (status === 429) return 'Slow down, I am only one ribbon.';
  return 'I lost the thread. Ask me again?';
}

/**
 * One conversation with Trurl: what the visitor says goes out with the facts of where they are,
 * the reply streams into a caption, and a verdict from the Worker (the only way an idea is earned)
 * is applied once the whole reply has arrived without trouble. No visible scores, ever.
 */
export function createTrurlSession(deps: TrurlDeps) {
  let status: TrurlState['status'] = 'idle';
  let caption = '';
  let draft = false;
  let unauthorized = false;
  let dialogue: TrurlTurn[] = [];
  let abort: AbortController | null = null;
  const listeners = new Set<(s: TrurlState) => void>();

  const disabled = (): TrurlDisabled => (!deps.enabled() ? 'no-secret' : unauthorized ? 'unauthorized' : null);
  const state = (): TrurlState => {
    const d = disabled();
    return { status, caption, draft, disabled: d, hint: d ? HINTS[d] : null };
  };
  const emit = () => {
    const s = state();
    for (const fn of [...listeners]) fn(s);
  };

  return {
    state,
    subscribe(fn: (s: TrurlState) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Say something to Trurl. Resolves when the reply has finished; false if nothing was sent. */
    async say(text: string): Promise<boolean> {
      const utterance = text.trim().slice(0, MAX_TEXT);
      if (!utterance || disabled()) {
        emit();
        return false;
      }
      abort?.abort();
      const mine = new AbortController();
      abort = mine;
      caption = '';
      draft = false;
      status = 'thinking';
      emit();
      const req: TrurlRequest = { schema_version: TRURL_SCHEMA_VERSION, ...deps.context(), earned: deps.earned(), doing: deps.doing(), dialogue: [...dialogue], utterance };
      let verdict: string[] = [];
      let ok = false;
      let failure: number | null = null;
      for await (const e of deps.ask(req, mine.signal)) {
        if (mine.signal.aborted) return true;
        if (e.type === 'text') {
          caption += e.delta;
          status = 'talking';
          emit();
        } else if (e.type === 'verdict') verdict = e.earned;
        else if (e.type === 'done') ok = true;
        else if (e.type === 'error') failure = e.status;
      }
      if (mine.signal.aborted) return true;
      abort = null;
      if (failure !== null || !ok) {
        if (failure === 401) unauthorized = true;
        else {
          caption = failureLine(failure ?? 0);
          draft = true; // Trurl's own lost-thread lines are written ahead of time
        }
        status = 'idle';
        emit();
        return true;
      }
      status = 'idle';
      dialogue = [...dialogue, { role: 'user' as const, text: utterance }, { role: 'trurl' as const, text: caption.slice(0, MAX_TEXT) }].slice(-MAX_TURNS);
      emit();
      const granted = deps.allowed(verdict);
      if (granted.length > 0) deps.onEarned(granted);
      return true;
    },
    /** The secret or Worker address has changed: try again */
    reset(): void {
      unauthorized = false;
      emit();
    },
    clearCaption(): void {
      caption = '';
      draft = false;
      emit();
    },
    /** Trurl says a line he already has (the question after the doing): nothing is sent, nothing is judged */
    announce(text: string, isDraft = false): void {
      abort?.abort();
      abort = null;
      caption = text.slice(0, MAX_TEXT);
      draft = isDraft;
      status = 'idle';
      emit();
    },
  };
}

export type TrurlSession = ReturnType<typeof createTrurlSession>;
