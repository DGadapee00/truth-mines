/**
 * Picking by ray against upright cylinders, which is what a column is to the eye. Cheap enough
 * to run every frame over a hundred columns, and it works the same for a mouse and a controller.
 */
export interface Target {
  id: string;
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}

type V3 = { x: number; y: number; z: number };

/** Distance along the ray to the cylinder, or null. */
export function rayCylinder(o: V3, d: V3, t: Target): number | null {
  const ox = o.x - t.x;
  const oz = o.z - t.z;
  const a = d.x * d.x + d.z * d.z;
  let best: number | null = null;
  const consider = (s: number) => {
    if (s > 0 && (best === null || s < best)) best = s;
  };
  if (a > 1e-12) {
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - t.r * t.r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      for (const s of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const y = o.y + s * d.y;
        if (y >= t.y0 && y <= t.y1) consider(s);
      }
    }
  }
  // The top cap.
  if (Math.abs(d.y) > 1e-9) {
    const s = (t.y1 - o.y) / d.y;
    const x = ox + s * d.x;
    const z = oz + s * d.z;
    if (x * x + z * z <= t.r * t.r) consider(s);
  }
  return best;
}

/** The nearest target the ray hits within `max` metres. */
export function pickTarget(o: V3, d: V3, targets: readonly Target[], max = 60): Target | null {
  let best: Target | null = null;
  let bestT = max;
  for (const t of targets) {
    const s = rayCylinder(o, d, t);
    if (s !== null && s < bestT) {
      bestT = s;
      best = t;
    }
  }
  return best;
}
