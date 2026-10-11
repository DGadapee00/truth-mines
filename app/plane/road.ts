import * as THREE from 'three';
import type { PlaneFile, RoadColumn } from '../../core/schema';
import { LabelSet } from './labels';
import { Veil } from './veil';

/**
 * The road of integers: blocks and monoliths as two instanced meshes, the seed stone, a number
 * above every column, and the threads of light. Threads are thin square tubes in one mesh, each
 * column's contiguous in the index buffer, so showing a column's threads is just a draw range.
 */
export interface Road {
  group: THREE.Group;
  labels: LabelSet;
  /** The veil over the stacks (off unless buildRoad was asked for it). A stack's threads show only once it is revealed. */
  veil: Veil;
  /** Take the veil off one stack: its blocks take their prime colours, bottom first */
  reveal(n: number): void;
  /** Take it off all of them */
  unveil(): void;
  /** The colour block k of column n is drawn in now, as "#rrggbb" (for tests) */
  blockColour(n: number, k: number): string;
  /** Advance the assembling stacks */
  update(dt: number): void;
  /** Show the threads of column n (or none) */
  showThreads(n: number | null): void;
  /** How many triangles' worth of threads column n has (for tests) */
  threadCount(n: number): number;
  dispose(): void;
}

export function primeColours(plane: PlaneFile): Map<number, THREE.Color> {
  return new Map(plane.primes.map((p) => [p.p, new THREE.Color(p.color)]));
}

/** A square tube along a polyline, appended to the buffers. */
function tube(points: readonly [number, number, number][], radius: number, colour: THREE.Color, pos: number[], col: number[], idx: number[]) {
  const up = new THREE.Vector3(0, 1, 0);
  const ring = 4;
  const base = pos.length / 3;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)] as [number, number, number];
    const b = points[Math.min(points.length - 1, i + 1)] as [number, number, number];
    const t = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    let u = new THREE.Vector3().crossVectors(t, up);
    if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(u, t).normalize();
    for (let k = 0; k < ring; k++) {
      const ang = (k / ring) * Math.PI * 2 + Math.PI / 4;
      const d = u.clone().multiplyScalar(Math.cos(ang) * radius).addScaledVector(v, Math.sin(ang) * radius);
      pos.push(p[0] + d.x, p[1] + d.y, p[2] + d.z);
      col.push(colour.r, colour.g, colour.b);
    }
  });
  for (let i = 0; i + 1 < points.length; i++) {
    for (let k = 0; k < ring; k++) {
      const a = base + i * ring + k;
      const b = base + i * ring + ((k + 1) % ring);
      idx.push(a, b, a + ring, b, b + ring, a + ring);
    }
  }
}

export function buildRoad(plane: PlaneFile, colours: Map<number, THREE.Color>, opts: { veiled?: boolean } = {}): Road {
  const r = plane.road;
  const group = new THREE.Group();
  group.name = 'road';
  const dummy = new THREE.Object3D();
  const gap = r.block.gap;

  // ---- blocks and monoliths, instanced
  const parts = (form: 'block' | 'monolith') => r.columns.flatMap((c) => c.parts.filter((p) => p.form === form).map((p) => ({ c, p })));
  const make = (form: 'block' | 'monolith', mat: THREE.Material, w: number, shave: number) => {
    const list = parts(form);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach(({ c, p }, i) => {
      dummy.position.set(c.pos[0], p.y + p.h / 2, c.pos[2]);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.scale.set(w - shave, p.h - shave, w - shave);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colours.get(p.prime) as THREE.Color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = form;
    return mesh;
  };
  const blocks = make('block', new THREE.MeshLambertMaterial(), r.block.size, gap);
  // The veil: which column and which block of it each block instance is, so a reveal can recolour just those
  const veil = new Veil(r.veil.assemble_step_s, opts.veiled ?? false);
  const veilColour = new THREE.Color(r.veil.colour);
  const blockOf = parts('block').map(({ c }) => ({ n: c.n, c }));
  const first = new Map<number, number>();
  parts('block').forEach(({ c }, i) => {
    if (!first.has(c.n)) first.set(c.n, i);
  });
  const paintBlock = (i: number) => {
    const { n, c } = blockOf[i] as (typeof blockOf)[number];
    const k = i - (first.get(n) as number);
    const state = veil.block(n, k);
    const part = c.parts[k] as RoadColumn['parts'][number];
    blocks.setColorAt(i, state.coloured ? (colours.get(part.prime) as THREE.Color) : veilColour);
    const grow = 1 + 0.2 * state.pulse;
    dummy.position.set(c.pos[0], part.y + part.h / 2, c.pos[2]);
    dummy.rotation.set(0, c.yaw, 0);
    dummy.scale.set((r.block.size - gap) * grow, (part.h - gap) * grow, (r.block.size - gap) * grow);
    dummy.updateMatrix();
    blocks.setMatrixAt(i, dummy.matrix);
  };
  const flush = () => {
    blocks.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  };
  const paintColumn = (n: number) => {
    const at = first.get(n);
    if (at === undefined) return;
    const count = (r.columns[n - 1] as RoadColumn).parts.filter((q) => q.form === 'block').length;
    for (let k = 0; k < count; k++) paintBlock(at + k);
    flush();
  };
  const paintAll = () => {
    for (let i = 0; i < blockOf.length; i++) paintBlock(i);
    flush();
  };
  if (veil.on) paintAll();
  const assembling = new Set<number>();
  // A monolith is polished: a glossy highlight the matte blocks lack.
  const monoliths = make('monolith', new THREE.MeshPhongMaterial({ shininess: 90, specular: 0x555555 }), r.monolith.width, 0);
  group.add(blocks, monoliths);

  // ---- the seed stone at 1: flat, neutral, unlit
  const seed = new THREE.Mesh(new THREE.BoxGeometry(r.seed.size[0], r.seed.size[1], r.seed.size[0]), new THREE.MeshBasicMaterial({ color: 0x5b616b }));
  seed.position.set(r.seed.pos[0], r.seed.size[1] / 2, r.seed.pos[2]);
  seed.name = 'seed';
  group.add(seed);

  // ---- a number above each column
  const lab = r.labels;
  const labels = new LabelSet(
    r.columns.map((c) => ({ text: String(c.n), pos: [c.pos[0], c.height + lab.number_offset, c.pos[2]] as [number, number, number], height: lab.number_height, color: c.kind === 'prime' ? '#ffffff' : '#9aa4b2' })),
    { cellW: 96, cellH: 64, perRow: 10, fontPx: 46 },
  );
  group.add(labels.mesh);

  // ---- threads
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const ranges = new Map<number, { start: number; count: number }>();
  for (const c of r.columns as RoadColumn[]) {
    const start = idx.length;
    c.threads.forEach((t, i) => tube(t, r.thread_radius, colours.get(c.parts[i]!.prime) as THREE.Color, pos, col, idx));
    ranges.set(c.n, { start, count: idx.length - start });
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.setIndex(idx);
  const threads = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  threads.name = 'threads';
  threads.frustumCulled = false;
  threads.visible = false;
  group.add(threads);

  return {
    group,
    labels,
    veil,
    reveal(n) {
      veil.reveal(n);
      assembling.add(n);
      paintColumn(n);
    },
    blockColour(n, k) {
      const c = new THREE.Color();
      blocks.getColorAt((first.get(n) ?? 0) + k, c);
      return `#${c.getHexString()}`;
    },
    unveil() {
      veil.on = false;
      assembling.clear();
      paintAll();
    },
    update(dt) {
      if (!veil.on || assembling.size === 0) return;
      veil.tick(dt);
      for (const n of [...assembling]) {
        const count = (r.columns[n - 1] as RoadColumn).parts.filter((q) => q.form === 'block').length;
        paintColumn(n);
        if (!veil.assembling(n, count + 1)) assembling.delete(n);
      }
    },
    showThreads(n) {
      const range = n === null || !veil.isRevealed(n) ? undefined : ranges.get(n);
      if (!range || range.count === 0) {
        threads.visible = false;
        return;
      }
      tg.setDrawRange(range.start, range.count);
      threads.visible = true;
    },
    threadCount: (n) => (ranges.get(n)?.count ?? 0) / 24 / (plane.road.columns[n - 1]?.threads[0]?.length ? (plane.road.columns[n - 1]!.threads[0]!.length - 1) : 1),
    dispose() {
      blocks.geometry.dispose();
      (blocks.material as THREE.Material).dispose();
      monoliths.geometry.dispose();
      (monoliths.material as THREE.Material).dispose();
      seed.geometry.dispose();
      (seed.material as THREE.Material).dispose();
      tg.dispose();
      (threads.material as THREE.Material).dispose();
      labels.dispose();
    },
  };
}
