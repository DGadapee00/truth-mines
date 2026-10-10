import type { PlaneFile } from '../../core/schema';

/**
 * Where you stand on the plane and how you walk. The walkable ground is the descriptor's:
 * a strip along the spine (road, approach, overlook road) and the plaza's square. Columns are
 * circles you slide round. Nothing here moves you unless the caller does (CLAUDE.md rule 6).
 */
export const EYE = 1.65;
const EDGE = 0.25; // stay this far inside the ground's edge
const BODY = 0.35; // clearance round a column's footprint

export interface Blocker {
  x: number;
  z: number;
  /** Footprint radius; 0 stops it blocking (a crumbled column) */
  r: number;
}

type Ground = PlaneFile['ground'];

/** Distance from (x, z) to the spine polyline. */
export function distToSpine(spine: Ground['spine'], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < spine.length; i++) {
    const a = spine[i] as [number, number, number];
    const b = spine[i + 1] as [number, number, number];
    const abx = b[0] - a[0];
    const abz = b[2] - a[2];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[2]) * abz) / Math.max(1e-12, abx * abx + abz * abz)));
    best = Math.min(best, Math.hypot(x - (a[0] + t * abx), z - (a[2] + t * abz)));
  }
  return best;
}

export function onGround(g: Ground, x: number, z: number, inset = EDGE): boolean {
  if (distToSpine(g.spine, x, z) <= g.half_width - inset) return true;
  const sq = g.square;
  const dx = x - sq.centre[0];
  const dz = z - sq.centre[2];
  const c = Math.cos(sq.yaw);
  const s = Math.sin(sq.yaw);
  return Math.abs(dx * c - dz * s) <= sq.half - inset && Math.abs(dx * s + dz * c) <= sq.half - inset;
}

export class PlaneWalk {
  x = 0;
  z = 0;
  constructor(
    private readonly ground: Ground,
    private readonly blockers: Blocker[],
  ) {}

  place(x: number, z: number) {
    this.x = x;
    this.z = z;
  }

  /** Is this spot free: on the ground and clear of every column? */
  free(x: number, z: number): boolean {
    if (!onGround(this.ground, x, z)) return false;
    return this.blockers.every((b) => b.r <= 0 || Math.hypot(x - b.x, z - b.z) >= b.r + BODY - 1e-6);
  }

  /** Walk by (dx, dz), sliding along ground edges and round columns. */
  move(dx: number, dz: number) {
    let nx = this.x + dx;
    let nz = this.z + dz;
    for (const b of this.blockers) {
      if (b.r <= 0) continue;
      const ox = nx - b.x;
      const oz = nz - b.z;
      const d = Math.hypot(ox, oz);
      const min = b.r + BODY;
      if (d < min && d > 1e-6) {
        nx = b.x + (ox / d) * min;
        nz = b.z + (oz / d) * min;
      }
    }
    if (onGround(this.ground, nx, nz)) {
      this.x = nx;
      this.z = nz;
    } else if (onGround(this.ground, nx, this.z)) this.x = nx;
    else if (onGround(this.ground, this.x, nz)) this.z = nz;
  }
}
