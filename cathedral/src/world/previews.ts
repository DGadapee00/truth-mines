import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshStandardMaterial, MathUtils, Quaternion, Vector3 } from '@iwsdk/core';
import type { DoorState } from '../../../core/doors';
import type { CathedralFile, PlaneFile } from '../../../core/schema';
import { doorLook } from '../lib/door-look';
import { PALETTE } from './palette';

interface Tower {
  n: number;
  pos: [number, number];
  delay_s: number;
  blocks: { prime: number; y: number; h: number }[];
}

const smooth = (k: number) => k * k * (3 - 2 * k);

/**
 * The living previews on the pedestals. Prime blocks stack themselves into towers above the
 * number theory pedestal (the descriptor's towers, blocks and timings, in each prime's colour from the
 * plane file); every other frontier door shows a turning ring motif until its own preview is built. Only
 * a door that is a frontier shows its preview.
 */
export class Previews {
  readonly group = new Group();
  private readonly stacks: { door: number; mesh: InstancedMesh; towers: Tower[]; period: number; base: Vector3; block: number }[] = [];
  private readonly motifs: { door: number; group: Group }[] = [];
  private time = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  constructor(
    private readonly c: CathedralFile,
    plane: Pick<PlaneFile, 'primes'> | null,
  ) {
    this.group.name = 'previews';
    const hue = new Map<number, Color>((plane?.primes ?? []).map((p) => [p.p, new Color(p.color)]));
    c.doors.forEach((d, i) => {
      if (d.preview.id === 'prime-stacks') {
        const params = d.preview.params as { towers: Tower[]; period_s: number };
        const count = params.towers.reduce((n, t) => n + t.blocks.length, 0);
        const block = params.towers[0]?.blocks[0]?.h ?? 0.12;
        const mesh = new InstancedMesh(new BoxGeometry(block * 0.92, block * 0.92, block * 0.92), new MeshStandardMaterial({ roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.25 }), count);
        let k = 0;
        for (const t of params.towers) for (const b of t.blocks) mesh.setColorAt(k++, hue.get(b.prime) ?? new Color(PALETTE.gold));
        mesh.frustumCulled = false;
        mesh.visible = false;
        this.group.add(mesh);
        this.stacks.push({ door: i, mesh, towers: params.towers, period: params.period_s, base: new Vector3(d.pedestal.preview_pos[0], d.pedestal.pos[1] + d.pedestal.height, d.pedestal.preview_pos[2]), block });
      } else {
        const params = d.preview.params as { sides?: number; rings?: number };
        const g = new Group();
        const sides = params.sides ?? 5;
        const pos: number[] = [];
        for (let r = 1; r <= (params.rings ?? 5); r++) {
          const rad = 0.05 * r;
          for (let k = 0; k < sides; k++) {
            const a = (2 * Math.PI * k) / sides + r * 0.31;
            const b = (2 * Math.PI * (k + 1)) / sides + r * 0.31;
            pos.push(rad * Math.cos(a), 0, rad * Math.sin(a), rad * Math.cos(b), 0, rad * Math.sin(b));
          }
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
        g.add(new LineSegments(geo, new LineBasicMaterial({ color: PALETTE.starlight })));
        g.position.set(d.pedestal.preview_pos[0], d.pedestal.preview_pos[1], d.pedestal.preview_pos[2]);
        g.visible = false;
        this.group.add(g);
        this.motifs.push({ door: i, group: g });
      }
    });
  }

  setStates(states: Record<string, DoorState>): void {
    const on = (i: number) => doorLook(states[this.c.doors[i]!.plane] ?? 'sealed').preview;
    for (const s of this.stacks) s.mesh.visible = on(s.door);
    for (const m of this.motifs) m.group.visible = on(m.door);
  }

  /** Blocks drop into their towers one after another, hold, and let go; each tower starts a little after the last. */
  update(dt: number): void {
    this.time += dt;
    for (const m of this.motifs) if (m.group.visible) m.group.rotation.y += dt * 0.5;
    for (const s of this.stacks) {
      if (!s.mesh.visible) continue;
      let k = 0;
      for (const t of s.towers) {
        const local = (((this.time - t.delay_s) % s.period) + s.period) % s.period;
        for (let i = 0; i < t.blocks.length; i++) {
          const b = t.blocks[i]!;
          const arrive = MathUtils.clamp((local - i * 0.55) / 0.8, 0, 1);
          const leave = MathUtils.clamp((s.period - local) / 0.6, 0, 1);
          const e = smooth(arrive) * leave;
          this.p.set(s.base.x + t.pos[0], s.base.y + b.y + b.h / 2 + (1 - smooth(arrive)) * 0.5, s.base.z + t.pos[1]);
          this.s.setScalar(Math.max(1e-4, e));
          s.mesh.setMatrixAt(k++, this.m.compose(this.p, this.q, this.s));
        }
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
