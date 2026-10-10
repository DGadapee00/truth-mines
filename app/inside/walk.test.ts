import { describe, expect, it } from 'vitest';
import { inWalkable } from './walk';

const hall = { radius: 10, galleries: [] as { a0: number; a1: number; inner_radius: number; outer_radius: number }[] };

describe('inWalkable', () => {
  it('stays inside the hall and stops short of the wall', () => {
    expect(inWalkable(hall, 0, 0)).toBe(true);
    expect(inWalkable(hall, 0, 9.4)).toBe(true);
    expect(inWalkable(hall, 0, 9.7)).toBe(false);
  });

  it('crosses a gallery mouth and the rank beyond it, and not the solid side', () => {
    const room = {
      radius: 10,
      galleries: [
        { a0: 1, a1: 2, inner_radius: 10, outer_radius: 18, },
        { a0: 1, a1: 2, inner_radius: 18, outer_radius: 30, },
      ],
    };
    const mid = 1.5;
    const x = (r: number) => r * Math.sin(mid);
    const z = (r: number) => r * Math.cos(mid);
    expect(inWalkable(room, x(9.8), z(9.8))).toBe(true);
    expect(inWalkable(room, x(12), z(12))).toBe(true);
    expect(inWalkable(room, x(24), z(24))).toBe(true);
    expect(inWalkable(room, 9.8 * Math.sin(0), 9.8 * Math.cos(0))).toBe(false);
    expect(inWalkable(room, x(29.7), z(29.7))).toBe(false);
    const side = 1.02;
    expect(inWalkable(room, 20 * Math.sin(side), 20 * Math.cos(side))).toBe(false);
  });
});
