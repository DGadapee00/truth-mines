import type { CathedralFile, Vec3 } from '../../../core/schema';

/**
 * The threshold's guided move as plain numbers (CLAUDE.md rule 6): arc length along the rails
 * path advances at the descriptor's speed for each segment, ramping up from rest, between
 * segments, and down to rest at the dais at a bounded acceleration. Nothing here turns the view.
 */
export interface MotionPlan {
  path: Vec3[];
  /** Arc length at each path point */
  arc: number[];
  total: number;
  segments: { s_from: number; s_to: number; speed: number; vignette: number }[];
  /** Metres per second per second */
  accel: number;
  vignetteAt(s: number): number;
}

export function buildPlan(t: CathedralFile['threshold']): MotionPlan {
  const arc = [0];
  for (let i = 1; i < t.path.length; i++) {
    const a = t.path[i - 1] as Vec3;
    const b = t.path[i] as Vec3;
    arc.push((arc[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = arc[arc.length - 1] as number;
  const segments = t.segments.map((g) => ({ s_from: g.s_from, s_to: g.s_to, speed: g.speed, vignette: g.vignette }));
  const fastest = Math.max(...segments.map((g) => g.speed));
  const indexAt = (s: number) => {
    const i = segments.findIndex((g) => s >= g.s_from && s < g.s_to);
    return i === -1 ? segments.length - 1 : i;
  };
  return { path: t.path, arc, total, segments, accel: fastest / t.ease_s, vignetteAt: (s) => (segments[indexAt(s)] as { vignette: number }).vignette };
}

export interface Motion {
  s: number;
  v: number;
  done: boolean;
}

export const newMotion = (): Motion => ({ s: 0, v: 0, done: false });

/** Braking uses 70% of the acceleration limit, so the speed can always keep up with the braking curve and arrives at rest rather than late. */
const BRAKE = 0.7;

/** The speed the move wants at arc length s: this segment's, but braking in time for a slower one and for the end. */
function targetSpeed(s: number, p: MotionPlan): number {
  let i = p.segments.findIndex((g) => s >= g.s_from && s < g.s_to);
  if (i === -1) i = p.segments.length - 1;
  const seg = p.segments[i] as MotionPlan['segments'][number];
  let target = seg.speed;
  const next = p.segments[i + 1];
  if (next && next.speed < seg.speed) target = Math.min(target, Math.sqrt(next.speed * next.speed + 2 * BRAKE * p.accel * Math.max(0, seg.s_to - s)));
  return Math.min(target, Math.sqrt(2 * BRAKE * p.accel * Math.max(0, p.total - s)));
}

/** Advance by dt seconds. Mutates `m`; allocates nothing. */
export function stepMotion(m: Motion, dt: number, p: MotionPlan): void {
  if (m.done) return;
  // A long frame is taken in small steps, so a hitch can neither overshoot the end nor skip an ease.
  let left = dt;
  while (left > 1e-9 && !m.done) {
    const h = Math.min(left, 1 / 120);
    left -= h;
    const want = targetSpeed(m.s, p);
    const dv = want - m.v;
    const limit = p.accel * h;
    m.v += Math.abs(dv) <= limit ? dv : Math.sign(dv) * limit;
    m.s += m.v * h;
    m.v = Math.min(m.v, speedAt(m.s, p)); // never above the descriptor's speed for where we are
    // Done when the braking has run its course (at rest within one step's braking) or the end is reached.
    if (m.s >= p.total || (p.total - m.s < 0.05 && m.v <= 1.5 * limit)) {
      m.s = p.total;
      m.v = 0;
      m.done = true;
    }
  }
}

function speedAt(s: number, p: MotionPlan): number {
  let i = p.segments.findIndex((g) => s >= g.s_from && s < g.s_to);
  if (i === -1) i = p.segments.length - 1;
  return (p.segments[i] as MotionPlan['segments'][number]).speed;
}

/** Where the visitor's feet are at arc length s (clamped to the path). Writes into `out`. */
export function poseAt(p: MotionPlan, s: number, out: Vec3): Vec3 {
  const q = Math.min(Math.max(s, 0), p.total);
  let lo = 0;
  let hi = p.arc.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((p.arc[mid] as number) <= q) lo = mid;
    else hi = mid;
  }
  const a = p.path[lo] as Vec3;
  const b = p.path[hi] as Vec3;
  const span = (p.arc[hi] as number) - (p.arc[lo] as number);
  const f = span > 0 ? (q - (p.arc[lo] as number)) / span : 0;
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  if (q >= p.total) {
    const e = p.path[p.path.length - 1] as Vec3;
    out[0] = e[0];
    out[1] = e[1];
    out[2] = e[2];
  }
  return out;
}
