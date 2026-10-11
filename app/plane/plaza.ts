import * as THREE from 'three';
import { createSieve } from '../../core/sieve';
import type { PlaneFile } from '../../core/schema';
import type { Target } from './focus';
import { LabelSet } from './labels';
import type { Blocker } from './walk';

/**
 * The sieve plaza: 2 to 100 as columns in a grid. Which multiples fall when a number is struck
 * is the pipeline's (`plaza.multiples`) and the standing set is core/sieve.ts; this only draws
 * them and animates the fall. Everything logical happens at the strike (what stands, what can be
 * struck next); the crumbling is the picture catching up, one multiple after another.
 */
const FALL_SECONDS = 0.5;
const RUBBLE = new THREE.Color(0x2b2e34);

type State = 'standing' | 'struck' | 'crumbled' | 'survivor';

export interface Plaza {
  group: THREE.Group;
  labels: LabelSet;
  blockers: Blocker[];
  /** Standing columns, for picking */
  targets(): Target[];
  strike(n: number): number[] | null;
  reset(): void;
  update(dt: number): void;
  state(): { standing: number[]; struck: number[]; done: boolean; animating: boolean };
  dispose(): void;
}

export function buildPlaza(plane: PlaneFile, colours: Map<number, THREE.Color>): Plaza {
  const pl = plane.plaza;
  const sieve = createSieve(pl);
  const group = new THREE.Group();
  group.name = 'plaza';
  const cells = pl.grid;
  const index = new Map(cells.map((c, i) => [c.n, i]));
  const col = pl.column;

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), cells.length);
  mesh.name = 'plaza-columns';
  group.add(mesh);
  const seed = new THREE.Mesh(
    new THREE.BoxGeometry(plane.road.seed.size[0], plane.road.seed.size[1], plane.road.seed.size[0]),
    new THREE.MeshBasicMaterial({ color: 0x5b616b }),
  );
  seed.position.set(pl.seed_cell.pos[0], plane.road.seed.size[1] / 2, pl.seed_cell.pos[2]);
  group.add(seed);

  const labels = new LabelSet(
    cells.map((c) => ({ text: String(c.n), pos: [c.pos[0], col.height + pl.labels.number_offset, c.pos[2]] as [number, number, number], height: pl.labels.number_height })),
    { cellW: 96, cellH: 64, perRow: 10, fontPx: 46, fade: [35, 60] },
  );
  group.add(labels.mesh);

  const stone = new THREE.Color(pl.stone);
  const glow = new THREE.Color(pl.glow).multiplyScalar(1.5);
  const state: State[] = cells.map(() => 'standing');
  const fallStart: (number | null)[] = cells.map(() => null);
  const struck = new Set<number>();
  const blockers: Blocker[] = cells.map((c) => ({ x: c.pos[0], z: c.pos[2], r: pl.footprint }));
  let time = 0;
  let pending: { n: number; at: number }[] = [];
  let finishAt: number | null = null;
  let dirty = true;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const heightOf = (i: number) => {
    const t = fallStart[i];
    if (state[i] !== 'crumbled' || t == null) return col.height;
    const k = Math.min(1, Math.max(0, (time - t) / FALL_SECONDS));
    return col.height + (col.rubble_height - col.height) * (k * k);
  };
  function paint() {
    cells.forEach((c, i) => {
      const h = heightOf(i);
      dummy.position.set(c.pos[0], h / 2, c.pos[2]);
      dummy.rotation.set(0, pl.yaw, 0);
      const wide = state[i] === 'crumbled' && h <= col.rubble_height + 1e-3 ? 1.15 : 1;
      dummy.scale.set(col.width * wide, h, col.width * wide);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      switch (state[i]) {
        case 'struck':
          tint.copy(glow);
          break;
        case 'crumbled': {
          const k = Math.min(1, Math.max(0, (time - (fallStart[i] ?? time)) / FALL_SECONDS));
          tint.copy(stone).lerp(RUBBLE, k);
          labels.setAlpha(i, 1 - k);
          break;
        }
        case 'survivor':
          tint.copy(colours.get(c.n) ?? stone).multiplyScalar(1.6);
          break;
        default:
          tint.copy(stone);
      }
      mesh.setColorAt(i, tint);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // Place the columns now, not on the first update: an engine may measure the mesh's bounds before
  // that (IWSDK does), and bounds taken from unplaced instances would cull the whole plaza.
  paint();

  const animating = () => pending.length > 0 || finishAt !== null || state.some((s, i) => s === 'crumbled' && time - (fallStart[i] ?? 0) < FALL_SECONDS);

  return {
    group,
    labels,
    blockers,
    targets: () => cells.filter((c) => sieve.isStanding(c.n)).map((c) => ({ id: `plaza:${c.n}`, x: c.pos[0], z: c.pos[2], r: (col.width / 2) * 1.15, y0: 0, y1: col.height })),
    strike(n) {
      if (!sieve.isStanding(n)) return null;
      struck.add(n);
      const i = index.get(n) as number;
      const fell = sieve.strike(n);
      const survivorsOnly = sieve.standing().length === pl.survivors.length;
      if (state[i] === 'standing' && !survivorsOnly) state[i] = 'struck';
      const t0 = Math.max(time, pending.at(-1)?.at ?? 0) + 0.25;
      fell.forEach((m, k) => pending.push({ n: m, at: t0 + k * pl.crumble_step_s }));
      if (survivorsOnly) finishAt = (pending.at(-1)?.at ?? time) + FALL_SECONDS + 0.2;
      dirty = true;
      return fell;
    },
    reset() {
      sieve.reset();
      struck.clear();
      pending = [];
      finishAt = null;
      state.fill('standing');
      fallStart.fill(null);
      blockers.forEach((b) => (b.r = pl.footprint));
      for (let i = 0; i < cells.length; i++) labels.setAlpha(i, 1);
      dirty = true;
    },
    update(dt) {
      time += dt;
      let changed = dirty;
      while (pending.length && (pending[0] as { at: number }).at <= time) {
        const { n, at } = pending.shift() as { n: number; at: number };
        const i = index.get(n) as number;
        state[i] = 'crumbled';
        fallStart[i] = at;
        (blockers[i] as Blocker).r = 0;
        changed = true;
      }
      if (finishAt !== null && time >= finishAt) {
        finishAt = null;
        cells.forEach((c, i) => {
          if (sieve.isStanding(c.n)) state[i] = 'survivor';
        });
        changed = true;
      }
      if (changed || animating()) {
        paint();
        dirty = false;
      }
    },
    state: () => ({ standing: sieve.standing(), struck: [...struck].sort((a, b) => a - b), done: sieve.standing().length === pl.survivors.length, animating: animating() }),
    dispose() {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      seed.geometry.dispose();
      (seed.material as THREE.Material).dispose();
      labels.dispose();
    },
  };
}
