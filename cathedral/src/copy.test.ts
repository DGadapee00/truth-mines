import { describe, expect, it } from 'vitest';
import { activity, doors, hints, intro, line, places, REVIEWED_LINES } from './copy';

const everyLine = () => [
  activity.lookFirst(), activity.rightStack('12 = 2² · 3'), activity.alreadyApart('12 = 2² · 3'), activity.notPrime(4), activity.notPrime(1), activity.wrongProduct(6, 12), activity.nothing(),
  activity.gone(4), activity.notNext(), activity.outOfRange(), activity.alreadyStruck(2), activity.stopEarly(), activity.stopRight(), activity.neverStarted(),
  places.threshold(), places.cathedral(), places.plane(),
  doors.open('Number theory', 'Click, or press Enter,'), doors.dim('Algebra'), doors.sealed('Topology'), doors.notOpen('Sets'), doors.unbuilt('Algebra'),
  ...Object.values(hints).map((h) => h()),
  intro.gate(), intro.ready(),
];

describe('the app’s own lines', () => {
  it('are all drafts until a person approves them: nothing has been approved yet', () => {
    expect(REVIEWED_LINES.size).toBe(0);
    for (const l of everyLine()) expect(l.draft, l.id).toBe(true);
  });

  it('never carry the word "draft" in their words: the tag is the style’s, not the sentence’s', () => {
    for (const l of everyLine()) expect(l.text, l.id).not.toMatch(/draft/i);
  });

  it('have a well-formed id each, and there are plenty', () => {
    const ids = new Set(everyLine().map((l) => l.id));
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(ids.size).toBeGreaterThan(25);
  });

  it('stop being drafts once their id is approved, and only that id', () => {
    const set = REVIEWED_LINES as Set<string>;
    set.add('place-cathedral');
    try {
      expect(places.cathedral().draft).toBe(false);
      expect(places.threshold().draft).toBe(true);
      expect(line('place-cathedral', 'anything').draft).toBe(false);
    } finally {
      set.delete('place-cathedral');
    }
    expect(places.cathedral().draft).toBe(true);
  });

  it('never name the answer to the road or the sieve', () => {
    for (const l of everyLine()) expect(l.text, l.id).not.toMatch(/exactly one way|only one way|are the primes|only divisors|square root/i);
  });
});
