import * as THREE from 'three';
import { BatchedText, Text } from 'troika-three-text';
import { displayName, type MineGraph } from '../../core/graph';
import type { Kind, Meta, MineNode } from '../../core/schema';
import type { View } from '../state';
import { BG, SELECTED, TRACE, subjectColor } from './palette';

/**
 * The mine in three.js, built to the Quest's budget: one InstancedMesh per kind of node, one for
 * every tunnel, and one BatchedText for every label. That is six draw calls for the whole mine,
 * whatever its size (CLAUDE.md rule 4).
 *
 * Nothing here moves the camera. `apply(view)` recolours from the selection; `update` turns the
 * labels to face the camera each frame.
 */
const SHAPES: Record<Kind, () => THREE.BufferGeometry> = {
  axiom: () => new THREE.OctahedronGeometry(0.75),
  definition: () => new THREE.BoxGeometry(0.75, 0.75, 0.75),
  theorem: () => new THREE.IcosahedronGeometry(0.6, 0),
};
const DOWN = new THREE.Color(0x7fe3ff);
const BG_COLOR = new THREE.Color(BG);
const LABEL_DROP = 1.25;

export interface Mine {
  group: THREE.Group;
  apply(view: View): void;
  update(camera: THREE.Camera, time: number): void;
  /** The node nearest a screen point, within `radius` pixels, or null. */
  pickScreen(x: number, y: number, camera: THREE.Camera, width: number, height: number, radius?: number): string | null;
  position(id: string): THREE.Vector3;
  /** Draw calls the mine itself issues, for the budget check. */
  drawCalls(): number;
  setHover(id: string | null): void;
}

export function createMine(graph: MineGraph, meta: Meta, fontUrl: string): Mine {
  const group = new THREE.Group();
  group.name = 'mine';
  const pos = new Map<string, THREE.Vector3>(graph.nodes.map((n) => [n.id, new THREE.Vector3(...n.pos)]));
  const base = new Map<string, THREE.Color>(
    graph.nodes.map((n) => {
      const c = subjectColor(n.subject);
      if (n.kind === 'axiom') c.lerp(new THREE.Color(0xffffff), 0.3);
      return [n.id, c];
    }),
  );

  // ---- nodes: one InstancedMesh per kind
  const slot = new Map<string, { mesh: THREE.InstancedMesh; i: number }>();
  const meshes: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4();
  for (const kind of ['axiom', 'definition', 'theorem'] as Kind[]) {
    const list = graph.nodes.filter((n) => n.kind === kind);
    if (!list.length) continue;
    const mat = new THREE.MeshLambertMaterial({ emissive: 0x000000 });
    const mesh = new THREE.InstancedMesh(SHAPES[kind](), mat, list.length);
    mesh.name = `nodes-${kind}`;
    list.forEach((n, i) => {
      m.makeTranslation(pos.get(n.id) as THREE.Vector3);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, base.get(n.id) as THREE.Color);
      slot.set(n.id, { mesh, i });
    });
    mesh.instanceMatrix.needsUpdate = true;
    meshes.push(mesh);
    group.add(mesh);
  }

  // ---- tunnels: one InstancedMesh of open cylinders, thicker for more hidden lemmas
  const edges: { from: string; to: string; hidden: number }[] = [];
  for (const n of graph.nodes) n.deps.forEach((d, k) => edges.push({ from: n.id, to: d, hidden: n.hidden_steps[k] ?? 0 }));
  const tunnels = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshBasicMaterial(), Math.max(1, edges.length));
  tunnels.name = 'tunnels';
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  edges.forEach((e, i) => {
    const a = pos.get(e.to) as THREE.Vector3;
    const b = pos.get(e.from) as THREE.Vector3;
    const d = b.clone().sub(a);
    const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    const r = 0.03 + 0.018 * Math.log10(1 + e.hidden);
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
    tunnels.setMatrixAt(i, m);
  });
  tunnels.count = edges.length;
  tunnels.instanceMatrix.needsUpdate = true;
  group.add(tunnels);

  // ---- labels: every name in one BatchedText
  const labels = new BatchedText();
  labels.name = 'labels';
  const label = new Map<string, Text>();
  for (const n of graph.nodes) {
    const t = new Text();
    t.text = displayName(n);
    t.font = fontUrl;
    t.fontSize = n.kind === 'definition' ? 0.42 : 0.5;
    t.anchorX = 'center';
    t.anchorY = 'top';
    t.maxWidth = 9;
    t.textAlign = 'center';
    t.outlineWidth = '6%';
    t.outlineColor = BG;
    t.position.copy(pos.get(n.id) as THREE.Vector3).add(new THREE.Vector3(0, -LABEL_DROP, 0));
    labels.addText(t);
    label.set(n.id, t);
  }
  // Subject names round the rim of the surface, and depth marks down the central shaft.
  const fixed: Text[] = [];
  let k = 0;
  for (const s of meta.subjects) {
    const members = graph.nodes.filter((n) => n.subject === s.id).map((n) => pos.get(n.id) as THREE.Vector3);
    if (!members.length) continue;
    // Above the rim, in the direction of the subject's wedge.
    const c = members.reduce((acc, p) => acc.add(new THREE.Vector3(p.x, 0, p.z)), new THREE.Vector3());
    if (c.lengthSq() < 1e-6) c.set(1, 0, 0);
    const t = new Text();
    t.text = s.name;
    t.font = fontUrl;
    t.fontSize = 2.2;
    t.anchorX = 'center';
    t.anchorY = 'bottom';
    t.color = subjectColor(s.id).getHex();
    // Neighbouring small subjects would print over each other: step their heights.
    t.position.copy(c.setLength(50)).setY(3 + (k++ % 3) * 3);
    labels.addText(t);
    fixed.push(t);
  }
  const step = 50;
  for (let d = step; d <= meta.max_depth; d += step) {
    const t = new Text();
    t.text = `depth ${d}`;
    t.font = fontUrl;
    t.fontSize = 0.9;
    t.anchorX = 'center';
    t.anchorY = 'middle';
    t.color = 0x6b7684;
    t.position.set(0, -d * meta.metres_per_depth, 0);
    labels.addText(t);
    fixed.push(t);
  }
  labels.sync();
  group.add(labels);

  // The central shaft: a thin line down to the deepest landmark, ticked by the depth marks.
  const shaft = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -meta.max_depth * meta.metres_per_depth - 2, 0)]),
    new THREE.LineBasicMaterial({ color: 0x2b3440 }),
  );
  group.add(shaft);

  // The surface: a faint disc the roots stand on.
  const surface = new THREE.Mesh(
    new THREE.RingGeometry(4, 52, 96, 1),
    new THREE.MeshBasicMaterial({ color: 0x1a2430, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = -0.9;
  group.add(surface);

  // ---- the selected node's halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  halo.visible = false;
  group.add(halo);

  group.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1f26, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(30, 60, 40);
  group.add(sun);

  let current: View | null = null;
  let hover: string | null = null;
  const tmp = new THREE.Color();

  function apply(view: View) {
    current = view;
    const sel = view.selected;
    const tint = view.mode === 'up' ? TRACE : DOWN;
    for (const n of graph.nodes) {
      const s = slot.get(n.id);
      if (!s) continue;
      const b = base.get(n.id) as THREE.Color;
      if (!sel) tmp.copy(b);
      else if (n.id === sel) tmp.copy(SELECTED);
      else if (view.lit.has(n.id)) tmp.copy(tint);
      else tmp.copy(b).lerp(BG_COLOR, 0.86);
      s.mesh.setColorAt(s.i, tmp);
      const t = label.get(n.id) as Text;
      const on = !sel || n.id === sel || view.lit.has(n.id) || n.id === hover;
      t.fillOpacity = on ? (sel || n.kind !== 'definition' ? 1 : 0.6) : 0.06;
      t.outlineOpacity = on ? 0.9 : 0;
      t.color = sel && on && n.id !== sel ? tint.getHex() : 0xe8edf2;
    }
    for (const mesh of meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const lit = new Set(view.litTunnels.map(([a, b]) => `${a}>${b}`));
    edges.forEach((e, i) => {
      const b = base.get(e.from) as THREE.Color;
      if (!sel) tmp.copy(b).lerp(BG_COLOR, 0.72);
      else if (lit.has(`${e.from}>${e.to}`)) tmp.copy(tint);
      else tmp.copy(b).lerp(BG_COLOR, 0.95);
      tunnels.setColorAt(i, tmp);
    });
    if (tunnels.instanceColor) tunnels.instanceColor.needsUpdate = true;
    halo.visible = !!sel;
    if (sel) halo.position.copy(pos.get(sel) as THREE.Vector3);
    for (const t of fixed) t.fillOpacity = sel ? 0.25 : 1;
  }

  const qCam = new THREE.Quaternion();
  return {
    group,
    apply,
    update(camera, time) {
      camera.getWorldQuaternion(qCam);
      group.updateMatrixWorld();
      const inv = group.getWorldQuaternion(new THREE.Quaternion()).invert();
      qCam.premultiply(inv);
      for (const t of label.values()) t.quaternion.copy(qCam);
      for (const t of fixed) t.quaternion.copy(qCam);
      if (halo.visible) {
        halo.quaternion.copy(qCam);
        halo.scale.setScalar(1 + 0.06 * Math.sin(time * 3));
      }
    },
    pickScreen(x, y, camera, width, height, radius = 14) {
      const v = new THREE.Vector3();
      let best: string | null = null;
      let bestD = radius * radius;
      group.updateMatrixWorld();
      for (const n of graph.nodes) {
        v.copy(pos.get(n.id) as THREE.Vector3).applyMatrix4(group.matrixWorld).project(camera);
        if (v.z < -1 || v.z > 1) continue;
        const sx = ((v.x + 1) / 2) * width;
        const sy = ((1 - v.y) / 2) * height;
        const d = (sx - x) ** 2 + (sy - y) ** 2;
        // Lit nodes win ties: when tracing, the student is following the lit chain.
        const bias = current?.selected && (current.lit.has(n.id) || current.selected === n.id) ? 0.6 : 1;
        if (d * bias < bestD) {
          bestD = d * bias;
          best = n.id;
        }
      }
      return best;
    },
    position: (id) => (pos.get(id) as THREE.Vector3).clone(),
    drawCalls: () => meshes.length + 1 + 1 + 3,
    setHover(id) {
      if (id === hover) return;
      hover = id;
      if (current) apply(current);
    },
  };
}

export type { MineNode };
