/**
 * Every line of prose the app writes itself for the visitor: what a place says about itself, what a
 * door says, the feedback of the activity. (Not the plane's texts and Trurl's questions, which come from
 * the data with their own review flags, and not Trurl's live replies, which are not written ahead of time.)
 * A line is a draft until a person has approved its exact wording and added its id to REVIEWED_LINES.
 * The screen marks a draft with a tag drawn by the style beside it (ui/style.css, data-draft), never
 * in the words, so a draft is plainly a draft and never reads as finished content.
 *
 * What is not here is interface, not content: button and field labels, the sync status, and the plain
 * error messages (no microphone, secret not accepted). Those carry no voice and say no mathematics.
 */
export interface Line {
  id: string;
  text: string;
  draft: boolean;
}

/**
 * Ids Dalton Gadapee approved on Oct 11, 2026. A line whose id is not here is still a draft.
 * Trurl's sleeping hint and the lost-thread line are not in this file, and stay drafts.
 */
export const REVIEWED_LINES: ReadonlySet<string> = new Set<string>([
  'road-look-first', 'road-right', 'road-again', 'road-not-prime', 'road-product', 'road-nothing',
  'sieve-gone', 'sieve-not-next', 'sieve-range', 'sieve-struck', 'sieve-early', 'sieve-stop', 'sieve-start',
  'place-threshold', 'place-cathedral', 'place-plane',
  'door-open', 'door-dim', 'door-sealed', 'door-not-open', 'door-unbuilt',
  'xr-ready', 'xr-skip', 'xr-look', 'xr-point', 'xr-road', 'xr-plaza', 'xr-overlook', 'xr-talk',
  'intro-gate', 'intro-ready',
]);

/** For tests only: pretend a person approved these ids, as editing the set above would */
export const approveForTest = (...ids: string[]): void => ids.forEach((id) => (REVIEWED_LINES as Set<string>).add(id));

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

/** What a place says about itself */
export const places = {
  threshold: () => line('place-threshold', 'Look around. The way ahead is self-similar all the way down.'),
  cathedral: () => line('place-cathedral', 'Twelve doors. The ones that glow are open to you.'),
  plane: () => line('place-plane', 'A road of integers.'),
};

/** What a door says when it is looked at */
export const doors = {
  open: (name: string, how: string) => line('door-open', `${name}: open. ${how} to go through.`),
  dim: (name: string) => line('door-dim', `${name}: dim. It rests on ideas you have not reached yet.`),
  sealed: (name: string) => line('door-sealed', `${name}: sealed. Nothing on your map leads here yet.`),
  notOpen: (name: string) => line('door-not-open', `${name} is not open to you yet.`),
  unbuilt: (name: string) => line('door-unbuilt', `Behind ${name} nothing is built yet. It will be.`),
};

/** What the headset panel says to do */
export const hints = {
  ready: () => line('xr-ready', 'Pull the trigger to begin.'),
  skip: () => line('xr-skip', 'Pull the trigger to skip.'),
  look: () => line('xr-look', 'Look around. Nothing will turn you.'),
  point: () => line('xr-point', 'Point at a glowing door and pull the trigger. Hold A to talk to Trurl.'),
  road: () => line('xr-road', 'Point at a stack, hold A and say the primes that multiply to it. B goes back.'),
  plaza: () => line('xr-plaza', 'Point at the next prime and pull the trigger, or hold A and say it. Say "done" when nothing more would fall. B goes back.'),
  overlook: () => line('xr-overlook', 'B goes back. Hold A to talk to Trurl.'),
  talk: () => line('xr-talk', 'Hold A to talk to Trurl.'),
};

/** The first screens */
export const intro = {
  gate: () => line('intro-gate', 'A cathedral of mathematics, built from the formal record. You will cross a threshold, choose a door, and earn ideas by doing them and then explaining them to Trurl.'),
  ready: () => line('intro-ready', 'Press begin to cross the threshold. You can look around the whole way; nothing turns your view for you.'),
};
