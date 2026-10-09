import * as THREE from 'three';
import { statusOf } from './graph.js';
import { LEVEL } from './layout.js';

/**
 * The mine in three.js: a crystal per node, a tunnel per "comes from", a label under each crystal.
 *
 * Everything sits in one group, so the headset can shrink the whole mine onto a table and turn it
 * (src/xr/xr.js) without touching anything inside.
 *
 * Colours say where the student stands:
 *   law     the vein's colour, bright: given, where digging starts
 *   mined   gold: derived
 *   open    the vein's colour, pulsing: everything it needs is mined, so it can be dug now
 *   locked  grey rock: something above it is still unmined
 */
const GOLD = new THREE.Color(0xffcf5a);
const ROCK = new THREE.Color(0x3b424c);
const ROCK_TUNNEL = new THREE.Color(0x262b32);

export function createMine(graph, pos) {
  const group = new THREE.Group();
  group.name = 'mine';

  // ---- the surface the laws stand on, and dust hanging in the dark below it
  const surface = new THREE.GridHelper(64, 32, 0x4a5a6a, 0x26303a);
  surface.position.y = -1.6;
  surface.material.transparent = true;
  surface.material.opacity = 0.35;
  group.add(surface);

  const dustN = 900;
  const dust = new Float32Array(dustN * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < dustN; i++) {
    dust[3 * i] = (rnd() - 0.5) * 60;
    dust[3 * i + 1] = -2 - rnd() * (graph.maxDepth * LEVEL + 8);
    dust[3 * i + 2] = (rnd() - 0.5) * 36;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  group.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x8aa0b8, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.35, depthWrite: false })));

  // ---- crystals
  const crystalGeo = new THREE.OctahedronGeometry(0.8, 0);
  crystalGeo.scale(1, 1.55, 1);
  const hitGeo = new THREE.SphereGeometry(1.6, 12, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const crystals = new Map();
  const hits = [];
  for (const node of graph.nodes) {
    const vein = new THREE.Color(graph.veins[node.vein].color);
    const mat = new THREE.MeshStandardMaterial({ color: vein, emissive: vein, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.15, flatShading: true });
    const mesh = new THREE.Mesh(crystalGeo, mat);
    mesh.position.fromArray(pos.get(node.id));
    group.add(mesh);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.copy(mesh.position);
    hit.userData.id = node.id;
    group.add(hit);
    hits.push(hit);
    const label = makeLabel(node.short || node.title);
    // Laws stand on the surface: their labels go above, clear of the grid. Results' labels hang below.
    label.position.copy(mesh.position).add(new THREE.Vector3(0, node.law ? 2.2 : -2.1, 0));
    group.add(label);
    crystals.set(node.id, { node, mesh, mat, vein, label, status: null, spin: rnd() * Math.PI * 2 });
  }

  // ---- tunnels: from the node a result comes from, down to the result
  const tunnels = [];
  for (const node of graph.nodes) {
    for (const p of node.from) {
      const a = new THREE.Vector3().fromArray(pos.get(p));
      const b = new THREE.Vector3().fromArray(pos.get(node.id));
      const mid = a.clone().lerp(b, 0.5);
      // Sag outward from the shaft a little, so tunnels from one law fan out instead of overlapping.
      const out = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
      if (out.lengthSq() > 1e-6) mid.add(out.normalize().multiplyScalar(0.8));
      const curve = new THREE.CatmullRomCurve3([a.clone().add(new THREE.Vector3(0, -1.2, 0)), mid, b.clone().add(new THREE.Vector3(0, 1.3, 0))]);
      const mat = new THREE.MeshStandardMaterial({ color: ROCK_TUNNEL, emissive: ROCK_TUNNEL, emissiveIntensity: 0.2, roughness: 0.8 });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.14, 8, false), mat);
      group.add(mesh);
      tunnels.push({ from: p, to: node.id, mat, vein: new THREE.Color(graph.veins[node.vein].color) });
    }
  }

  // ---- the ring round the selected crystal
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  group.add(ring);

  group.add(new THREE.HemisphereLight(0xcfe0ff, 0x101418, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(8, 20, 14);
  group.add(key);

  let selected = null;

  return {
    group,
    hits,
    /** The node a ray points at, or null. */
    pick(raycaster) {
      const h = raycaster.intersectObjects(hits, false)[0];
      return h ? h.object.userData.id : null;
    },
    positionOf: (id) => crystals.get(id).mesh.position,
    select(id) {
      selected = id;
      ring.visible = !!id;
    },
    update(mined, t) {
      for (const c of crystals.values()) {
        const st = statusOf(c.node, mined);
        if (st !== c.status) {
          c.status = st;
          setLabel(c.label, c.node.short || c.node.title, st);
        }
        const base = st === 'mined' ? GOLD : st === 'locked' ? ROCK : c.vein;
        c.mat.color.copy(base);
        c.mat.emissive.copy(base);
        c.mat.emissiveIntensity = st === 'law' ? 0.75 : st === 'mined' ? 0.8 : st === 'open' ? 0.35 + 0.3 * Math.sin(t * 3 + c.spin) : 0.06;
        c.mesh.rotation.y = c.spin + t * (st === 'locked' ? 0.1 : 0.4);
      }
      for (const tu of tunnels) {
        const top = statusOf(crystals.get(tu.from).node, mined);
        const bottom = statusOf(crystals.get(tu.to).node, mined);
        const lit = bottom === 'mined';
        const reach = (top === 'law' || top === 'mined') && !lit;
        const c = lit ? GOLD : reach ? tu.vein : ROCK_TUNNEL;
        tu.mat.color.copy(c);
        tu.mat.emissive.copy(c);
        tu.mat.emissiveIntensity = lit ? 0.7 : reach ? 0.22 : 0.15;
      }
      if (selected) {
        ring.position.copy(crystals.get(selected).mesh.position);
        ring.scale.setScalar(1 + 0.06 * Math.sin(t * 4));
      }
    },
  };
}

// ---- labels: a canvas texture on a sprite, so they show in the headset too
function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(5.6, 1.05, 1);
  sprite.userData.canvas = canvas;
  setLabel(sprite, text, 'locked');
  return sprite;
}

function setLabel(sprite, text, status) {
  const canvas = sprite.userData.canvas;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.font = '600 46px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = status === 'locked' ? '#7d8794' : status === 'mined' ? '#ffd879' : '#eef2f6';
  const lines = [text];
  const y0 = canvas.height / 2;
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = 8;
  lines.forEach((l) => g.fillText(l, canvas.width / 2, y0, canvas.width - 16));
  sprite.material.map.needsUpdate = true;
}
