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

const TAU = Math.PI * 2;

/** `a` shifted by multiples of 2π into [a0, a0 + 2π). */
export function liftAngle(a: number, a0: number): number {
  let y = a;
  while (y < a0) y += TAU;
  while (y >= a0 + TAU) y -= TAU;
  return y;
}

const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/** Pieces of [a0, a1] folded into [0, 2π], so a mouth that crosses the branch still opens the hall wall. */
function mouthPieces(a0: number, a1: number): [number, number][] {
  const out: [number, number][] = [];
  let s = a0;
  while (s < a1 - 1e-8) {
    const boundary = (Math.floor(s / TAU) + 1) * TAU;
    const e = Math.min(a1, boundary);
    if (Math.abs(e - boundary) < 1e-8) out.push([norm(s), TAU]);
    else out.push([norm(s), norm(e)]);
    s = e;
  }
  return out;
}

const at = (a: number, y: number, r: number) => new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a));

/**
 * A chamber: the round hall, its doorways and gallery mouths left open, and each gallery wedge
 * from the descriptor. Openings and wedge radii come from the descriptor; this only tessellates.
 */
export function chamberGeometry(ch: Chamber): THREE.BufferGeometry {
  const b = new Builder();
  const R = ch.radius;
  const H = ch.height;
  const rock = col(ch.rock);
  const floor = col(ch.rock, 0.62);
  const ceil = col(ch.rock, 0.78);
  const inGallery = new Set(ch.galleries.flatMap((g) => g.portal_indices));
  type Opening = { a0: number; a1: number; h: number; mouth: boolean };
  const openings: Opening[] = [];
  for (const [i, p] of ch.portals.entries()) {
    if (inGallery.has(i)) continue;
    const half = p.width / 2 / R;
    openings.push({ a0: norm(p.yaw - half), a1: norm(p.yaw + half), h: p.height, mouth: false });
  }
  for (const g of ch.galleries) {
    if (Math.abs(g.inner_radius - R) > 0.05) continue;
    for (const [a0, a1] of mouthPieces(g.a0, g.a1)) openings.push({ a0, a1, h: H, mouth: true });
  }
  const cuts = new Set<number>();
  const n = Math.max(48, Math.ceil((TAU * R) / 1.2));
  for (let i = 0; i <= n; i++) cuts.add((TAU * i) / n);
  for (const d of openings) {
    cuts.add(d.a0);
    cuts.add(d.a1);
  }
  const angles = [...cuts].sort((x, y) => x - y);
  const spanHolds = (a: number, a0: number, a1: number) => (a1 >= a0 ? a >= a0 && a < a1 : a >= a0 || a < a1);
  for (let i = 0; i + 1 < angles.length; i++) {
    const a0 = angles[i] as number;
    const a1 = angles[i + 1] as number;
    const mid = (a0 + a1) / 2;
    const open = openings.find((d) => spanHolds(mid, d.a0, d.a1));
    if (!open?.mouth) {
      const bottom = open ? open.h : 0;
      b.quad(at(a0, bottom, R), at(a0, H, R), at(a1, H, R), at(a1, bottom, R), rock);
    }
    b.tri(new THREE.Vector3(0, 0, 0), at(a1, 0, R), at(a0, 0, R), floor);
    b.tri(new THREE.Vector3(0, H * 1.18, 0), at(a0, H, R), at(a1, H, R), ceil);
  }

  const groups = new Map<string, typeof ch.galleries>();
  for (const g of ch.galleries) {
    const key = `${g.a0.toFixed(5)}:${g.a1.toFixed(5)}`;
    const list = groups.get(key) ?? [];
    list.push(g);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    group.sort((p, q) => p.inner_radius - q.inner_radius);
    const a0 = group[0]!.a0;
    const a1 = group[0]!.a1;
    const inner0 = group[0]!.inner_radius;
    const outerG = group[group.length - 1]!;
    b.quad(at(a0, 0, inner0), at(a0, H, inner0), at(a0, H, outerG.outer_radius), at(a0, 0, outerG.outer_radius), rock);
    b.quad(at(a1, 0, outerG.outer_radius), at(a1, H, outerG.outer_radius), at(a1, H, inner0), at(a1, 0, inner0), rock);
    for (const g of group) {
      const steps = Math.max(1, Math.ceil(((a1 - a0) * g.outer_radius) / 1.2));
      for (let i = 0; i < steps; i++) {
        const u = a0 + ((a1 - a0) * i) / steps;
        const v = a0 + ((a1 - a0) * (i + 1)) / steps;
        b.quad(at(u, 0, g.inner_radius), at(v, 0, g.inner_radius), at(v, 0, g.outer_radius), at(u, 0, g.outer_radius), floor);
        b.quad(at(u, H, g.outer_radius), at(v, H, g.outer_radius), at(v, H, g.inner_radius), at(u, H, g.inner_radius), ceil);
      }
    }
    const holes = outerG.portal_indices.map((i) => {
      const p = ch.portals[i]!;
      const yaw = liftAngle(p.yaw, a0);
      const half = p.width / 2 / outerG.outer_radius;
      return { a0: yaw - half, a1: yaw + half, h: p.height };
    });
    const edge = new Set<number>([a0, a1]);
    const steps = Math.max(1, Math.ceil(((a1 - a0) * outerG.outer_radius) / 1.2));
    for (let i = 0; i <= steps; i++) edge.add(a0 + ((a1 - a0) * i) / steps);
    for (const h of holes) {
      edge.add(h.a0);
      edge.add(h.a1);
    }
    const ring = [...edge].sort((x, y) => x - y);
    for (let i = 0; i + 1 < ring.length; i++) {
      const u = ring[i] as number;
      const v = ring[i + 1] as number;
      if (u < a0 - 1e-6 || v > a1 + 1e-6) continue;
      const mid = (u + v) / 2;
      const hole = holes.find((h) => mid > h.a0 && mid < h.a1);
      const bottom = hole ? hole.h : 0;
      if (bottom < H - 1e-3) b.quad(at(u, bottom, outerG.outer_radius), at(u, H, outerG.outer_radius), at(v, H, outerG.outer_radius), at(v, bottom, outerG.outer_radius), rock);
    }
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
