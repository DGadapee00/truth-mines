import type { CathedralDoor, CathedralFile, Vec3 } from '../../../core/schema';

/**
 * Which door a ray from the visitor's eye or controller meets, if any: the nearest door whose
 * panel the ray crosses, from inside the hall. Doors are flat panels on the wall facing the centre
 * (door.yaw), `width` wide and `height` tall.
 */
export function pickDoor(doors: readonly CathedralDoor[], hall: CathedralFile['hall'], origin: Vec3, dir: Vec3): CathedralDoor | null {
  let best: CathedralDoor | null = null;
  let bestT = Infinity;
  const half = hall.door.width / 2;
  for (const d of doors) {
    const nx = Math.sin(d.yaw);
    const nz = Math.cos(d.yaw); // the way the door faces: into the hall
    const denom = dir[0] * nx + dir[2] * nz;
    if (denom >= -1e-6) continue; // the ray is not heading into the door's front
    const t = ((d.pos[0] - origin[0]) * nx + (d.pos[2] - origin[2]) * nz) / denom;
    if (t <= 0 || t >= bestT) continue;
    const hx = origin[0] + dir[0] * t - d.pos[0];
    const hy = origin[1] + dir[1] * t;
    const hz = origin[2] + dir[2] * t - d.pos[2];
    const side = hx * Math.cos(d.yaw) - hz * Math.sin(d.yaw); // along the door's left
    if (Math.abs(side) <= half && hy >= 0 && hy <= hall.door.height) {
      best = d;
      bestT = t;
    }
  }
  return best;
}
