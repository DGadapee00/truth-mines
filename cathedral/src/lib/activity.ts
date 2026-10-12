import { checkFactors, checkNext, isAttempt, parseNumbers, safeToStop, sayingDone, stackOf, type Doing, type DoingKind } from '../../../core/doing';
import { activity as say, type Line } from '../copy';

/** What the activity needs to know about, and do to, the number theory plane */
export interface ActivityPlane {
  /** Numbers still standing in the plaza, ascending; a struck number stays standing */
  standing(): number[];
  struck(): number[];
  strike(n: number): void;
  reveal(n: number): void;
  isRevealed(n: number): boolean;
  /** "12 = 2² · 3" */
  labelOf(n: number): string;
}

export interface ActivityDeps {
  doing: Doing;
  plane: ActivityPlane;
  zone(): 'road' | 'plaza' | 'overlook';
  /** The road column in view, if any */
  looking(): number | null;
  say(line: Line): void;
  /** The doing for a kind of moment has just been completed */
  onDone(kind: DoingKind): void;
}

/**
 * The doing, in the plane: what the visitor says, types or points at is judged here by the rules in
 * core/doing.ts. On the road it takes a stack apart; in the plaza it names the next prime, or says it is
 * safe to stop. Anything that is not an answer goes on to Trurl. The sieve and the road are the pipeline's
 * and the plaza's; this decides nothing about them but whether the visitor was right.
 */
export function createActivity(d: ActivityDeps) {
  const wasDone = (): Record<'road' | 'sieve', boolean> => ({ road: d.doing.done('road'), sieve: d.doing.done('sieve') });
  const afterwards = (before: Record<'road' | 'sieve', boolean>) => {
    for (const kind of ['road', 'sieve'] as const) if (!before[kind] && d.doing.done(kind)) d.onDone(kind);
  };

  /** The visitor names the next prime to strike, by voice, by typing or by pointing at it */
  function name(n: number): void {
    const before = wasDone();
    const answer = checkNext(n, d.plane.standing(), d.plane.struck());
    if (answer.kind === 'next') {
      d.plane.strike(n);
      d.doing.recordStrike(n);
    } else if (answer.kind === 'gone') d.say(say.gone(n));
    else if (answer.kind === 'out-of-range') d.say(say.outOfRange());
    else if (d.plane.struck().includes(n)) d.say(say.alreadyStruck(n));
    else d.say(say.notNext());
    afterwards(before);
  }

  /** The visitor says nothing more would fall */
  function stop(): void {
    const before = wasDone();
    if (d.plane.struck().length === 0) d.say(say.neverStarted());
    else if (safeToStop(d.plane.standing(), d.plane.struck())) {
      d.doing.recordStop();
      d.say(say.stopRight());
    } else d.say(say.stopEarly());
    afterwards(before);
  }

  function road(text: string): boolean {
    if (!isAttempt(text)) return false;
    const stack = stackOf(parseNumbers(text), d.looking());
    if (!stack) {
      d.say(say.lookFirst());
      return true;
    }
    const before = wasDone();
    const answer = checkFactors(stack.n, stack.factors);
    if (answer.kind === 'right') {
      if (d.plane.isRevealed(stack.n)) d.say(say.alreadyApart(d.plane.labelOf(stack.n)));
      else {
        d.doing.recordStack(stack.n);
        d.plane.reveal(stack.n);
        d.say(say.rightStack(d.plane.labelOf(stack.n)));
      }
    } else if (answer.kind === 'not-prime') d.say(say.notPrime(answer.value));
    else if (answer.kind === 'product') d.say(say.wrongProduct(answer.got, stack.n));
    else d.say(say.nothing());
    afterwards(before);
    return true;
  }

  return {
    name,
    stop,
    /** Whether what was said was an answer to the activity here (and so is not for Trurl) */
    utter(text: string): boolean {
      const zone = d.zone();
      if (zone === 'road') return road(text);
      if (zone === 'plaza') {
        if (sayingDone(text)) {
          stop();
          return true;
        }
        if (!isAttempt(text)) return false;
        const [n] = parseNumbers(text);
        if (n === undefined) return false;
        name(n);
        return true;
      }
      return false;
    },
  };
}

export type Activity = ReturnType<typeof createActivity>;
