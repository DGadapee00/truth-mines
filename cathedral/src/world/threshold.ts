import { BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from '@iwsdk/core';
import type { CathedralFile } from '../../../core/schema';
import { PALETTE } from './palette';

/**
 * The fractal tunnel: each ring is the descriptor's Sierpinski triangle (27 small triangles at
 * depth 3) scaled to the ring's radius, turned to its angle and set at its place. The rings share
 * one LineSegments, so the whole tunnel is a single draw call. Colour runs from gold at the mouth
 * to starlight at the narrow end.
 */
export function buildThreshold(c: CathedralFile): Group {
  const t = c.threshold;
  const pos: number[] = [];
  const col: number[] = [];
  const from = new Color(PALETTE.gold);
  const to = new Color(PALETTE.starlight);
  const tmp = new Color();
  t.rings.forEach((ring, i) => {
    const cos = Math.cos(ring.rotation);
    const sin = Math.sin(ring.rotation);
    tmp.copy(from).lerp(to, i / Math.max(1, t.rings.length - 1));
    for (const tri of t.motif.triangles) {
      for (let e = 0; e < 3; e++) {
        const a = tri[e] as [number, number];
        const b = tri[(e + 1) % 3] as [number, number];
        for (const p of [a, b]) {
          const x = p[0] * ring.radius;
          const y = p[1] * ring.radius;
          pos.push(ring.pos[0] + x * cos - y * sin, ring.pos[1] + x * sin + y * cos, ring.pos[2]);
          col.push(tmp.r, tmp.g, tmp.b);
        }
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  const lines = new LineSegments(g, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  lines.frustumCulled = false;
  const group = new Group();
  group.name = 'threshold';
  group.add(lines);
  return group;
}
