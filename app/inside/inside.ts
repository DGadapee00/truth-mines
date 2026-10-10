import * as THREE from 'three';
import { plainName, type MineGraph } from '../../core/graph';
import { parseScene } from '../../core/schema';
import { poseMatrix } from './geometry';
import { buildStar, SceneIndex, type Passage, type Star } from './star';
import { EYE, Route, Walker } from './walk';

/**
 * The Inside view: you stand in a theorem's chamber at human scale and walk its tunnels.
 *
 * Desktop: click to look with the mouse, WASD or the arrows to walk, Shift to run. "Journey here"
 * starts at the axiom end of a landmark's critical path; each "Go" walks you, guided, through the
 * next tunnel. Only the local scene is ever built (src: ./star.ts).
 */
export interface InsideOptions {
  renderer: THREE.WebGLRenderer;
  graph: MineGraph;
  base: string;
  fontUrl: string;
  onExit(id: string): void;
}

export function createInside(o: InsideOptions) {
  const { graph } = o;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);
  const fog = new THREE.FogExp2(0x050506, 0.02);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
  const rig = new THREE.Group(); // the student: floor point and facing; the camera sits at eye height
  rig.add(camera);
  camera.position.set(0, EYE, 0);
  scene.add(rig);

  let index: SceneIndex | null = null;
  let star: Star | null = null;
  let walker: Walker | null = null;
  let yaw = 0;
  let pitch = 0;
  let active = false;
  let journey: { path: string[]; at: number } | null = null;
  let guided: { route: Route; passage: Passage; t: number; doorAt: number } | null = null;

  const $ = (id: string) => document.getElementById(id) as HTMLElement;
  const hud = $('inside-hud');

  async function load(): Promise<SceneIndex> {
    if (index) return index;
    const r = await fetch(`${o.base}scene.json`);
    if (!r.ok) throw new Error(`scene.json: ${r.status}`);
    index = new SceneIndex(parseScene(await r.json()));
    return index;
  }

  function build(id: string) {
    if (star) {
      rig.parent?.remove(rig);
      scene.remove(star.group);
      star.dispose();
    }
    star = buildStar(id, index as SceneIndex, graph, o.fontUrl);
    scene.add(star.group);
    scene.add(rig);
    walker = new Walker(star);
    showWhere();
  }

  function showWhere() {
    if (!star) return;
    const n = graph.must(star.chamber.id);
    $('ih-name').textContent = plainName(n);
    $('ih-depth').textContent = `depth ${n.depth} · ${star.chamber.portals.filter((p) => p.dir === 'up').length} tunnels up, ${star.chamber.portals.filter((p) => p.dir === 'down').length} down`;
    const j = $('ih-journey');
    j.hidden = !journey;
    if (journey) {
      const next = journey.path[journey.at + 1];
      $('ih-jtext').textContent = next
        ? `Journey to ${plainName(graph.must(journey.path.at(-1) as string))}: chamber ${journey.at + 1} of ${journey.path.length}. Next, down to ${plainName(graph.must(next))}.`
        : `Journey's end: ${plainName(n)}, ${journey.path.length - 1} tunnels down from the axioms.`;
      ($('ih-next') as HTMLButtonElement).hidden = !next;
    }
  }

  function spawn() {
    if (!star || !walker) return;
    const sp = star.chamber.spawn;
    walker.place(sp.pos[0], sp.pos[2]);
    // The camera looks down its -Z; facing heading(spawn.yaw) means turning the rig by yaw + π.
    yaw = sp.yaw + Math.PI;
    pitch = 0.08;
  }

  async function enter(id: string, path: string[] | null = null) {
    await load();
    journey = path ? { path, at: 0 } : null;
    build(path ? (path[0] as string) : id);
    spawn();
    active = true;
    hud.hidden = false;
    document.body.classList.add('inside');
  }

  function exit() {
    if (xrSession) xrSession.end();
    const id = star?.chamber.id ?? null;
    active = false;
    guided = null;
    journey = null;
    hud.hidden = true;
    document.body.classList.remove('inside');
    if (document.pointerLockElement) document.exitPointerLock();
    if (star) {
      scene.remove(star.group);
      star.dispose();
      star = null;
    }
    if (id) o.onExit(id);
  }

  /** Move into the chamber at the far end of `p`, keeping where you stand and which way you face. */
  function arrive(p: Passage, floorHere: THREE.Vector3) {
    const inv = poseMatrix(p.farPose).invert();
    const there = floorHere.clone().applyMatrix4(inv);
    yaw -= p.farPose.yaw;
    build(p.far.id);
    const r = Math.hypot(there.x, there.z);
    const room = (star as Star).chamber.radius - 0.8;
    (walker as Walker).place(r > room ? (there.x * room) / r : there.x, r > room ? (there.z * room) / r : there.z);
    if (journey) {
      const k = journey.path.indexOf(p.far.id);
      if (k >= 0) journey.at = k;
      showWhere();
    }
  }

  /** Guided travel through `p`: to its doorway, down the tunnel, into the far chamber. */
  function travel(p: Passage) {
    if (!star || !walker || walker.passage) return;
    const here = walker.floor().pos;
    const pts = [here];
    const door = p.path[0] as THREE.Vector3;
    const out = new THREE.Vector3(door.x, 0, door.z).normalize();
    // Round the pillar standing in front of an up doorway.
    const pillar = star.chamber.pillars.find((x) => x.target === p.far.id);
    if (pillar) {
      const side = new THREE.Vector3(out.z, 0, -out.x);
      pts.push(new THREE.Vector3(pillar.pos[0], 0, pillar.pos[2]).addScaledVector(side, pillar.radius + 1.1));
    }
    pts.push(door.clone().addScaledVector(out, -1.2));
    const doorAt = pts.reduce((acc, q, i) => (i ? acc + q.distanceTo(pts[i - 1] as THREE.Vector3) : 0), 0) + 1.2;
    pts.push(...p.path);
    const far = p.far.spawn.pos;
    pts.push(new THREE.Vector3(far[0], 0, far[2]).applyMatrix4(poseMatrix(p.farPose)));
    guided = { route: new Route(pts, 6), passage: p, t: 0, doorAt };
  }

  function next() {
    if (!journey || !star) return;
    const target = journey.path[journey.at + 1];
    const p = star.passages.find((x) => x.far.id === target);
    if (p) travel(p);
  }

  // ---- input
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (!active || (e.target as HTMLElement).tagName === 'INPUT') return;
    keys.add(e.code);
    if (e.code === 'KeyM') exit();
    if (e.code === 'KeyN' || e.code === 'Enter') next();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  o.renderer.domElement.addEventListener('click', () => {
    if (active && !document.pointerLockElement && !guided) o.renderer.domElement.requestPointerLock?.();
  });
  document.addEventListener('mousemove', (e) => {
    if (!active || document.pointerLockElement !== o.renderer.domElement) return;
    yaw -= e.movementX * 0.0022;
    pitch = Math.max(-1.3, Math.min(1.3, pitch - e.movementY * 0.0022));
  });
  $('ih-map').addEventListener('click', () => exit());
  const vrBtn = $('ih-vr') as HTMLButtonElement;
  vrBtn.addEventListener('click', () => enterXR().catch((e: unknown) => console.warn('Truth Mines: could not start the headset', e)));
  navigator.xr?.isSessionSupported?.('immersive-vr').then((ok) => (vrBtn.hidden = !ok), () => {});
  $('ih-next').addEventListener('click', () => next());

  // ---- the headset (WebXR): teleport, 30-degree snap turn, guided tunnel travel with a vignette
  //
  // Comfort (CLAUDE.md rule 6): nothing moves you unless you asked. Teleport is instant; turning
  // is in 30-degree snaps; a tunnel is a guided move you start by pointing at its doorway, with an
  // ease in and out and a vignette, and it never turns your view for you.
  const vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float uOpacity; void main() { float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(0.3, 0.8, r) * uOpacity); }',
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  vignette.position.set(0, 0, -0.3);
  vignette.renderOrder = 999;
  vignette.visible = false;
  camera.add(vignette);
  const target = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.85 }));
  target.rotation.x = -Math.PI / 2;
  target.renderOrder = 998;
  target.visible = false;
  scene.add(target);

  type Aim = { kind: 'floor'; at: THREE.Vector3 } | { kind: 'door'; at: THREE.Vector3; passage: Passage } | null;
  interface Hand {
    c: THREE.Group;
    line: THREE.Line;
    source: XRInputSource | null;
    aiming: boolean;
    aim: Aim;
    turnArmed: boolean;
    pressed: boolean[];
  }
  let xrSession: XRSession | null = null;
  let hands: Hand[] = [];
  const ray = new THREE.Raycaster();

  function aimOf(h: Hand): Aim {
    if (!star || !walker || walker.passage) return null;
    h.c.updateMatrixWorld();
    const o3 = new THREE.Vector3().setFromMatrixPosition(h.c.matrixWorld);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(h.c.matrixWorld);
    ray.set(o3, d);
    const ch = star.chamber;
    // A doorway: where the ray meets the round wall, inside a doorway's opening.
    const a = d.x * d.x + d.z * d.z;
    const b = 2 * (o3.x * d.x + o3.z * d.z);
    const c = o3.x * o3.x + o3.z * o3.z - ch.radius * ch.radius;
    const disc = b * b - 4 * a * c;
    if (a > 1e-9 && disc > 0) {
      const t = (-b + Math.sqrt(disc)) / (2 * a);
      const hit = o3.clone().addScaledVector(d, t);
      if (t > 0 && hit.y > 0 && hit.y < 3.6) {
        const ang = Math.atan2(hit.x, hit.z);
        const p = star.passages.find((x) => Math.abs(Math.atan2(Math.sin(ang - x.portal.yaw), Math.cos(ang - x.portal.yaw))) < x.portal.width / 2 / ch.radius && hit.y < x.portal.height);
        if (p) return { kind: 'door', at: new THREE.Vector3(hit.x, 0, hit.z), passage: p };
      }
    }
    // The floor: inside the wall, clear of pillars.
    if (d.y < -1e-3) {
      const t = -o3.y / d.y;
      const hit = o3.clone().addScaledVector(d, t);
      const ok = Math.hypot(hit.x, hit.z) < ch.radius - 0.6 && !ch.pillars.some((p) => Math.hypot(hit.x - p.pos[0], hit.z - p.pos[2]) < p.radius * 1.1 + 0.35);
      if (ok) return { kind: 'floor', at: hit };
    }
    return null;
  }

  function teleportOrTravel(h: Hand) {
    const aim = aimOf(h);
    if (!aim || guided || !walker) return;
    if (aim.kind === 'floor') walker.place(aim.at.x, aim.at.z);
    else travel(aim.passage);
  }

  async function enterXR() {
    if (xrSession || !active || !navigator.xr) return;
    const r = o.renderer;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    xrSession = session;
    if (document.pointerLockElement) document.exitPointerLock();
    camera.position.set(0, 0, 0);
    pitch = 0;
    hands = [0, 1].map((i) => {
      const c = r.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
      line.scale.z = 6;
      c.add(line);
      const h: Hand = { c, line, source: null, aiming: false, aim: null, turnArmed: true, pressed: [] };
      c.addEventListener('connected', (e) => (h.source = (e as unknown as { data: XRInputSource }).data));
      c.addEventListener('disconnected', () => (h.source = null));
      c.addEventListener('selectstart', () => (h.aiming = true));
      c.addEventListener('selectend', () => {
        h.aiming = false;
        teleportOrTravel(h);
      });
      rig.add(c);
      return h;
    });
    session.addEventListener('end', () => {
      for (const h of hands) rig.remove(h.c);
      hands = [];
      xrSession = null;
      target.visible = false;
      vignette.visible = false;
      camera.position.set(0, EYE, 0);
      window.dispatchEvent(new Event('resize'));
    });
    await r.xr.setSession(session);
  }

  function updateXR() {
    if (!xrSession) return;
    let shown: Aim = null;
    for (const h of hands) {
      const gp = h.source?.gamepad;
      if (gp) {
        // Snap turn: one 30-degree step per flick of the thumbstick.
        const x = gp.axes.length >= 4 ? (gp.axes[2] ?? 0) : (gp.axes[0] ?? 0);
        if (h.turnArmed && Math.abs(x) > 0.7) {
          yaw -= Math.sign(x) * (Math.PI / 6);
          h.turnArmed = false;
        } else if (Math.abs(x) < 0.3) h.turnArmed = true;
        const press = (i: number) => {
          const now = !!gp.buttons[i]?.pressed;
          const was = !!h.pressed[i];
          h.pressed[i] = now;
          return now && !was;
        };
        if (press(4)) next();
        if (press(5)) xrSession.end();
      }
      if (h.source && !guided) {
        const aim = aimOf(h);
        if (h.aiming || !shown) shown = aim ?? shown;
      }
    }
    target.visible = !!shown && !guided;
    if (shown) {
      target.position.copy(shown.at).setY(0.02);
      (target.material as THREE.MeshBasicMaterial).color.set(shown.kind === 'door' ? 0xffcf5a : 0xffffff);
    }
  }

  // ---- each frame
  function update(dt: number) {
    if (!active || !star || !walker) return;
    updateXR();
    if (guided) {
      guided.t += dt;
      const at = guided.route.at(guided.t);
      const dist = guided.route.s.at(-1) as number;
      const travelled = (guided.t / guided.route.duration) * dist;
      star.focus(travelled > guided.doorAt - 0.5 ? guided.passage : null);
      rig.position.copy(at.pos);
      if (xrSession) {
        // In the headset the view is never turned for you; a vignette narrows it while you move.
        const k = guided.t / guided.route.duration;
        vignette.visible = true;
        (vignette.material as THREE.ShaderMaterial).uniforms.uOpacity!.value = 0.9 * Math.min(1, k * 4, (1 - k) * 4);
      } else {
        // On the desktop, turn smoothly toward the way ahead; never roll.
        const diff = Math.atan2(Math.sin(at.heading + Math.PI - yaw), Math.cos(at.heading + Math.PI - yaw));
        yaw += diff * Math.min(1, dt * 3);
        pitch *= 1 - Math.min(1, dt * 2);
      }
      if (at.done) {
        const p = guided.passage;
        guided = null;
        vignette.visible = false;
        arrive(p, at.pos);
        const sp = (star as Star).chamber.spawn;
        (walker as Walker).place(sp.pos[0], sp.pos[2]);
      }
    } else {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      if (f || r) {
        const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8 : 3.2) * dt;
        // Facing -Z at yaw 0 (the camera looks down its -Z), so forward is -heading(yaw).
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const reached = walker.move((fx * f - fz * r) * speed, (fz * f + fx * r) * speed);
        if (reached) arrive(reached, walker.floor().pos);
      }
      star.focus(walker.passage);
      rig.position.copy(walker.floor().pos);
    }
    rig.rotation.set(0, yaw, 0);
    if (!xrSession) camera.rotation.set(pitch, 0, 0);

    // Strata: fog and light of where you stand (between the two ends inside a tunnel).
    const fl = walker.floor();
    const p = guided ? null : fl.passage;
    if (p) {
      const [top, bottom] = p.tunnel.fog;
      const [lt, lb] = p.tunnel.light;
      const k = p.up ? 1 - fl.along : fl.along;
      fog.density = top + (bottom - top) * k;
      star.setLight(lt + (lb - lt) * k);
    } else {
      fog.density = star.chamber.fog;
      star.setLight(star.chamber.light);
    }
    fog.color.set(star.chamber.rock).multiplyScalar(0.12);
    (scene.background as THREE.Color).copy(fog.color);
    star.update(camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return {
    scene,
    camera,
    get active() {
      return active;
    },
    enter: (id: string) => enter(id),
    journey: (id: string) => enter(id, graph.criticalPath(id).slice().reverse()),
    exit,
    next,
    update,
    /** For tests: where you are and what is drawn. */
    get state() {
      return {
        chamber: star?.chamber.id ?? null,
        drawn: star?.drawnChambers() ?? [],
        inTunnel: walker?.passage?.tunnel.id ?? null,
        guided: !!guided,
        journey: journey ? { path: journey.path, at: journey.at } : null,
      };
    },
    /** For tests: face a heading (the descriptor's yaw convention) and pitch. */
    face(h: number, p = 0) {
      yaw = h + Math.PI;
      pitch = p;
    },
    /** For tests: the headset state. */
    get xr() {
      return { active: !!xrSession, yaw, vignette: vignette.visible ? ((vignette.material as THREE.ShaderMaterial).uniforms.uOpacity!.value as number) : 0, target: target.visible };
    },
    /** For tests: the current chamber's doorways. */
    doors: () => (star ? star.chamber.portals.map((x) => ({ yaw: x.yaw, target: x.target, dir: x.dir, pos: x.pos })) : []),
    /** For tests: the floor point you stand on, in the current chamber's frame. */
    where: () => (walker ? walker.floor().pos.toArray() : null),
    /** For tests: one step forward along the tunnel you are in (as W does when facing down it). */
    stepAlong(d: number) {
      if (!walker?.passage) return;
      const p = walker.passage;
      const i = Math.max(1, p.s.findIndex((v) => v >= walker!.s));
      const a = p.path[i - 1] as THREE.Vector3;
      const b = p.path[Math.min(i, p.path.length - 1)] as THREE.Vector3;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const reached = walker.move(((b.x - a.x) / len) * d, ((b.z - a.z) / len) * d);
      if (reached) arrive(reached, walker.floor().pos);
    },
    /** For tests: walk (desktop keys do the same). */
    walk(dx: number, dz: number) {
      if (!walker) return;
      const reached = walker.move(dx, dz);
      if (reached) arrive(reached, walker.floor().pos);
    },
  };
}

export type Inside = ReturnType<typeof createInside>;
