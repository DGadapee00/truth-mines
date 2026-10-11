import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, MathUtils, Mesh, MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import { PALETTE } from './palette';

/** A Möbius strip: one side, one edge, a single half-twist. */
export function mobiusGeometry(radius = 0.1, width = 0.05, along = 120, across = 6): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= along; i++) {
    const u = (i / along) * 2 * Math.PI;
    for (let j = 0; j <= across; j++) {
      const v = (j / across - 0.5) * width;
      const r = radius + v * Math.cos(u / 2);
      pos.push(r * Math.cos(u), r * Math.sin(u), v * Math.sin(u / 2));
    }
  }
  const row = across + 1;
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * row + j;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export type RibbonMood = 'idle' | 'thinking' | 'talking';

/**
 * Trurl: a small ribbon with a single twist, floating near the visitor. It turns lazily when idle,
 * quickly when thinking and bobs while it talks. It keeps to the visitor's right and a little
 * ahead, following their facing gently; it never touches the camera or the view.
 */
export class Ribbon {
  readonly group = new Group();
  private readonly mesh: Mesh;
  private readonly target = new Vector3();
  private t = 0;
  private spin = 0;
  mood: RibbonMood = 'idle';

  constructor() {
    this.group.name = 'trurl';
    this.mesh = new Mesh(mobiusGeometry(), new MeshStandardMaterial({ color: PALETTE.paleGold, emissive: PALETTE.gold, emissiveIntensity: 0.9, roughness: 0.3, side: DoubleSide }));
    this.group.add(this.mesh);
  }

  /** Float near `head`, to the right of and ahead of where `yaw` faces (world yaw: 0 looks toward -Z). */
  update(dt: number, head: Vector3, yaw: number): void {
    this.t += dt;
    const side = 0.6;
    const ahead = 1.3;
    this.target.set(head.x + Math.cos(yaw) * side - Math.sin(yaw) * ahead, head.y - 0.12, head.z - Math.sin(yaw) * side - Math.cos(yaw) * ahead);
    const k = 1 - Math.exp(-dt * 2.5);
    this.group.position.lerp(this.target, k);
    const bob = this.mood === 'talking' ? 0.035 : 0.012;
    this.group.position.y += Math.sin(this.t * (this.mood === 'talking' ? 7 : 1.7)) * bob * dt * 20;
    this.spin += dt * (this.mood === 'thinking' ? 4.5 : this.mood === 'talking' ? 1.6 : 0.6);
    this.mesh.rotation.set(Math.PI / 2.4, this.spin, Math.sin(this.t * 0.7) * 0.2);
    const pulse = this.mood === 'talking' ? 1 + Math.sin(this.t * 9) * 0.06 : 1;
    this.mesh.scale.setScalar(MathUtils.lerp(this.mesh.scale.x, pulse, 0.3));
  }

  /** Snap beside the head (when the scene changes) rather than gliding across the hall. */
  snapTo(head: Vector3, yaw: number): void {
    this.update(1, head, yaw);
    this.group.position.copy(this.target);
  }
}
