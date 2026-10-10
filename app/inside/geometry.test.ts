import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Chamber, Gallery, Portal, Tunnel, Vec3 } from '../../core/schema';
import { archAt, chamberGeometry, tunnelGeometry } from './geometry';

const portal = (yaw: number, r: number, width: number): Portal => ({
  dir: 'down',
  target: 'far',
  tunnel: 'far>home',
  index: 0,
  yaw,
  pos: [r * Math.sin(yaw), 0, r * Math.cos(yaw)],
  width,
  height: 3.4,
  plaque: { pos: [0, 3.95, 0], yaw: yaw + Math.PI, width: 3.2 },
});

const chamber = (radius: number, door: Portal, galleries: Gallery[] = []): Chamber => ({
  id: 'home',
  kind: 'theorem',
  depth: 0,
  floor_y: 0,
  radius,
  height: 6,
  dome: 7.08,
  statement: { pos: [0, 3.45, -radius + 1], yaw: 0, size: [6, 4.5] },
  spawn: { pos: [0, 0, 2], yaw: Math.PI },
  portals: [door],
  pillars: [],
  galleries,
  light: 1,
  fog: 0.01,
  rock: '#8e9ab8',
});

/** A straight, level tunnel out of `door`, 30 m long. */
function tunnelFrom(door: Portal, height = 3.4): { t: Tunnel; path: THREE.Vector3[] } {
  const out = new THREE.Vector3(Math.sin(door.yaw), 0, Math.cos(door.yaw));
  const start = new THREE.Vector3(...door.pos);
  const path = Array.from({ length: 9 }, (_, k) => start.clone().addScaledVector(out, (30 * k) / 8));
  const t: Tunnel = {
    id: 'far>home',
    upper: 'home',
    lower: 'far',
    upper_portal: 0,
    lower_portal: 0,
    drop: 0,
    length: 30,
    width: door.width,
    height,
    feeding_lemmas: 0,
    chain_length: 0,
    ornament: { level: 0, rib_spacing: 0 },
    path: path.map((p) => [p.x, p.y, p.z] as Vec3),
    lower_in_upper: { pos: [0, 0, 0], yaw: 0 },
    markers: [],
    light: [1, 1],
    fog: [0.01, 0.01],
    rock: ['#8e9ab8', '#8e9ab8'],
  };
  return { t, path };
}

/**
 * Rays from inside the hall at points in a band around the doorway's outline. Every one must meet
 * rock: the wall beside or above the doorway, or the tunnel's walls and vault past it. The tunnel's
 * far end is capped here, since in the mine the next chamber closes it. The sample points are set
 * off the mesh's own edges, so no ray grazes the seam between two triangles.
 */
function leaks(ch: Chamber, door: Portal, wall: number, origins: THREE.Vector3[], tunnelHeight = 3.4): string[] {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const { t, path } = tunnelFrom(door, tunnelHeight);
  const side = new THREE.Vector3(Math.cos(door.yaw), 0, -Math.sin(door.yaw));
  const out = new THREE.Vector3(Math.sin(door.yaw), 0, Math.cos(door.yaw));
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(door.width, tunnelHeight), material);
  cap.position.copy(path.at(-1) as THREE.Vector3).setY(tunnelHeight / 2);
  cap.rotation.y = door.yaw;
  cap.updateMatrixWorld();
  const meshes = [new THREE.Mesh(chamberGeometry(ch), material), new THREE.Mesh(tunnelGeometry(t, path), material), cap];
  const ray = new THREE.Raycaster();
  const found: string[] = [];
  const half = door.width / 2;
  for (let u = -half - 0.4137; u <= half + 0.4; u += 0.1) {
    for (let y = 0.1171; y < ch.height - 0.1; y += 0.1) {
      // On the wall's circle, `u` across the doorway's centre line.
      const along = Math.sqrt(Math.max(0, wall * wall - u * u));
      const target = new THREE.Vector3().addScaledVector(side, u).addScaledVector(out, along).setY(y);
      for (const o of origins) {
        ray.set(o, target.clone().sub(o).normalize());
        if (ray.intersectObjects(meshes, false).length === 0) found.push(`u ${u.toFixed(1)} y ${y.toFixed(1)} from ${o.toArray().map((v) => v.toFixed(1)).join(',')}`);
      }
    }
  }
  return found;
}

describe('archAt', () => {
  it('is the tunnel vault: the apex in the middle, the springing at the sides', () => {
    // The vault is a polygon, so the middle sits a little under the apex.
    expect(archAt(0, 4, 3.4)).toBeGreaterThan(3.3);
    expect(archAt(0, 4, 3.4)).toBeLessThanOrEqual(3.4);
    expect(archAt(-2, 4, 3.4)).toBeCloseTo(3.4 * 0.62, 5);
    expect(archAt(2, 4, 3.4)).toBeCloseTo(3.4 * 0.62, 5);
    expect(archAt(1, 4, 3.4)).toBeGreaterThan(archAt(1.8, 4, 3.4));
  });
});

describe('a doorway and its tunnel meet with no hole into the void', () => {
  it('on the round wall of a small hall, with the widest tunnel', () => {
    const door = portal(0.4, 8, 5);
    const ch = chamber(8, door);
    const toward = new THREE.Vector3(Math.sin(0.4), 0, Math.cos(0.4));
    const origins = [new THREE.Vector3(0, 1.65, 0), toward.clone().multiplyScalar(4).setY(1.0), toward.clone().multiplyScalar(5).setY(3.0), new THREE.Vector3(-3, 1.65, 2)];
    expect(leaks(ch, door, 8, origins)).toEqual([]);
  });

  it('on a hall with one doorway, which faces yaw 0 where the wall angles wrap', () => {
    const door = portal(0, 9, 3);
    const ch = chamber(9, door);
    const origins = [new THREE.Vector3(0, 1.65, 0), new THREE.Vector3(0.5, 1.0, 5), new THREE.Vector3(-1, 3.0, 4)];
    expect(leaks(ch, door, 9, origins)).toEqual([]);
    // Nothing missing elsewhere either: straight up, straight down and all round the wall.
    const mesh = new THREE.Mesh(chamberGeometry(ch), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster();
    for (let a = -0.5; a <= 0.5; a += 0.0137) {
      for (const dy of [-1, -0.3, 0.6, 2]) {
        ray.set(new THREE.Vector3(0, 1.65, 0), new THREE.Vector3(Math.sin(a), dy, Math.cos(a)).normalize());
        const hit = ray.intersectObject(mesh, false)[0];
        // Through the doorway's opening is the only way out of the hall.
        const outward = hit ? hit.point : null;
        const throughDoor = dy > -1 && dy < 0.6 && Math.abs(Math.sin(a) * 9) < 1.5;
        if (!throughDoor) expect(outward, `a ${a.toFixed(3)} dy ${dy}`).not.toBeNull();
      }
    }
  });

  it('on the outer wall of a gallery, with a vault taller than the doorway', () => {
    const door = portal(0.1, 20, 4);
    const gallery: Gallery = { subject: 'sets', yaw: 0.1, pos: [0, 0, 15], width: 6, length: 5, height: 6, inner_radius: 15, outer_radius: 20, a0: -0.2, a1: 0.4, portal_indices: [0] };
    const ch = chamber(15, door, [gallery]);
    const toward = new THREE.Vector3(Math.sin(0.1), 0, Math.cos(0.1));
    const origins = [toward.clone().multiplyScalar(16).setY(1.65), toward.clone().multiplyScalar(18).setY(2.5)];
    expect(leaks(ch, door, 20, origins, 3.7)).toEqual([]);
  });
});
