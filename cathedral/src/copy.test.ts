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
  it('are the lines Dalton Gadapee approved on Oct 11, 2026, and an unknown id is still a draft', () => {
    const lines = everyLine();
    const ids = [...new Set(lines.map((l) => l.id))].sort();
    expect([...REVIEWED_LINES].sort()).toEqual(ids);
    for (const l of lines) expect(l.draft, l.id).toBe(false);
    expect(line('not-a-real-line', 'anything').draft).toBe(true);
  });

  it('never carry the word "draft" in their words: the tag is the style’s, not the sentence’s', () => {
    for (const l of everyLine()) expect(l.text, l.id).not.toMatch(/draft/i);
  });

  it('have a well-formed id each, and there are plenty', () => {
    const ids = new Set(everyLine().map((l) => l.id));
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(ids.size).toBeGreaterThan(25);
  });

  it('becomes a draft again only when its own id is taken back', () => {
    const set = REVIEWED_LINES as Set<string>;
    set.delete('place-cathedral');
    try {
      expect(places.cathedral().draft).toBe(true);
      expect(places.threshold().draft).toBe(false);
      expect(line('place-cathedral', 'anything').draft).toBe(true);
    } finally {
      set.add('place-cathedral');
    }
    expect(places.cathedral().draft).toBe(false);
  });

  it('never name the answer to the road or the sieve', () => {
    for (const l of everyLine()) expect(l.text, l.id).not.toMatch(/exactly one way|only one way|are the primes|only divisors|square root/i);
  });
});
