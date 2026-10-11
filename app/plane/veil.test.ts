import { describe, expect, it } from 'vitest';
import { Veil } from './veil';

describe('the veil', () => {
  it('hides every stack until it is taken apart', () => {
    const v = new Veil(0.3);
    expect(v.isRevealed(12)).toBe(false);
    expect(v.block(12, 0)).toEqual({ coloured: false, pulse: 0 });
    v.tick(5);
    expect(v.block(12, 2)).toEqual({ coloured: false, pulse: 0 });
  });

  it('reveals one stack and no other', () => {
    const v = new Veil(0.3);
    v.reveal(12);
    expect(v.isRevealed(12)).toBe(true);
    expect(v.isRevealed(18)).toBe(false);
    expect(v.block(18, 0).coloured).toBe(false);
  });

  it('assembles from the bottom block up, one step apart, each block pulsing as it arrives', () => {
    const v = new Veil(0.3);
    v.reveal(12);
    expect(v.block(12, 0).coloured).toBe(true);
    expect(v.block(12, 1).coloured).toBe(false);
    v.tick(0.15);
    expect(v.block(12, 0).pulse).toBeCloseTo(1, 5); // mid-pulse
    v.tick(0.15);
    expect(v.block(12, 1).coloured).toBe(true);
    expect(v.block(12, 2).coloured).toBe(false);
    v.tick(0.3);
    expect(v.block(12, 2).coloured).toBe(true);
    v.tick(1);
    expect(v.block(12, 0)).toEqual({ coloured: true, pulse: 0 });
    expect(v.assembling(12, 3)).toBe(false);
  });

  it('knows when a stack is still assembling, so the road repaints only then', () => {
    const v = new Veil(0.3);
    expect(v.animating()).toBe(false);
    v.reveal(12);
    expect(v.assembling(12, 3)).toBe(true);
    expect(v.animating()).toBe(true);
    v.tick(0.89);
    expect(v.assembling(12, 3)).toBe(true);
    v.tick(0.02);
    expect(v.assembling(12, 3)).toBe(false);
    v.tick(4);
    expect(v.animating()).toBe(false);
  });

  it('revealing twice does not restart the assembly', () => {
    const v = new Veil(0.3);
    v.reveal(12);
    v.tick(1);
    v.reveal(12);
    expect(v.block(12, 2).coloured).toBe(true);
  });

  it('with the veil off every stack is as described, as in the map app', () => {
    const v = new Veil(0.3, false);
    expect(v.isRevealed(12)).toBe(true);
    expect(v.block(12, 5)).toEqual({ coloured: true, pulse: 0 });
    expect(v.animating()).toBe(false);
  });

  it('lifting the veil shows all at once', () => {
    const v = new Veil(0.3);
    v.on = false;
    expect(v.isRevealed(97)).toBe(true);
    expect(v.block(30, 2).coloured).toBe(true);
  });
});
