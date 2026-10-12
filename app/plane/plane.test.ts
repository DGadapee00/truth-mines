import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlane } from '../../core/schema';
import { pickTarget, rayCylinder, type Target } from './focus';
import { Travel, shortestArc, smooth, travelSeconds } from './travel';
import { PlaneWalk, onGround, type Blocker } from './walk';

const url = new URL('../../data/plane-number-theory.json', import.meta.url);
if (!existsSync(url)) throw new Error('data/plane-number-theory.json is missing: run `npm run data` first');
const plane = parsePlane(JSON.parse(readFileSync(url, 'utf8')));

describe('walking', () => {
  const blockers: Blocker[] = plane.road.columns.map((c) => ({ x: c.pos[0], z: c.pos[2], r: c.radius }));
  it('starts every stop on the ground', () => {
    for (const s of plane.stops) expect(onGround(plane.ground, s.pos[0], s.pos[2])).toBe(true);
  });
  it('stays on the ground however far you push', () => {
    const w = new PlaneWalk(plane.ground, blockers);
    const stop = plane.stops[0]!;
    w.place(stop.pos[0], stop.pos[2]);
    for (let i = 0; i < 400; i++) w.move(0.5, 0);
    expect(onGround(plane.ground, w.x, w.z)).toBe(true);
    for (let i = 0; i < 400; i++) w.move(-0.5, 0.2);
    expect(onGround(plane.ground, w.x, w.z)).toBe(true);
  });
  it('slides round a column instead of through it', () => {
    const c = plane.road.columns[11]!; // 12
    const w = new PlaneWalk(plane.ground, blockers);
    w.place(c.pos[0] + 2, c.pos[2]);
    for (let i = 0; i < 40; i++) w.move(-0.1, 0);
    expect(Math.hypot(w.x - c.pos[0], w.z - c.pos[2])).toBeGreaterThanOrEqual(c.radius + 0.34);
  });
  it('lets you through a column that has crumbled', () => {
    const b: Blocker = { x: 0, z: 0, r: 0.7 };
    const w = new PlaneWalk({ spine: [[-5, 0, 0], [5, 0, 0]], half_width: 4, square: { centre: [100, 0, 100], yaw: 0, half: 1 } }, [b]);
    w.place(2, 0);
    for (let i = 0; i < 40; i++) w.move(-0.1, 0);
    expect(w.x).toBeGreaterThan(0.9);
    b.r = 0;
    w.place(2, 0);
    for (let i = 0; i < 40; i++) w.move(-0.1, 0);
    expect(w.x).toBeLessThan(0);
  });
});

describe('focus', () => {
  const t: Target = { id: 'a', x: 0, z: 5, r: 0.5, y0: 0, y1: 2 };
  it('hits a column in front and misses one beside', () => {
    expect(rayCylinder({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 1 }, t)).toBeCloseTo(4.5);
    expect(rayCylinder({ x: 2, y: 1.6, z: 0 }, { x: 0, y: 0, z: 1 }, t)).toBeNull();
  });
  it('misses over the top and hits the top cap from above', () => {
    expect(rayCylinder({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 1 }, t)).toBeNull();
    expect(rayCylinder({ x: 0, y: 3, z: 3 }, { x: 0, y: -0.5, z: 0.5 }, t)).not.toBeNull();
  });
  it('does not hit a column behind', () => {
    expect(rayCylinder({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, t)).toBeNull();
  });
  it('picks the nearest of two', () => {
    const far: Target = { ...t, id: 'far', z: 9 };
    expect(pickTarget({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, [far, t])?.id).toBe('a');
  });
});

describe('travel', () => {
  it('eases in and out: slow at both ends, monotone between', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    let last = 0;
    for (let k = 0; k <= 1; k += 0.01) {
      expect(smooth(k)).toBeGreaterThanOrEqual(last);
      last = smooth(k);
    }
    expect(smooth(0.01)).toBeLessThan(0.001);
    expect(1 - smooth(0.99)).toBeLessThan(0.001);
  });
  it('takes between 1.5 and 8 seconds', () => {
    expect(travelSeconds(0)).toBe(1.5);
    expect(travelSeconds(40)).toBe(4);
    expect(travelSeconds(5000)).toBe(8);
  });
  it('arrives exactly, turning the short way, and keeps the heading in a headset', () => {
    const a = { x: 0, z: 0, heading: 3, pitch: 0 };
    const b = { x: 30, z: 40, heading: -3, pitch: -0.2 };
    const t = new Travel(a, b);
    expect(t.at(0).pose).toEqual(a);
    const end = t.at(t.duration).pose;
    expect(end.x).toBeCloseTo(30);
    expect(end.z).toBeCloseTo(40);
    expect(shortestArc(end.heading, b.heading)).toBeCloseTo(0);
    // 3 -> -3 is a turn of 0.28 rad through π, not -6 rad.
    expect(Math.abs(shortestArc(3, -3))).toBeLessThan(0.3);
    const hs = new Travel(a, b, true);
    expect(hs.at(hs.duration / 2).pose.heading).toBe(3);
    expect(hs.at(hs.duration).pose.pitch).toBe(0);
  });
});
