import * as THREE from 'three';
import type { PlaneFile } from '../../core/schema';

/**
 * The ground: a ribbon along the descriptor's spine (the road, the approach, the overlook road)
 * and the plaza's square, in one mesh. The ribbon is the spine thickened by the descriptor's
 * half-width; the corners are mitred so the curve stays smooth.
 */
const ROAD = new THREE.Color(0x15181d);
const PLAZA = new THREE.Color(0x1d2128);

export function groundGeometry(g: PlaneFile['ground']): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const s = g.spine;
  const n = s.length;
  // Left of the direction of travel (dx, dz) is (dz, -dx).
  const dir = (i: number): [number, number] => {
    const a = s[Math.max(0, i - 1)] as [number, number, number];
    const b = s[Math.min(n - 1, i + 1)] as [number, number, number];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    return [dx / len, dz / len];
  };
  for (let i = 0; i < n; i++) {
    const p = s[i] as [number, number, number];
    const [dx, dz] = dir(i);
    for (const side of [1, -1]) {
      pos.push(p[0] + dz * g.half_width * side, 0, p[2] - dx * g.half_width * side);
      col.push(ROAD.r, ROAD.g, ROAD.b);
    }
    if (i + 1 < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const base = pos.length / 3;
  const sq = g.square;
  const c = Math.cos(sq.yaw);
  const sn = Math.sin(sq.yaw);
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = lx * sq.half;
    const z = lz * sq.half;
    pos.push(sq.centre[0] + x * c + z * sn, 0.012, sq.centre[2] - x * sn + z * c);
    col.push(PLAZA.r, PLAZA.g, PLAZA.b);
  }
  idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function groundMesh(g: PlaneFile['ground']): THREE.Mesh {
  const m = new THREE.Mesh(groundGeometry(g), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.name = 'ground';
  return m;
}
