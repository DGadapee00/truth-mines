/**
 * The visit as a small state machine.
 *
 *   gate        the 2D page: the secret and Worker address, once per device
 *   ready       waiting for the visitor to press begin (a button, or the trigger in a headset)
 *   threshold   the guided drift and descent (the one guided move; only a visitor's press starts it)
 *   cathedral   the hall with its twelve doors
 *   plane       behind a door
 *
 * The first visit always plays the threshold in full. On a return visit a press during it fades
 * straight to the dais (`skip`).
 */
export type Phase = 'gate' | 'ready' | 'threshold' | 'cathedral' | 'plane';
export type FlowEvent = 'continue' | 'begin' | 'arrived' | 'skip' | 'enter-plane' | 'leave-plane' | 'session-ended';

const NEXT: Record<Phase, Partial<Record<FlowEvent, Phase>>> = {
  gate: { continue: 'ready' },
  ready: { begin: 'threshold' },
  threshold: { arrived: 'cathedral', skip: 'cathedral', 'session-ended': 'ready' },
  cathedral: { 'enter-plane': 'plane', 'session-ended': 'ready' },
  plane: { 'leave-plane': 'cathedral', 'session-ended': 'ready' },
};

export function createFlow(opts: { returning: boolean }) {
  let phase: Phase = 'gate';
  const listeners = new Set<(p: Phase, why: FlowEvent) => void>();
  return {
    phase: () => phase,
    /** A press during the threshold may skip it only on a return visit */
    canSkip: () => opts.returning && phase === 'threshold',
    send(e: FlowEvent): void {
      if (e === 'skip' && !opts.returning) return;
      const next = NEXT[phase][e];
      if (!next) return;
      phase = next;
      for (const fn of [...listeners]) fn(phase, e);
    },
    subscribe(fn: (p: Phase, why: FlowEvent) => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type Flow = ReturnType<typeof createFlow>;
