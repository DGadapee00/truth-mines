import { describe, expect, it } from 'vitest';
import { createFlow } from './flow';

describe('the flow', () => {
  it('runs gate, ready, threshold, cathedral, plane, and back to the cathedral', () => {
    const f = createFlow({ returning: false });
    expect(f.phase()).toBe('gate');
    f.send('continue');
    expect(f.phase()).toBe('ready');
    f.send('begin');
    expect(f.phase()).toBe('threshold');
    f.send('arrived');
    expect(f.phase()).toBe('cathedral');
    f.send('enter-plane');
    expect(f.phase()).toBe('plane');
    f.send('leave-plane');
    expect(f.phase()).toBe('cathedral');
  });

  it('ignores an event that does not belong to the current phase', () => {
    const f = createFlow({ returning: false });
    for (const e of ['begin', 'arrived', 'enter-plane', 'leave-plane', 'skip'] as const) f.send(e);
    expect(f.phase()).toBe('gate');
    f.send('continue');
    f.send('arrived');
    f.send('enter-plane');
    expect(f.phase()).toBe('ready');
  });

  it('never lets a first visit skip the threshold', () => {
    const f = createFlow({ returning: false });
    f.send('continue');
    f.send('begin');
    expect(f.canSkip()).toBe(false);
    f.send('skip');
    expect(f.phase()).toBe('threshold');
  });

  it('lets a return visit skip, but only during the threshold', () => {
    const f = createFlow({ returning: true });
    expect(f.canSkip()).toBe(false);
    f.send('continue');
    f.send('skip');
    expect(f.phase()).toBe('ready');
    f.send('begin');
    expect(f.canSkip()).toBe(true);
    f.send('skip');
    expect(f.phase()).toBe('cathedral');
    expect(f.canSkip()).toBe(false);
  });

  it('says whether the threshold was skipped or played, so only a played one counts as seen', () => {
    const played = createFlow({ returning: true });
    const seen: string[] = [];
    played.subscribe((p, why) => p === 'cathedral' && seen.push(why));
    played.send('continue');
    played.send('begin');
    played.send('arrived');
    expect(seen).toEqual(['arrived']);
    const skipped = createFlow({ returning: true });
    skipped.subscribe((p, why) => p === 'cathedral' && seen.push(why));
    skipped.send('continue');
    skipped.send('begin');
    skipped.send('skip');
    expect(seen).toEqual(['arrived', 'skip']);
  });

  it('notifies subscribers of each change and lets them unsubscribe', () => {
    const f = createFlow({ returning: false });
    const log: string[] = [];
    const off = f.subscribe((p) => log.push(p));
    f.send('continue');
    f.send('begin');
    off();
    f.send('arrived');
    expect(log).toEqual(['ready', 'threshold']);
  });

  it('can leave straight from a headset session ending: back to ready from the threshold, the cathedral or a plane', () => {
    for (const path of [['continue', 'begin'], ['continue', 'begin', 'arrived'], ['continue', 'begin', 'arrived', 'enter-plane']] as const) {
      const f = createFlow({ returning: true });
      for (const e of path) f.send(e);
      f.send('session-ended');
      expect(f.phase()).toBe('ready');
    }
  });
});
