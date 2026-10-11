import { describe, expect, it } from 'vitest';
import { doorLook } from './door-look';

describe('doorLook', () => {
  it('lights a frontier door, shows a dim one and nearly hides a sealed one', () => {
    const f = doorLook('frontier');
    const d = doorLook('dim');
    const s = doorLook('sealed');
    expect(f.glow).toBeGreaterThan(d.glow);
    expect(d.glow).toBeGreaterThan(s.glow);
    expect(f.opacity).toBeGreaterThan(d.opacity);
    expect(d.opacity).toBeGreaterThan(s.opacity);
    expect(s.opacity).toBeGreaterThan(0); // sealed doors are still seen: they beckon
  });

  it('gives only a frontier door a pedestal, a living preview and a way in', () => {
    expect(doorLook('frontier')).toMatchObject({ pedestal: true, preview: true, enterable: true });
    for (const state of ['dim', 'sealed'] as const) expect(doorLook(state)).toMatchObject({ pedestal: false, preview: false, enterable: false });
  });

  it('gives each state its own colour', () => {
    const colours = new Set((['frontier', 'dim', 'sealed'] as const).map((s) => doorLook(s).colour));
    expect(colours.size).toBe(3);
  });
});
