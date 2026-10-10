import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { nearestSample } from '../../core/sieve';
import type { OverlookSample, PlaneFile } from '../../core/schema';
import { LabelSet, Sign } from './labels';

/**
 * The overlook: windows of lights (which of 100 consecutive integers are prime, at constant
 * brightness), the two curves across the sky, decade posts, and a marker that stands at the
 * sample nearest where you are on the road. Positions are the descriptor's; the marker only looks
 * the nearest sample up (core/sieve.ts nearestSample).
 */
export interface Overlook {
  group: THREE.Group;
  labels: LabelSet;
  sign: Sign;
  /** The sample under a floor position, or null when you are not on the overlook road */
  sampleAt(x: number, z: number): OverlookSample | null;
  /** Show the marker for this sample, or hide it */
  mark(sample: OverlookSample | null, cam: THREE.Vector3): void;
  dispose(): void;
}

const GOLD = 0xffcf5a;
const CYAN = 0x6fd1ff;
const GREEN = 0x8ee08e;

export function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildOverlook(plane: PlaneFile): Overlook {
  const ov = plane.overlook;
  const group = new THREE.Group();
  group.name = 'overlook';

  // ---- the lights: one Points object, every prime the same brightness and size
  const pts: number[] = [];
  for (const w of ov.windows) for (const p of w.primes) pts.push(...p.pos);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const dot = dotTexture();
  const lights = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff1c2, size: 0.3, map: dot, transparent: true, depthWrite: false, toneMapped: false }));
  lights.frustumCulled = false;
  group.add(lights);

  // ---- the curves: thick lines, a width in metres so they read the same on a desktop and in a headset
  const line = (key: 'pi_at' | 'est_at' | 'ratio_at', colour: number) => {
    const g = new LineGeometry();
    g.setPositions(ov.samples.flatMap((s) => s[key]));
    const m = new LineMaterial({ color: colour, linewidth: ov.curve.width, worldUnits: true, toneMapped: false });
    m.resolution.set(window.innerWidth, window.innerHeight);
    const l = new Line2(g, m);
    l.frustumCulled = false;
    return l;
  };
  const piLine = line('pi_at', GOLD);
  const estLine = line('est_at', CYAN);
  const ratioLine = line('ratio_at', GREEN);
  // Where the ratio is exactly 1: the line the ratio curve settles toward.
  const bg = new LineGeometry();
  bg.setPositions(ov.curve.baseline.flat());
  const bm = new LineMaterial({ color: 0x8a93a0, linewidth: ov.curve.width * 0.5, worldUnits: true, toneMapped: false });
  bm.resolution.set(window.innerWidth, window.innerHeight);
  const baseline = new Line2(bg, bm);
  baseline.frustumCulled = false;
  group.add(piLine, estLine, ratioLine, baseline);

  // ---- labels: the decade posts and each window's range
  const labels = new LabelSet(
    [
      ...ov.decades.map((d) => ({ text: `x = ${d.label}`, pos: [d.pos[0], 1.2, d.pos[2]] as [number, number, number], height: ov.labels.height * 1.1, color: '#ffffff' })),
      ...ov.windows.map((w) => ({ text: w.label, pos: w.label_at, height: ov.labels.height, color: '#c9b36a' })),
    ],
    { cellW: 512, cellH: 64, perRow: 2, fontPx: 40, fade: [90, 160] },
  );
  group.add(labels.mesh);

  // ---- the marker: a sign on a pole beside the road, and a rule between the two curves
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), new THREE.MeshBasicMaterial({ color: 0xcfd6e0, toneMapped: false }));
  const rule = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  pole.visible = rule.visible = false;
  const sign = new Sign(ov.marker.sign_size[0], ov.marker.sign_size[1]);
  group.add(pole, rule, sign.mesh);

  const origin = new THREE.Vector3(...ov.scale.origin);
  const fx = Math.sin(ov.scale.yaw);
  const fz = Math.cos(ov.scale.yaw);
  const nf = (n: number) => Math.round(n).toLocaleString('en-US');

  return {
    group,
    labels,
    sign,
    sampleAt(x, z) {
      const dx = x - origin.x;
      const dz = z - origin.z;
      const s = dx * fx + dz * fz;
      const across = dx * fz - dz * fx;
      if (s < -6 || s > ov.road.length || Math.abs(across) > ov.road.half_width) return null;
      return nearestSample(ov.samples, s);
    },
    mark(sample, cam) {
      pole.visible = rule.visible = sign.mesh.visible = !!sample;
      if (!sample) return;
      const [sx, sy, sz] = sample.sign_at;
      const bottom = sy - ov.marker.sign_size[1] / 2;
      pole.scale.y = bottom;
      pole.position.set(sx, bottom / 2, sz);
      const lo = Math.min(sample.pi_at[1], sample.est_at[1]);
      const hi = Math.max(sample.pi_at[1], sample.est_at[1]);
      rule.scale.y = Math.max(0.05, hi - lo);
      rule.position.set(sample.pi_at[0], (lo + hi) / 2, sample.pi_at[2]);
      sign.set([`x = ${nf(sample.x)}`, `π(x) = ${nf(sample.pi)}`, `x / ln x ≈ ${nf(sample.estimate)}`, `ratio ${sample.ratio.toFixed(3)}`]);
      sign.place(new THREE.Vector3(sx, sy, sz), cam);
    },
    dispose() {
      pg.dispose();
      (lights.material as THREE.Material).dispose();
      dot.dispose();
      for (const l of [piLine, estLine, ratioLine, baseline]) {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
      for (const m of [pole, rule]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      labels.dispose();
      sign.dispose();
    },
  };
}
