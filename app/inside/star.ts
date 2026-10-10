import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BatchedText, Text } from 'troika-three-text';
import { plainName, type MineGraph } from '../../core/graph';
import type { Chamber, Marker, Portal, SceneFile, Tunnel } from '../../core/schema';
import { chamberGeometry, invertPose, pathIn, poseMatrix, tunnelGeometry, v3, type Pose } from './geometry';
import { statementTexture } from './slab';

/**
 * The local scene: one chamber, its tunnels, and the chambers one hop away (CLAUDE.md: the Inside
 * view renders only the local subgraph). Everything is in the current chamber's frame.
 *
 * In the chamber, all tunnels and neighbours show (one merged mesh each, so the draw calls stay
 * flat however many doorways there are). Inside a tunnel, only that tunnel and the chamber it
 * leads to show, so no neighbour's rock pokes through the walls.
 */
export interface Passage {
  tunnel: Tunnel;
  /** The doorway in the current chamber */
  portal: Portal;
  /** The chamber at the other end, and where its frame sits in this one */
  far: Chamber;
  farPose: Pose;
  up: boolean;
  /** The floor's centre line from this doorway to the far one, in this frame */
  path: THREE.Vector3[];
  /** Horizontal distance along the path at each point */
  s: number[];
  markers: { m: Marker; pos: THREE.Vector3 }[];
}

export interface Star {
  group: THREE.Group;
  chamber: Chamber;
  passages: Passage[];
  /** Show everything (in the chamber) or one passage (walking a tunnel). */
  focus(p: Passage | null): void;
  /** Turn labels to the camera and fade them by distance. */
  update(camera: THREE.Camera): void;
  /** Ambient light for the stratum you stand in (descriptor light, 0..1). */
  setLight(level: number): void;
  dispose(): void;
  /** Ids of the chambers drawn (for the locality test). */
  drawnChambers(): string[];
}

const material = () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

export function buildStar(id: string, scene: SceneIndex, graph: MineGraph, fontUrl: string): Star {
  const ch = scene.chamber(id);
  const group = new THREE.Group();
  group.name = `star:${id}`;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ---- the chamber itself
  const room = new THREE.Mesh(keep(chamberGeometry(ch)), keep(material()));
  room.name = `chamber:${id}`;
  group.add(room);
  const slab = statementSlab(ch, graph);
  keep(slab.material as THREE.Material);
  group.add(slab);

  // ---- pillars, one per dependency
  const pillars = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(1, 1.08, 1, 14)), keep(new THREE.MeshLambertMaterial({ color: new THREE.Color(ch.rock).multiplyScalar(1.25) })), Math.max(1, ch.pillars.length));
  ch.pillars.forEach((p, i) => pillars.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.pos[0], p.height / 2, p.pos[2]), new THREE.Quaternion(), new THREE.Vector3(p.radius, p.height, p.radius))));
  pillars.count = ch.pillars.length;
  group.add(pillars);

  // ---- passages: each tunnel out of here, in this frame
  const passages: Passage[] = ch.portals.map((portal) => {
    const tunnel = scene.tunnel(portal.tunnel);
    const up = portal.dir === 'up';
    const placeLower: Pose = { pos: v3(tunnel.lower_in_upper.pos), yaw: tunnel.lower_in_upper.yaw };
    // The tunnel's own frame is the upper chamber's. From the lower chamber, invert it.
    const upperHere = up ? invertPose(placeLower) : { pos: new THREE.Vector3(), yaw: 0 };
    const m = poseMatrix(upperHere);
    let path = pathIn(tunnel, m);
    let markers = tunnel.markers.map((mk) => ({ m: mk, pos: v3(mk.pos).applyMatrix4(m) }));
    if (up) {
      path = path.reverse();
      markers = markers.reverse();
    }
    const s = [0];
    for (let i = 1; i < path.length; i++) s.push((s[i - 1] as number) + Math.hypot((path[i] as THREE.Vector3).x - (path[i - 1] as THREE.Vector3).x, (path[i] as THREE.Vector3).z - (path[i - 1] as THREE.Vector3).z));
    const far = scene.chamber(portal.target);
    const farPose = up ? upperHere : placeLower;
    return { tunnel, portal, far, farPose, up, path, s, markers };
  });

  // ---- all tunnels and all neighbours, merged
  const tunnelGeos = passages.map((p) => tunnelGeometry(p.tunnel, p.up ? [...p.path].reverse() : p.path));
  const allTunnels = new THREE.Mesh(keep(mergeGeometries(tunnelGeos) ?? new THREE.BufferGeometry()), keep(material()));
  allTunnels.name = 'tunnels';
  group.add(allTunnels);
  const farGeos = passages.map((p) => chamberGeometry(p.far).applyMatrix4(poseMatrix(p.farPose)));
  const allFar = new THREE.Mesh(keep(mergeGeometries(farGeos) ?? new THREE.BufferGeometry()), keep(material()));
  allFar.name = 'neighbours';
  group.add(allFar);

  // ---- markers along the tunnels: a post and a glowing stone at each
  const allMarkers = passages.flatMap((p) => p.markers);
  const stones = new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(0.16)), keep(new THREE.MeshBasicMaterial({ color: 0xffd98a })), Math.max(1, allMarkers.length));
  const posts = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.035, 0.05, 1, 6)), keep(new THREE.MeshLambertMaterial({ color: 0x8a7f6a })), Math.max(1, allMarkers.length));
  allMarkers.forEach(({ pos }, i) => {
    stones.setMatrixAt(i, new THREE.Matrix4().makeTranslation(pos.x, pos.y + 1.15, pos.z));
    posts.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
  });
  stones.count = posts.count = allMarkers.length;
  group.add(stones, posts);

  // ---- labels: pillars, plaques by the doorways, markers (one draw call)
  const labels = new BatchedText();
  const texts: { t: Text; at: THREE.Vector3; near: number; face?: number }[] = [];
  const text = (s: string, size: number, at: THREE.Vector3, near: number, face?: number, color = 0xe8edf2, width = 3.2) => {
    const t = new Text();
    t.text = s;
    t.font = fontUrl;
    t.fontSize = size;
    t.anchorX = 'center';
    t.anchorY = 'middle';
    t.maxWidth = width;
    t.textAlign = 'center';
    t.color = color;
    t.outlineWidth = '5%';
    t.outlineColor = 0x000000;
    t.position.copy(at);
    if (face !== undefined) t.rotation.y = face;
    labels.addText(t);
    texts.push({ t, at, near, ...(face !== undefined ? { face } : {}) });
  };
  for (const p of ch.pillars) {
    const out = new THREE.Vector3(-p.pos[0], 0, -p.pos[2]).normalize();
    // On the pillar's face toward the middle of the chamber, clear of its slight flare.
    text(plainName(graph.must(p.target)), 0.2, new THREE.Vector3(p.pos[0], 1.85, p.pos[2]).addScaledVector(out, p.radius * 1.1 + 0.04), 14, Math.atan2(out.x, out.z));
  }
  for (const p of passages) {
    const pl = p.portal.plaque;
    const arrow = p.up ? '↑' : '↓';
    text(`${arrow} ${plainName(graph.must(p.far.id))}\n${p.tunnel.feeding_lemmas.toLocaleString('en-US')} lemmas feed this tunnel · ${p.tunnel.chain_length + 1} steps`, 0.17, v3(pl.pos), 16, pl.yaw, p.up ? 0xffe2a0 : 0xbfe9ff, Math.max(3.2, p.portal.width + 1.6));
  }
  for (const { m, pos } of allMarkers) text(m.id, 0.16, pos.clone().add(new THREE.Vector3(0, 1.55, 0)), 7, undefined, 0xffe9b8);
  labels.sync();
  group.add(labels);

  // ---- light: ambient from the stratum, a lamp under the dome
  const ambient = new THREE.AmbientLight(0xffffff, 0.3 + 0.75 * ch.light);
  // The hall lamp has to reach the outer gallery doors. A plain hall stays at three radii.
  const galleryReach = ch.galleries.reduce((far, g) => Math.max(far, g.outer_radius), 0);
  const lamp = new THREE.PointLight(0xffe0b0, 10 + 45 * ch.light, Math.max(ch.radius * 3, galleryReach + 4), 1.6);
  lamp.position.set(0, ch.height * 0.85, 0);
  group.add(ambient, lamp);

  // ---- focus: one passage, built on demand
  let focused: { p: Passage; group: THREE.Group } | null = null;
  function focus(p: Passage | null) {
    if (focused && focused.p === p) return;
    if (focused) {
      group.remove(focused.group);
      focused.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      focused = null;
    }
    allTunnels.visible = allFar.visible = !p;
    if (!p) return;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(tunnelGeometry(p.tunnel, p.up ? [...p.path].reverse() : p.path), material()));
    g.add(new THREE.Mesh(chamberGeometry(p.far).applyMatrix4(poseMatrix(p.farPose)), material()));
    // The far chamber's statement, so it reads as you walk in.
    const farSlab = statementSlab(p.far, graph);
    farSlab.applyMatrix4(poseMatrix(p.farPose));
    g.add(farSlab);
    group.add(g);
    focused = { p, group: g };
  }

  const camPos = new THREE.Vector3();
  const camQ = new THREE.Quaternion();
  return {
    group,
    chamber: ch,
    passages,
    focus,
    update(camera) {
      camera.getWorldPosition(camPos);
      camera.getWorldQuaternion(camQ);
      for (const x of texts) {
        const d = camPos.distanceTo(x.at);
        const o = Math.max(0, Math.min(1, (x.near - d) / (x.near * 0.35)));
        x.t.fillOpacity = o;
        x.t.outlineOpacity = o * 0.8;
        if (x.face === undefined) x.t.quaternion.copy(camQ);
      }
    },
    setLight(level) {
      ambient.intensity = 0.3 + 0.75 * level;
      lamp.intensity = 10 + 45 * level;
    },
    dispose() {
      focus(null);
      for (const d of disposables) d.dispose();
      labels.dispose();
    },
    drawnChambers: () => [id, ...(focused ? [focused.p.far.id] : passages.map((p) => p.far.id))],
  };
}

/** The statement wall: a stone slab with the chamber's name and statement, from the descriptor. */
function statementSlab(ch: Chamber, graph: MineGraph): THREE.Mesh {
  const [w, h] = ch.statement.size;
  const mat = new THREE.MeshBasicMaterial({ color: 0x1b1d22 });
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  slab.position.copy(v3(ch.statement.pos));
  slab.rotation.y = ch.statement.yaw;
  slab.name = `statement:${ch.id}`;
  statementTexture(graph.must(ch.id), w / h).then(
    (tex) => {
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    },
    () => {},
  );
  return slab;
}

/** Fast lookups into scene.json. */
export class SceneIndex {
  private chambers = new Map<string, Chamber>();
  private tunnels = new Map<string, Tunnel>();
  constructor(readonly file: SceneFile) {
    for (const c of file.chambers) this.chambers.set(c.id, c);
    for (const t of file.tunnels) this.tunnels.set(t.id, t);
  }
  chamber(id: string): Chamber {
    const c = this.chambers.get(id);
    if (!c) throw new Error(`no chamber ${id}`);
    return c;
  }
  tunnel(id: string): Tunnel {
    const t = this.tunnels.get(id);
    if (!t) throw new Error(`no tunnel ${id}`);
    return t;
  }
}
