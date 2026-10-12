/**
 * Guided travel between the plane's stops. It only starts because the visitor asked (a key, a
 * button, a controller press), eases in and out, and never rolls the horizon (CLAUDE.md rule 6).
 */
export interface Pose {
  x: number;
  z: number;
  /** Descriptor yaw: the heading faced, (sin, cos) */
  heading: number;
  pitch: number;
}

export const smooth = (k: number) => {
  const t = Math.min(1, Math.max(0, k));
  return t * t * (3 - 2 * t);
};

/** Seconds for a move of `dist` metres: brisk, but never abrupt and never tedious. */
export const travelSeconds = (dist: number) => Math.min(8, Math.max(1.5, dist / 10));

/** The turn from `a` to `b` by the short way round, in (-π, π]. */
export const shortestArc = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Travel {
  readonly duration: number;
  constructor(
    readonly from: Pose,
    readonly to: Pose,
    /** In a headset the view is never turned for you */
    readonly keepHeading = false,
  ) {
    this.duration = travelSeconds(Math.hypot(to.x - from.x, to.z - from.z));
  }
  at(t: number): { pose: Pose; k: number; done: boolean } {
    const k = Math.min(1, Math.max(0, t / this.duration));
    const e = smooth(k);
    const { from, to } = this;
    return {
      k,
      done: k >= 1,
      pose: {
        x: from.x + (to.x - from.x) * e,
        z: from.z + (to.z - from.z) * e,
        heading: this.keepHeading ? from.heading : from.heading + shortestArc(from.heading, to.heading) * e,
        pitch: this.keepHeading ? from.pitch : from.pitch + (to.pitch - from.pitch) * e,
      },
    };
  }
}
