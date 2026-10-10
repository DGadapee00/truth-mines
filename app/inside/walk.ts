import * as THREE from 'three';
import type { Gallery } from '../../core/schema';
import { liftAngle } from './geometry';
import type { Passage, Star } from './star';

/**
 * Where you stand in the Inside view, and how you move.
 *
 * In a chamber you walk anywhere on the floor except through the wall or a pillar; the wall opens
 * only at doorways. In a tunnel you move along its floor line (s) and across it (u), never through
 * its walls. Reaching the far end of a tunnel arrives in the next chamber: the caller rebuilds the
 * local scene there and this walker carries on in the new chamber's frame.
 *
 * Guided travel (Journey, and the headset's tunnel travel) follows a route with an ease in and an
 * ease out; it only ever starts because the student asked for it (CLAUDE.md rule 6).
 */
export const EYE = 1.65;
const WALL_GAP = 0.45;

type WalkRoom = { radius: number; galleries: Pick<Gallery, 'a0' | 'a1' | 'inner_radius' | 'outer_radius'>[] };

/**
 * Hall disk, or a gallery wedge from the descriptor, inset from the solid walls.
 * A mouth is an opening in the hall wall, so the floor runs straight through it.
 */
export function inWalkable(ch: WalkRoom, x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r <= ch.radius - WALL_GAP) return true;
  const a = Math.atan2(x, z);
  let inner = Infinity;
  let outer = -1;
  let opensHall = false;
  for (const g of ch.galleries) {
    const y = liftAngle(a, g.a0);
    const inset = WALL_GAP / Math.max(r, 1);
    if (y <= g.a0 + inset || y >= g.a1 - inset) continue;
    inner = Math.min(inner, g.inner_radius);
    outer = Math.max(outer, g.outer_radius);
    if (g.inner_radius <= ch.radius + 0.05) opensHall = true;
  }
  if (!(outer > 0) || r > outer - WALL_GAP) return false;
  // The mouth meets the hall, so the inset that keeps you off a solid wall does not apply there.
  if (opensHall) return true;
  return r >= inner - 0.05;
}

export interface Floor {
  /** Floor point under you, in the current chamber's frame */
  pos: THREE.Vector3;
  /** Set while in a tunnel */
  passage: Passage | null;
  /** 0 at this chamber's doorway, 1 at the far one */
  along: number;
}

export function pointOn(p: Passage, s: number, u: number): { pos: THREE.Vector3; heading: number } {
  const total = p.s.at(-1) as number;
  const d = Math.max(0, Math.min(total, s));
  let i = p.s.findIndex((v) => v >= d);
  if (i <= 0) i = 1;
  const a = p.path[i - 1] as THREE.Vector3;
  const b = p.path[i] as THREE.Vector3;
  const k = (d - (p.s[i - 1] as number)) / Math.max(1e-9, (p.s[i] as number) - (p.s[i - 1] as number));
  const pos = a.clone().lerp(b, k);
  const fx = b.x - a.x;
  const fz = b.z - a.z;
  const len = Math.hypot(fx, fz) || 1;
  // Across: to the left of the direction of travel (the same `across` as the geometry).
  pos.x += (-fz / len) * u;
  pos.z += (fx / len) * u;
  return { pos, heading: Math.atan2(fx, fz) };
}

export class Walker {
  /** Chamber floor position, or the tunnel coordinates */
  x = 0;
  z = 0;
  passage: Passage | null = null;
  s = 0;
  u = 0;
  constructor(public star: Star) {}

  place(x: number, z: number) {
    this.passage = null;
    this.x = x;
    this.z = z;
  }

  floor(): Floor {
    if (!this.passage) return { pos: new THREE.Vector3(this.x, 0, this.z), passage: null, along: 0 };
    const total = this.passage.s.at(-1) as number;
    return { pos: pointOn(this.passage, this.s, this.u).pos, passage: this.passage, along: this.s / total };
  }

  /**
   * Walk by (dx, dz) in the current frame. Returns the passage whose far end was reached, if any:
   * the caller then moves into that chamber.
   */
  move(dx: number, dz: number): Passage | null {
    const ch = this.star.chamber;
    if (!this.passage) {
      let nx = this.x + dx;
      let nz = this.z + dz;
      // Pillars: slide round them.
      for (const p of ch.pillars) {
        const ox = nx - p.pos[0];
        const oz = nz - p.pos[2];
        const d = Math.hypot(ox, oz);
        const min = p.radius * 1.08 + 0.35;
        if (d < min && d > 1e-6) {
          nx = p.pos[0] + (ox / d) * min;
          nz = p.pos[2] + (oz / d) * min;
        }
      }
      const door = this.doorAt(nx, nz);
      if (inWalkable(ch, nx, nz)) {
        this.x = nx;
        this.z = nz;
        return null;
      }
      if (door?.past) {
        const start = door.passage.path[0] as THREE.Vector3;
        const next = door.passage.path[1] as THREE.Vector3;
        const fx = next.x - start.x;
        const fz = next.z - start.z;
        const len = Math.hypot(fx, fz) || 1;
        this.passage = door.passage;
        this.s = Math.max(0.01, ((nx - start.x) * fx + (nz - start.z) * fz) / len);
        this.u = ((nx - start.x) * -fz + (nz - start.z) * fx) / len;
        this.clampAcross();
        return null;
      }
      if (door) {
        this.x = nx;
        this.z = nz;
        return null;
      }
      // Stay inside the walkable floor: keep whichever axis still fits.
      if (inWalkable(ch, nx, this.z) || this.doorAt(nx, this.z)) this.x = nx;
      else if (inWalkable(ch, this.x, nz) || this.doorAt(this.x, nz)) this.z = nz;
      return null;
    }
    // In a tunnel: along and across the floor line.
    const p = this.passage;
    const { heading } = pointOn(p, this.s, 0);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    this.s += dx * fx + dz * fz;
    this.u += dx * -fz + dz * fx;
    this.clampAcross();
    const total = p.s.at(-1) as number;
    if (this.s <= 0) {
      // Back into this chamber.
      const at = pointOn(p, 0, this.u).pos;
      this.passage = null;
      this.x = at.x - fx * 0.1;
      this.z = at.z - fz * 0.1;
      return null;
    }
    if (this.s >= total) return p;
    return null;
  }

  /** A doorway whose opening this point has reached. `past` means the step leaves into the tunnel. */
  private doorAt(x: number, z: number): { passage: Passage; past: boolean } | null {
    const r = Math.hypot(x, z);
    const a = Math.atan2(x, z);
    for (const p of this.star.passages) {
      const doorR = Math.hypot(p.portal.pos[0], p.portal.pos[2]);
      const half = (p.portal.width / 2 - WALL_GAP) / doorR;
      if (!(half > 0)) continue;
      const diff = Math.abs(Math.atan2(Math.sin(a - p.portal.yaw), Math.cos(a - p.portal.yaw)));
      if (diff < half && r > doorR - WALL_GAP) return { passage: p, past: r > doorR - 0.05 };
    }
    return null;
  }

  private clampAcross() {
    if (!this.passage) return;
    const half = this.passage.tunnel.width / 2 - WALL_GAP;
    this.u = Math.max(-half, Math.min(half, this.u));
  }
}

/** A route for guided travel: points on the floor, walked at a steady pace with eased ends. */
export class Route {
  readonly s: number[] = [0];
  constructor(
    readonly points: THREE.Vector3[],
    readonly speed = 5,
  ) {
    for (let i = 1; i < points.length; i++) this.s.push((this.s[i - 1] as number) + (points[i] as THREE.Vector3).distanceTo(points[i - 1] as THREE.Vector3));
  }
  get length() {
    return this.s.at(-1) as number;
  }
  /** Seconds, with time to ease in and out. */
  get duration() {
    return Math.max(2.5, this.length / this.speed + 1.2);
  }
  /** Floor point and heading at time t (seconds). Eased: gentle start, gentle stop. */
  at(t: number): { pos: THREE.Vector3; heading: number; done: boolean } {
    const k = Math.min(1, Math.max(0, t / this.duration));
    const e = k * k * (3 - 2 * k);
    const d = e * this.length;
    let i = this.s.findIndex((v) => v >= d);
    if (i <= 0) i = 1;
    const a = this.points[i - 1] as THREE.Vector3;
    const b = this.points[i] as THREE.Vector3;
    const f = (d - (this.s[i - 1] as number)) / Math.max(1e-9, (this.s[i] as number) - (this.s[i - 1] as number));
    // Look a few metres ahead, so the view turns smoothly into bends.
    const ahead = this.pointAt(Math.min(this.length, d + 3));
    const pos = a.clone().lerp(b, f);
    return { pos, heading: Math.atan2(ahead.x - pos.x, ahead.z - pos.z), done: k >= 1 };
  }
  private pointAt(d: number): THREE.Vector3 {
    let i = this.s.findIndex((v) => v >= d);
    if (i <= 0) i = 1;
    const a = this.points[i - 1] as THREE.Vector3;
    const b = this.points[i] as THREE.Vector3;
    const f = (d - (this.s[i - 1] as number)) / Math.max(1e-9, (this.s[i] as number) - (this.s[i - 1] as number));
    return a.clone().lerp(b, f);
  }
}
