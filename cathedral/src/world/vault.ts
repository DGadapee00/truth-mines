import { BufferGeometry, Color, Float32BufferAttribute, LineBasicMaterial, LineSegments } from '@iwsdk/core';
import type { CathedralFile } from '../../../core/schema';
import { PALETTE } from './palette';

/**
 * The vault: the descriptor's twelve-sided rings, each a golden-ratio smaller than the last and
 * turned a little further, joined by a rib from every corner to the next ring's. One LineSegments.
 */
export function buildVault(c: CathedralFile): LineSegments {
  const pos: number[] = [];
  const col: number[] = [];
  const low = new Color(PALETTE.gold);
  const high = new Color(PALETTE.starlight);
  const tmp = new Color();
  const tiers = c.vault.tiers;
  const corner = (t: (typeof tiers)[number], k: number): [number, number, number] => {
    const a = t.rotation + (2 * Math.PI * k) / t.sides;
    return [t.radius * Math.cos(a), t.y, t.radius * Math.sin(a)];
  };
  const push = (a: [number, number, number], b: [number, number, number], f: number) => {
    pos.push(...a, ...b);
    tmp.copy(low).lerp(high, f);
    col.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
  };
  tiers.forEach((t, i) => {
    const f = i / Math.max(1, tiers.length - 1);
    for (let k = 0; k < t.sides; k++) {
      push(corner(t, k), corner(t, (k + 1) % t.sides), f);
      const up = tiers[i + 1];
      if (up && up.sides === t.sides) push(corner(t, k), corner(up, k), f);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  const lines = new LineSegments(g, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
  lines.name = 'vault';
  lines.frustumCulled = false;
  return lines;
}
