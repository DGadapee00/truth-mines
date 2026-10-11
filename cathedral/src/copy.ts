/**
 * Every line the app writes itself for the visitor (not the plane's texts, which come from the data
 * with their own review flags, and not Trurl's live replies). A line is a draft until a person has
 * approved its exact wording and added its id to REVIEWED_LINES; the screen marks drafts apart from
 * the line itself (see ui/style.css), so a draft never reads as finished content.
 */
export interface Line {
  id: string;
  text: string;
  draft: boolean;
}

/** Ids a person has approved. Empty: every line below is Claude's draft. */
export const REVIEWED_LINES: ReadonlySet<string> = new Set<string>();

export const line = (id: string, text: string): Line => ({ id, text, draft: !REVIEWED_LINES.has(id) });

/** What the activity says back. None of it names the answer to what Trurl will ask. */
export const activity = {
  lookFirst: () => line('road-look-first', 'Look at a stack first, then say the primes that multiply to it.'),
  rightStack: (label: string) => line('road-right', `Yes. ${label}.`),
  alreadyApart: (label: string) => line('road-again', `You took that one apart already: ${label}.`),
  notPrime: (value: number) => line('road-not-prime', value === 1 ? '1 is not a prime. Try again.' : `${value} is not a prime: it can be split further. Try again.`),
  wrongProduct: (got: number, n: number) => line('road-product', `Those multiply to ${got}, not ${n}. Try again.`),
  nothing: () => line('road-nothing', 'Say the primes that multiply to it, like "2, 3".'),
  gone: (n: number) => line('sieve-gone', `${n} has already crumbled.`),
  notNext: () => line('sieve-not-next', 'Not that one. Look at what is still standing.'),
  outOfRange: () => line('sieve-range', 'The grid runs from 2 to 100.'),
  alreadyStruck: (n: number) => line('sieve-struck', `${n} is already struck.`),
  stopEarly: () => line('sieve-early', 'Not yet: something standing would still fall.'),
  stopRight: () => line('sieve-stop', 'Yes. Nothing more would fall.'),
  neverStarted: () => line('sieve-start', 'Strike something first.'),
};
