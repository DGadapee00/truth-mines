import * as THREE from 'three';
import type { Chamber, Tunnel, Vec3 } from '../../core/schema';

/**
 * Meshes for the Inside view, built from scene descriptors (data/scene.json) and nothing else:
 * every position, size and colour comes from the descriptor. These functions only turn
 * descriptors into triangles (CLAUDE.md: engine independence).
 *
 * The descriptor's yaw convention (heading = (sin yaw, 0, cos yaw)) is three.js's rotation.y.
 */

/** A pose in a parent frame: where a chamber's frame sits, as the descriptors give it. */
export interface Pose {
  pos: THREE.Vector3;
  yaw: number;
}

export const IDENTITY: Pose = { pos: new THREE.Vector3(), yaw: 0 };

export function poseMatrix(p: Pose): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(p.yaw).setPosition(p.pos);
}

export function invertPose(p: Pose): Pose {
  const inv = poseMatrix(p).invert();
  const pos = new THREE.Vector3().setFromMatrixPosition(inv);
  return { pos, yaw: -p.yaw };
}

export const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

const col = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

class Builder {
  pos: number[] = [];
  color: number[] = [];
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: THREE.Color, cb = ca, cc = cb, cd = ca) {
    // a-b-c-d counter-clockwise seen from the side that should face the viewer.
    for (const [p, k] of [
      [a, ca],
      [b, cb],
      [c, cc],
      [a, ca],
      [c, cc],
      [d, cd],
    ] as [THREE.Vector3, THREE.Color][]) {
      this.pos.push(p.x, p.y, p.z);
      this.color.push(k.r, k.g, k.b);
    }
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: THREE.Color) {
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.color.push(k.r, k.g, k.b);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.computeVertexNormals();
    return g;
  }
}

/**
 * A chamber: the round wall with its doorways left open, the floor and a low dome, in the
 * chamber's own frame. Doorway openings are exactly each portal's width and height.
 */
export function chamberGeometry(ch: Chamber): THREE.BufferGeometry {
  const b = new Builder();
  const R = ch.radius;
  const H = ch.height;
  const rock = col(ch.rock);
  const floor = col(ch.rock, 0.62);
  const ceil = col(ch.rock, 0.78);
  // Angles where the wall changes: regular slices plus every doorway's edges.
  const doors = ch.portals.map((p) => ({ a0: p.yaw - p.width / 2 / R, a1: p.yaw + p.width / 2 / R, h: p.height }));
  const cuts = new Set<number>();
  const n = Math.max(48, Math.ceil((2 * Math.PI * R) / 1.2));
  for (let i = 0; i <= n; i++) cuts.add((2 * Math.PI * i) / n);
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  for (const d of doors) {
    cuts.add(norm(d.a0));
    cuts.add(norm(d.a1));
  }
  const angles = [...cuts].sort((x, y) => x - y);
  const at = (a: number, y: number, r = R) => new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a));
  const inDoor = (a: number) => doors.find((d) => {
    const m = norm(a - d.a0);
    return m < norm(d.a1 - d.a0);
  });
  for (let i = 0; i + 1 < angles.length; i++) {
    const a0 = angles[i] as number;
    const a1 = angles[i + 1] as number;
    const door = inDoor((a0 + a1) / 2);
    const bottom = door ? door.h : 0;
    // Wall: faces the centre.
    b.quad(at(a0, bottom), at(a0, H), at(a1, H), at(a1, bottom), rock);
    // Floor and ceiling: fans to the centre (the ceiling rises to a shallow dome).
    b.tri(new THREE.Vector3(0, 0, 0), at(a1, 0), at(a0, 0), floor);
    b.tri(new THREE.Vector3(0, H * 1.18, 0), at(a0, H), at(a1, H), ceil);
  }
  return b.geometry();
}

/** The tunnel's cross-section: straight walls to 0.62 of the height, then a vault. */
function profile(w: number, h: number, inset = 0): [number, number][] {
  const out: [number, number][] = [[-(w / 2 - inset), 0]];
  const spring = h * 0.62;
  out.push([-(w / 2 - inset), spring]);
  const steps = 7;
  for (let i = 1; i < steps; i++) {
    const t = Math.PI * (1 - i / steps);
    out.push([(w / 2 - inset) * Math.cos(t), spring + (h - spring - inset) * Math.sin(t)]);
  }
  out.push([w / 2 - inset, spring], [w / 2 - inset, 0]);
  return out;
}

/**
 * A tunnel, along the descriptor's path, in whatever frame the path has been put into. The rock
 * colour runs from the upper end to the lower; ribs stand every ornament.rib_spacing metres.
 */
export function tunnelGeometry(t: Tunnel, path: THREE.Vector3[]): THREE.BufferGeometry {
  const b = new Builder();
  const prof = profile(t.width, t.height);
  const top = new THREE.Color(t.rock[0]);
  const bottom = new THREE.Color(t.rock[1]);
  const s: number[] = [0];
  for (let i = 1; i < path.length; i++) s.push((s[i - 1] as number) + Math.hypot((path[i] as THREE.Vector3).x - (path[i - 1] as THREE.Vector3).x, (path[i] as THREE.Vector3).z - (path[i - 1] as THREE.Vector3).z));
  const total = s.at(-1) as number;
  const frame = (i: number) => {
    const a = path[Math.max(0, i - 1)] as THREE.Vector3;
    const c = path[Math.min(path.length - 1, i + 1)] as THREE.Vector3;
    const f = new THREE.Vector3(c.x - a.x, 0, c.z - a.z).normalize();
    return new THREE.Vector3(-f.z, 0, f.x); // across the tunnel
  };
  const ring = (p: THREE.Vector3, across: THREE.Vector3, pr: [number, number][]) => pr.map(([u, v]) => p.clone().addScaledVector(across, u).add(new THREE.Vector3(0, v, 0)));
  const shade = (k: number) => top.clone().lerp(bottom, k);
  let prev = ring(path[0] as THREE.Vector3, frame(0), prof);
  for (let i = 1; i < path.length; i++) {
    const cur = ring(path[i] as THREE.Vector3, frame(i), prof);
    const c0 = shade((s[i - 1] as number) / total);
    const c1 = shade((s[i] as number) / total);
    for (let k = 0; k + 1 < prof.length; k++) {
      b.quad(prev[k] as THREE.Vector3, prev[k + 1] as THREE.Vector3, cur[k + 1] as THREE.Vector3, cur[k] as THREE.Vector3, c0, c0, c1, c1);
    }
    // Floor
    const floorC0 = c0.clone().multiplyScalar(0.6);
    const floorC1 = c1.clone().multiplyScalar(0.6);
    b.quad(prev.at(-1) as THREE.Vector3, prev[0] as THREE.Vector3, cur[0] as THREE.Vector3, cur.at(-1) as THREE.Vector3, floorC0, floorC0, floorC1, floorC1);
    prev = cur;
  }
  // Ribs: bands of lighter stone every rib_spacing metres from the upper doorway.
  const step = t.ornament.rib_spacing;
  if (step > 0) {
    const band = profile(t.width, t.height, 0.14);
    for (let d = step; d < total - 1; d += step) {
      const i = s.findIndex((v) => v >= d);
      if (i <= 0) continue;
      const k = (d - (s[i - 1] as number)) / ((s[i] as number) - (s[i - 1] as number));
      const p0 = (path[i - 1] as THREE.Vector3).clone().lerp(path[i] as THREE.Vector3, k);
      const across = frame(i);
      const f = new THREE.Vector3(across.z, 0, -across.x);
      const r0 = ring(p0.clone().addScaledVector(f, -0.15), across, band);
      const r1 = ring(p0.clone().addScaledVector(f, 0.15), across, band);
      const c = shade(d / total).multiplyScalar(1.35);
      for (let j = 0; j + 1 < band.length; j++) b.quad(r0[j] as THREE.Vector3, r0[j + 1] as THREE.Vector3, r1[j + 1] as THREE.Vector3, r1[j] as THREE.Vector3, c);
    }
  }
  return b.geometry();
}

/** Put a tunnel's path (given in the upper chamber's frame) into another frame. */
export function pathIn(t: Tunnel, upperToHere: THREE.Matrix4): THREE.Vector3[] {
  return t.path.map((p) => v3(p).applyMatrix4(upperToHere));
}
