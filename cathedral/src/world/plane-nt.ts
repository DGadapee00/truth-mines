import { Color, Group, Mesh, Vector3 } from '@iwsdk/core';
import type { OverlookSample, PlaneFile, RoadColumn } from '../../../core/schema';
import { pickTarget, type Target } from '../../../app/plane/focus';
import { Sign } from '../../../app/plane/labels';
import { buildGround, buildWorld } from '../../../app/plane/world';
import { primeColours, type Road } from '../../../app/plane/road';
import type { Plaza } from '../../../app/plane/plaza';
import type { Overlook } from '../../../app/plane/overlook';
import { EYE, PlaneWalk, type Blocker } from '../../../app/plane/walk';

export { EYE };

export type Focus = { kind: 'road'; n: number } | { kind: 'plaza'; n: number } | null;
export type Zone = 'road' | 'plaza' | 'overlook';

/** Where the visitor stands on the plane: a place on the ground and the way they face. */
export interface Place {
  x: number;
  z: number;
  /** Descriptor yaw: facing (sin, cos) */
  heading: number;
  pitch: number;
}

/**
 * The number theory plane, drawn by the mine's existing builders (app/plane/*) from the
 * pipeline's plane-number-theory.json. They only draw and animate the descriptors; where each
 * column stands, which multiples fall and the overlook's samples are all the pipeline's. This
 * wrapper adds what the cathedral needs around them: focus, the sieve, the stops.
 */
export class NumberTheoryPlane {
  readonly group = new Group();
  readonly ground: Mesh;
  readonly road: Road;
  readonly plaza: Plaza;
  readonly overlook: Overlook;
  readonly walk: PlaneWalk;
  private readonly sign: Sign;
  private readonly targets: Target[];
  private focus: Focus = null;
  private readonly focusPos = new Vector3();
  marker: OverlookSample | null = null;

  constructor(readonly data: PlaneFile) {
    this.group.name = 'plane-number-theory';
    const colours: Map<number, Color> = primeColours(data) as Map<number, Color>;
    const built = buildWorld(data, colours as never);
    this.road = built.road;
    this.plaza = built.plaza;
    this.overlook = built.overlook;
    this.ground = buildGround(data) as unknown as Mesh;
    const size = data.road.labels.sign_size;
    this.sign = new Sign(size[0], size[1] + 0.2);
    this.group.add(this.ground as never, this.road.group as never, this.plaza.group as never, this.overlook.group as never, this.sign.mesh as never);
    const blockers: Blocker[] = data.road.columns.map((c) => ({ x: c.pos[0], z: c.pos[2], r: c.radius }));
    this.walk = new PlaneWalk(data.ground, [...blockers, ...this.plaza.blockers]);
    this.targets = data.road.columns
      .filter((c) => c.kind !== 'unit')
      .map((c) => ({ id: `road:${c.n}`, x: c.pos[0], z: c.pos[2], r: (Math.max(data.road.block.size, data.road.monolith.width) / 2) * 1.2, y0: 0, y1: c.height }));
  }

  stop(id: string): Place {
    const s = this.data.stops.find((x) => x.id === id);
    if (!s) throw new Error(`no stop ${id}`);
    return { x: s.pos[0], z: s.pos[2], heading: s.yaw, pitch: s.pitch };
  }

  column(n: number): RoadColumn {
    return this.data.road.columns[n - 1] as RoadColumn;
  }

  /** What a ray from the eye or a controller meets: a road column or a standing plaza column. */
  pick(o: Vector3, d: Vector3): Focus {
    const hit = pickTarget(o, d, [...this.targets, ...this.plaza.targets()]);
    if (!hit) return null;
    const [kind, n] = hit.id.split(':') as ['road' | 'plaza', string];
    return { kind, n: Number(n) };
  }

  /** Show the focus: threads and a sign for a road column, a "strike" sign over a plaza column. */
  setFocus(f: Focus, cam: Vector3): void {
    const same = f?.kind === this.focus?.kind && f?.n === this.focus?.n;
    this.focus = f;
    if (!same) {
      const d = this.data;
      if (f?.kind === 'road') {
        const c = this.column(f.n);
        this.sign.set([c.label], c.kind === 'prime' ? (d.primes.find((p) => p.p === c.n)?.color ?? '#ffcf5a') : '#ffcf5a');
        this.sign.mesh.visible = true;
        this.road.showThreads(f.n);
        this.focusPos.set(c.pos[0], c.height + d.road.labels.sign_offset, c.pos[2]);
      } else if (f?.kind === 'plaza') {
        const cell = d.plaza.grid.find((g) => g.n === f.n);
        if (cell) {
          this.sign.set([`Strike ${f.n}`], d.plaza.glow);
          this.sign.mesh.visible = true;
          this.focusPos.set(cell.pos[0], d.plaza.column.height + 1.0, cell.pos[2]);
        }
        this.road.showThreads(null);
      } else {
        this.sign.mesh.visible = false;
        this.road.showThreads(null);
      }
    }
    if (this.focus) this.sign.place(this.focusPos as never, cam as never);
  }

  get focused(): Focus {
    return this.focus;
  }

  strike(n: number): number[] | null {
    return this.plaza.strike(n);
  }

  update(dt: number, cam: Vector3): void {
    this.plaza.update(dt);
    this.marker = this.overlook.sampleAt(this.walk.x, this.walk.z);
    this.overlook.mark(this.marker, cam as never);
  }

  zoneOf(x: number, z: number): Zone {
    const sq = this.data.ground.square;
    const dx = x - sq.centre[0];
    const dz = z - sq.centre[2];
    const c = Math.cos(sq.yaw);
    const s = Math.sin(sq.yaw);
    if (Math.abs(dx * c - dz * s) <= sq.half && Math.abs(dx * s + dz * c) <= sq.half) return 'plaza';
    return this.overlook.sampleAt(x, z) ? 'overlook' : 'road';
  }
}
