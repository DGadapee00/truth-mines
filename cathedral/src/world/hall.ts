import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
} from '@iwsdk/core';
import type { DoorState } from '../../../core/doors';
import type { CathedralFile } from '../../../core/schema';
import { doorLook } from '../lib/door-look';
import { PALETTE } from './palette';

/** A doorway: straight sides under a round arch, `w` wide and `h` tall, standing on y = 0. */
function arch(w: number, h: number, hole?: Path): Shape {
  const s = new Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  if (hole) s.holes.push(hole);
  return s;
}

function archPath(w: number, h: number): Path {
  const p = new Path();
  const r = w / 2;
  p.moveTo(-r, 0);
  p.lineTo(-r, h - r);
  p.absarc(0, h - r, r, Math.PI, 0, true);
  p.lineTo(r, 0);
  p.lineTo(-r, 0);
  return p;
}

export interface Hall {
  group: Group;
  /** The walkable floor: the app makes it a LocomotionEnvironment so a headset can teleport on it */
  floor: Mesh;
  /** Re-light the doors and pedestals for these states */
  setStates(states: Record<string, DoorState>): void;
  /** Instanced pieces, for tests that count what is drawn */
  readonly doorPanels: InstancedMesh;
}

/**
 * The hall from its descriptor: floor, wall, arrival dais, twelve doors and their pedestals. Doors,
 * frames and pedestals are one InstancedMesh each, so the whole hall is a handful of draw calls. All
 * sizes and positions come from cathedral.json; only the look (materials) is chosen here.
 */
export function buildHall(c: CathedralFile, states: Record<string, DoorState>): Hall {
  const group = new Group();
  group.name = 'hall';
  const R = c.hall.radius;

  const floor = new Mesh(
    new CircleGeometry(R, 96).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.28, metalness: 0.55, emissive: PALETTE.wallGlow, emissiveIntensity: 0.08 }),
  );
  floor.name = 'hall-floor';
  group.add(floor);

  // The wall stands between R and R + thickness. One open cylinder, seen from inside.
  const wall = new Mesh(
    new CylinderGeometry(R + c.hall.wall_thickness / 2, R + c.hall.wall_thickness / 2, c.hall.wall_height, 96, 1, true).translate(0, c.hall.wall_height / 2, 0),
    new MeshStandardMaterial({ color: PALETTE.wall, emissive: PALETTE.wallGlow, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3, side: DoubleSide, transparent: true, opacity: 0.82 }),
  );
  wall.name = 'hall-wall';
  group.add(wall);

  const dais = new Mesh(
    new CylinderGeometry(c.arrival.dais_radius, c.arrival.dais_radius + 0.25, 0.12, 48).translate(0, 0.06, 0),
    new MeshStandardMaterial({ color: PALETTE.paleGold, emissive: PALETTE.gold, emissiveIntensity: 0.9, roughness: 0.2 }),
  );
  dais.name = 'dais';
  group.add(dais);

  const { width: w, height: h } = c.hall.door;
  const n = c.doors.length;
  const panels = new InstancedMesh(new ShapeGeometry(arch(w, h)).translate(0, 0, 0.04), new MeshBasicMaterial({ transparent: true, opacity: 0.92, side: DoubleSide }), n);
  const frameWidth = 0.28;
  const frames = new InstancedMesh(
    new ExtrudeGeometry(arch(w + frameWidth * 2, h + frameWidth, archPath(w, h)), { depth: 0.12, bevelEnabled: false }).translate(0, 0, 0.02),
    new MeshStandardMaterial({ color: PALETTE.paleGold, emissive: PALETTE.gold, emissiveIntensity: 0.6, roughness: 0.3 }),
    n,
  );
  const pedestals = new InstancedMesh(
    new CylinderGeometry(1, 1.15, 1, 28).translate(0, 0.5, 0),
    new MeshStandardMaterial({ color: PALETTE.pedestal, emissive: PALETTE.starlight, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.4 }),
    n,
  );
  panels.name = 'door-panels';
  frames.name = 'door-frames';
  pedestals.name = 'pedestals';
  for (const m of [panels, frames, pedestals]) {
    m.frustumCulled = false;
    group.add(m);
  }

  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const place = new Matrix4();
  const colour = new Color();
  const scale = new Vector3();
  const hidden = new Matrix4().makeScale(0, 0, 0);

  c.doors.forEach((d, i) => {
    q.setFromAxisAngle(up, d.yaw);
    place.compose(new Vector3(d.pos[0], d.pos[1], d.pos[2]), q, new Vector3(1, 1, 1));
    panels.setMatrixAt(i, place);
    frames.setMatrixAt(i, place);
  });

  const setStates = (s: Record<string, DoorState>) => {
    c.doors.forEach((d, i) => {
      const look = doorLook(s[d.plane] ?? 'sealed');
      colour.setHex(look.colour).multiplyScalar(0.25 + 0.75 * look.glow);
      panels.setColorAt(i, colour);
      colour.setHex(PALETTE.paleGold).multiplyScalar(0.2 + 0.8 * look.glow);
      frames.setColorAt(i, colour);
      if (look.pedestal) {
        q.identity();
        scale.set(d.pedestal.radius, d.pedestal.height, d.pedestal.radius);
        pedestals.setMatrixAt(i, place.compose(new Vector3(d.pedestal.pos[0], d.pedestal.pos[1], d.pedestal.pos[2]), q, scale));
      } else pedestals.setMatrixAt(i, hidden);
    });
    for (const m of [panels, frames, pedestals]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    panels.instanceMatrix.needsUpdate = true;
  };
  setStates(states);

  return { group, floor, setStates, doorPanels: panels };
}
