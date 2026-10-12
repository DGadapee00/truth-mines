import { describe, expect, it } from 'vitest';
import { parseCathedral } from '../../../core/schema';
import { readData } from './data';
import { pickDoor } from './pick-door';

const c = parseCathedral(readData('cathedral.json'));
const EYE = 1.65;

/** The direction from the eye to a point on a door, `up` metres above the floor and `side` metres to its left. */
function toDoor(i: number, up: number, side = 0): [number, number, number] {
  const d = c.doors[i]!;
  const left: [number, number] = [Math.cos(d.yaw), -Math.sin(d.yaw)];
  const x = d.pos[0] + left[0] * side;
  const z = d.pos[2] + left[1] * side;
  const v: [number, number, number] = [x, up - EYE, z];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
}

describe('pickDoor', () => {
  it('finds each door from the middle of the hall when looking at it', () => {
    for (let i = 0; i < c.doors.length; i++) {
      const hit = pickDoor(c.doors, c.hall, [0, EYE, 0], toDoor(i, 2));
      expect(hit?.plane, c.doors[i]!.plane).toBe(c.doors[i]!.plane);
    }
  });

  it('finds a door looked at near its edge and misses one just outside it', () => {
    const half = c.hall.door.width / 2;
    expect(pickDoor(c.doors, c.hall, [0, EYE, 0], toDoor(0, 2, half - 0.2))?.plane).toBe(c.doors[0]!.plane);
    expect(pickDoor(c.doors, c.hall, [0, EYE, 0], toDoor(0, 2, half + 1.5))?.plane).not.toBe(c.doors[0]!.plane);
  });

  it('misses a door looked at above its top, and the floor', () => {
    expect(pickDoor(c.doors, c.hall, [0, EYE, 0], toDoor(0, c.hall.door.height + 2))).toBeNull();
    expect(pickDoor(c.doors, c.hall, [0, EYE, 0], [0, -1, 0])).toBeNull();
  });

  it('misses a door whose back is to the ray', () => {
    const d = c.doors[0]!;
    // standing outside the wall behind the door, looking in
    const behind: [number, number, number] = [d.pos[0] * 1.2, EYE, d.pos[2] * 1.2];
    const dir: [number, number, number] = [-d.pos[0] / 24, 0, -d.pos[2] / 24];
    // it crosses the hall and meets the far door's front, but never the back of the door it started behind
    expect(pickDoor(c.doors, c.hall, behind, dir)?.plane).not.toBe(d.plane);
  });

  it('finds a door from off-centre in the hall too', () => {
    const o: [number, number, number] = [6, EYE, -4];
    const d = c.doors[3]!;
    const v: [number, number, number] = [d.pos[0] - o[0], 2 - EYE, d.pos[2] - o[2]];
    const n = Math.hypot(...v);
    expect(pickDoor(c.doors, c.hall, o, [v[0] / n, v[1] / n, v[2] / n])?.plane).toBe(d.plane);
  });

  it('returns nothing for a ray that points away from every wall', () => {
    expect(pickDoor(c.doors, c.hall, [0, EYE, 0], [0, 1, 0])).toBeNull();
  });
});
