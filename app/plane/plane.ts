import * as THREE from 'three';
import { parsePlane, type PlaneFile, type PlaneText, type RoadColumn } from '../../core/schema';
import { pickTarget, type Target } from './focus';
import { buildGround, buildWorld } from './world';
import { Sign } from './labels';
import { Travel, type Pose } from './travel';
import { attachXR, type XRInfo } from './xr';
import { EYE, PlaneWalk, type Blocker } from './walk';
import { primeColours, type Road } from './road';
import type { Plaza } from './plaza';
import type { Overlook } from './overlook';

/**
 * The number theory plane: a road of integers, a sieve plaza and an overlook, as one walkable
 * place. Desktop: click to look with the mouse, WASD to walk, 1 2 3 travel to a stop (guided,
 * eased), look at a column to read what it is made of, click a plaza column to strike it.
 * Everything drawn comes from data/plane-number-theory.json; this decides no geometry.
 */
export interface PlaneOptions {
  renderer: THREE.WebGLRenderer;
  base: string;
  onExit(): void;
}

type Zone = 'road' | 'plaza' | 'overlook';
type Focus = { kind: 'road'; n: number } | { kind: 'plaza'; n: number } | null;

const BG = 0x07090c;

export function createPlane(o: PlaneOptions) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.003);
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 900);
  const rig = new THREE.Group();
  rig.add(camera);
  camera.position.set(0, EYE, 0);
  scene.add(rig);
  scene.add(new THREE.HemisphereLight(0xb5c3e0, 0x30323a, 3.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-30, 60, 20);
  scene.add(sun);

  let data: PlaneFile | null = null;
  let road: Road | null = null;
  let plaza: Plaza | null = null;
  let overlook: Overlook | null = null;
  let walk: PlaneWalk | null = null;
  let loading: Promise<PlaneFile> | null = null;
  let focusSign: Sign | null = null;
  let active = false;
  let heading = 0;
  let pitch = 0;
  let travel: { plan: Travel; t: number; to: string } | null = null;
  let focus: Focus = null;
  let roadTargets: Target[] = [];
  let pointer: { x: number; y: number } | null = null;
  let lastStop: string | null = null;
  let marker: ReturnType<Overlook['sampleAt']> = null;
  const keys = new Set<string>();
  const ray = new THREE.Raycaster();

  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const hud = $('plane-hud');

  async function load(): Promise<PlaneFile> {
    if (data) return data;
    loading ??= fetch(`${o.base}plane-number-theory.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`plane-number-theory.json: ${r.status}`);
        return r.json();
      })
      .then((raw: unknown) => parsePlane(raw));
    data = await loading;
    const colours = primeColours(data);
    const built = buildWorld(data, colours);
    road = built.road;
    plaza = built.plaza;
    overlook = built.overlook;
    scene.add(buildGround(data), road.group, plaza.group, overlook.group);
    const size = data.road.labels.sign_size;
    focusSign = new Sign(size[0], size[1] + 0.2);
    scene.add(focusSign.mesh);
    const blockers: Blocker[] = data.road.columns.map((c) => ({ x: c.pos[0], z: c.pos[2], r: c.radius }));
    walk = new PlaneWalk(data.ground, [...blockers, ...plaza.blockers]);
    roadTargets = data.road.columns
      .filter((c) => c.kind !== 'unit')
      .map((c) => ({ id: `road:${c.n}`, x: c.pos[0], z: c.pos[2], r: Math.max(data!.road.block.size, data!.road.monolith.width) / 2 * 1.2, y0: 0, y1: c.height }));
    return data;
  }

  // ---- placing the student
  const stopPose = (id: string): Pose => {
    const s = (data as PlaneFile).stops.find((x) => x.id === id);
    if (!s) throw new Error(`no stop ${id}`);
    return { x: s.pos[0], z: s.pos[2], heading: s.yaw, pitch: s.pitch };
  };
  function setPose(p: Pose) {
    (walk as PlaneWalk).place(p.x, p.z);
    heading = p.heading;
    pitch = p.pitch;
  }

  async function enter(stop = 'road') {
    await load();
    setPose(stopPose(stop));
    lastStop = stop;
    travel = null;
    (plaza as Plaza).reset();
    active = true;
    hud.hidden = false;
    document.body.classList.add('plane');
    showStops();
  }

  function exit() {
    if (xrEnd) xrEnd();
    active = false;
    travel = null;
    hud.hidden = true;
    document.body.classList.remove('plane');
    if (document.pointerLockElement) document.exitPointerLock();
    keys.clear();
    o.onExit();
  }

  function startTravel(id: string) {
    if (!active || !walk || travel || !data) return;
    const from: Pose = { x: walk.x, z: walk.z, heading, pitch };
    travel = { plan: new Travel(from, stopPose(id), xrActive()), t: 0, to: id };
  }

  const stops = () => (data as PlaneFile).stops;
  function nextStop(): string {
    const i = stops().findIndex((s) => s.id === (travel?.to ?? lastStop));
    return (stops()[Math.min(stops().length - 1, i + 1)] as { id: string }).id;
  }

  // ---- the XR seam (app/plane/xr.ts attaches itself here)
  let xrEnd: (() => void) | null = null;
  let xrActive: () => boolean = () => false;
  let xrInfo: () => XRInfo = () => ({ active: false, heading: 0, vignette: 0, target: false, aim: null });

  // ---- what the student is looking at
  function viewRay(): { o: THREE.Vector3; d: THREE.Vector3 } | null {
    if (extraRay) return extraRay();
    const locked = document.pointerLockElement === o.renderer.domElement;
    ray.setFromCamera(locked || !pointer ? new THREE.Vector2(0, 0) : new THREE.Vector2(pointer.x, pointer.y), camera);
    return { o: ray.ray.origin.clone(), d: ray.ray.direction.clone() };
  }
  let extraRay: (() => { o: THREE.Vector3; d: THREE.Vector3 } | null) | null = null;

  function pickFocus(): Focus {
    const r = viewRay();
    if (!r || travel) return null;
    const hit = pickTarget(r.o, r.d, [...roadTargets, ...(plaza as Plaza).targets()]);
    if (!hit) return null;
    const [kind, n] = hit.id.split(':') as ['road' | 'plaza', string];
    return { kind, n: Number(n) };
  }

  const column = (n: number): RoadColumn => (data as PlaneFile).road.columns[n - 1] as RoadColumn;
  function applyFocus(f: Focus) {
    const same = f?.kind === focus?.kind && f?.n === focus?.n;
    focus = f;
    if (same) return;
    const d = data as PlaneFile;
    const sign = focusSign as Sign;
    if (f?.kind === 'road') {
      const c = column(f.n);
      sign.set([c.label], c.kind === 'prime' ? (d.primes.find((p) => p.p === c.n)?.color ?? '#ffcf5a') : '#ffcf5a');
      sign.mesh.visible = true;
      (road as Road).showThreads(f.n);
      focusPos.set(c.pos[0], c.height + d.road.labels.sign_offset, c.pos[2]);
    } else if (f?.kind === 'plaza') {
      const cell = d.plaza.grid.find((c) => c.n === f.n) as PlaneFile['plaza']['grid'][number];
      sign.set([`Strike ${f.n}`], d.plaza.glow);
      sign.mesh.visible = true;
      (road as Road).showThreads(null);
      focusPos.set(cell.pos[0], d.plaza.column.height + 1.0, cell.pos[2]);
    } else {
      sign.mesh.visible = false;
      (road as Road).showThreads(null);
    }
  }
  const focusPos = new THREE.Vector3();

  function strike(n: number): number[] | null {
    return (plaza as Plaza).strike(n);
  }
  function strikeFocused() {
    if (focus?.kind === 'plaza') strike(focus.n);
  }

  // ---- input
  window.addEventListener('keydown', (e) => {
    if (!active || (e.target as HTMLElement).tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'KeyM') exit();
    else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      const s = stops()[Number(e.code.slice(-1)) - 1];
      if (s) startTravel(s.id);
    } else if (e.code === 'Enter' || e.code === 'KeyF') strikeFocused();
    else if (e.code === 'KeyR') (plaza as Plaza).reset();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const dom = o.renderer.domElement;
  dom.addEventListener('pointermove', (e) => {
    if (!active) return;
    const r = dom.getBoundingClientRect();
    pointer = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
  });
  dom.addEventListener('pointerleave', () => (pointer = null));
  dom.addEventListener('click', () => {
    if (!active || travel) return;
    if (focus?.kind === 'plaza') strikeFocused();
    else if (!document.pointerLockElement) dom.requestPointerLock?.();
  });
  document.addEventListener('mousemove', (e) => {
    if (!active || document.pointerLockElement !== dom) return;
    heading -= e.movementX * 0.0022;
    pitch = Math.max(-1.3, Math.min(1.3, pitch - e.movementY * 0.0022));
  });
  $('pl-map').addEventListener('click', () => exit());
  $('pl-reset').addEventListener('click', () => (plaza as Plaza).reset());
  $('pl-stops').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b?.dataset.stop) startTravel(b.dataset.stop);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---- the HUD
  const shown = new Map<string, string>();
  const setText = (id: string, text: string) => {
    if (shown.get(id) === text) return;
    shown.set(id, text);
    $(id).textContent = text;
  };
  function showStops() {
    const box = $('pl-stops');
    if (box.childElementCount) return;
    stops().forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost';
      b.dataset.stop = s.id;
      b.textContent = `${i + 1}  ${s.name}`;
      b.title = `Travel to ${s.name} (${i + 1})`;
      box.append(b);
    });
  }
  const text = (id: string): PlaneText => (data as PlaneFile).texts.find((t) => t.id === id) as PlaneText;
  function zoneOf(x: number, z: number): Zone {
    const d = data as PlaneFile;
    const sq = d.ground.square;
    const dx = x - sq.centre[0];
    const dz = z - sq.centre[2];
    const c = Math.cos(sq.yaw);
    const s = Math.sin(sq.yaw);
    if (Math.abs(dx * c - dz * s) <= sq.half && Math.abs(dx * s + dz * c) <= sq.half) return 'plaza';
    return (overlook as Overlook).sampleAt(x, z) ? 'overlook' : 'road';
  }
  function updateHud(zone: Zone) {
    const d = data as PlaneFile;
    const ps = (plaza as Plaza).state();
    const nearStart = Math.hypot((walk as PlaneWalk).x - d.road.seed.pos[0], (walk as PlaneWalk).z - d.road.seed.pos[2]) < 14;
    const id = zone === 'road' ? (nearStart ? 'arrive' : 'road') : zone;
    const t = text(id);
    const name = zone === 'road' ? 'The road of integers' : (d.stops.find((s) => s.id === zone)?.name ?? zone);
    setText('pl-name', name);
    setText('pl-text', t.text);
    $('pl-draft').hidden = t.reviewed;
    const f = focus;
    setText('pl-focus', f?.kind === 'road' ? column(f.n).label : f?.kind === 'plaza' ? `${f.n}: click to strike it` : '');
    $('pl-sieve').hidden = zone !== 'plaza';
    setText('pl-count', `${ps.standing.length} of ${d.plaza.grid.length} standing`);
    const note = text('sieve_note');
    $('pl-note').hidden = !ps.done;
    setText('pl-note-text', note.text);
    $('pl-note-draft').hidden = note.reviewed;
    $('pl-readout').hidden = zone !== 'overlook' || !marker;
    if (marker) setText('pl-readout-text', `x = ${marker.x.toLocaleString('en-US')} · π(x) = ${marker.pi.toLocaleString('en-US')} · x / ln x ≈ ${Math.round(marker.estimate).toLocaleString('en-US')} · ratio ${marker.ratio.toFixed(3)}`);
    for (const b of $('pl-stops').querySelectorAll('button')) b.classList.toggle('here', b.dataset.stop === zone);
  }

  // ---- each frame
  function update(dt: number) {
    if (!active || !data || !walk) return;
    xr.update();
    (plaza as Plaza).update(dt);
    if (travel) {
      travel.t += dt;
      const s = travel.plan.at(travel.t);
      setPose(s.pose);
      if (s.done) {
        lastStop = travel.to;
        travel = null;
      }
    } else if (!xrActive()) {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      if (f || r) {
        const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8 : 3.2) * dt;
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        // Right of the heading (sin, cos) is (-cos, sin).
        walk.move((fx * f - fz * r) * speed, (fz * f + fx * r) * speed);
      }
    }
    rig.position.set(walk.x, 0, walk.z);
    rig.rotation.set(0, heading + Math.PI, 0);
    if (!xrActive()) camera.rotation.set(pitch, 0, 0);
    rig.updateMatrixWorld(true);
    const cam = camera.getWorldPosition(new THREE.Vector3());
    applyFocus(pickFocus());
    const sign = focusSign as Sign;
    if (focus) sign.place(focusPos, cam);
    marker = (overlook as Overlook).sampleAt(walk.x, walk.z);
    (overlook as Overlook).mark(marker, cam);
    updateHud(zoneOf(walk.x, walk.z));
  }

  const xr = attachXR({
    renderer: o.renderer,
    camera,
    rig,
    scene,
    eye: EYE,
    walk: () => walk as PlaneWalk,
    isPlaneActive: () => active,
    getHeading: () => heading,
    setHeading: (h) => (heading = h),
    focusKind: () => focus?.kind ?? null,
    strikeFocused,
    startTravel,
    nextStop,
    travelling: () => !!travel,
    travelK: () => (travel ? Math.min(1, travel.t / travel.plan.duration) : null),
    setRay: (fn) => (extraRay = fn),
    onXR(end, isActive, info) {
      xrEnd = end;
      xrActive = isActive;
      xrInfo = info;
    },
  });

  return {
    scene,
    camera,
    rig,
    get active() {
      return active;
    },
    enter,
    exit,
    update,
    /** The seam the headset code plugs into. */
    internals: {
      get data() {
        return data as PlaneFile;
      },
      get walk() {
        return walk as PlaneWalk;
      },
      get plaza() {
        return plaza as Plaza;
      },
      get heading() {
        return heading;
      },
      set heading(h: number) {
        heading = h;
      },
      get travelling() {
        return !!travel;
      },
      stopPose,
      startTravel,
      nextStop,
      strikeFocused,
      scene,
      get focus() {
        return focus;
      },
      get travelTo() {
        return travel?.to ?? null;
      },
    },
    /** For tests: the headset state. */
    get xr() {
      return xrInfo();
    },
    /** For tests: where you are and what you see. */
    get state() {
      const d = data;
      return {
        active,
        zone: d && walk ? zoneOf(walk.x, walk.z) : null,
        pos: walk ? [walk.x, walk.z] : null,
        heading,
        pitch,
        focus,
        threads: focus?.kind === 'road' ? column(focus.n).threads.length : 0,
        travelling: !!travel,
        stop: lastStop,
        sieve: plaza ? plaza.state() : null,
        marker,
      };
    },
    /** For tests: stand somewhere (on the ground). */
    place(x: number, z: number) {
      walk?.place(x, z);
    },
    /** For tests: face a heading and pitch. */
    face(h: number, p = 0) {
      heading = h;
      pitch = p;
    },
    /** For tests: turn to look at the middle of a column from where you stand. */
    lookAt(kind: 'road' | 'plaza', n: number) {
      const d = data as PlaneFile;
      const w = walk as PlaneWalk;
      const c = kind === 'road' ? column(n) : null;
      const cell = kind === 'plaza' ? d.plaza.grid.find((g) => g.n === n) : null;
      const p = c ? c.pos : (cell as NonNullable<typeof cell>).pos;
      const h = c ? c.height : d.plaza.column.height;
      const dx = p[0] - w.x;
      const dz = p[2] - w.z;
      heading = Math.atan2(dx, dz);
      pitch = Math.atan2(h * 0.6 - EYE, Math.hypot(dx, dz));
    },
    strike,
    reset: () => (plaza as Plaza).reset(),
    /** For tests: stand at a stop at once (the real way is guided travel). */
    jump(id: string) {
      setPose(stopPose(id));
      lastStop = id;
    },
    goto: (id: string) => startTravel(id),
    /** For tests: the screen position (px) of a column's middle, for a real click. */
    screenOf(kind: 'road' | 'plaza', n: number): { x: number; y: number } | null {
      const d = data as PlaneFile;
      const cell = kind === 'plaza' ? d.plaza.grid.find((g) => g.n === n) : null;
      const c = kind === 'road' ? column(n) : null;
      const p = c ? c.pos : cell?.pos;
      if (!p) return null;
      const h = c ? c.height : d.plaza.column.height;
      const v = new THREE.Vector3(p[0], h * 0.6, p[2]).project(camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
    threadTriangles: (n: number) => (road ? road.threadCount(n) : 0),
    labelsOf: () => (data ? data.road.columns.map((c) => c.label) : []),
  };
}

export type Plane = ReturnType<typeof createPlane>;
