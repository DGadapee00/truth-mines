import * as THREE from 'three';
import { createPanel, PANEL_M } from './panel.js';

/**
 * Headset mode (WebXR): the mine as a model on a table in front of you, with the card as a panel
 * floating beside it.
 *
 * The mine's group is scaled and placed so that its centre c (mine units) lands at a room point p0
 * (metres), turned by θ about the vertical:
 *   room = R(θ)·k·mine + t,   t = p0 − R(θ)·k·c
 * Grabbing moves p0, the thumbstick changes θ and k; the mine stays centred where you put it.
 * The camera is the headset, so nothing else moves. On the way out the group goes back to identity.
 *
 * Controllers: trigger (or a pinch) picks a crystal or presses a panel button. Grip grabs the mine.
 * Thumbstick: left-right turns, up-down zooms. B or Y brings the mine and panel back in front of you.
 */
const Y = new THREE.Vector3(0, 1, 0);
const K0 = 0.025; // metres per mine unit: the mine about 1 m across

export function createXR({ renderer, scene, camera, controls, mine, app, fog }) {
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  const world = mine.group;
  const box = new THREE.Box3();
  for (const h of mine.hits) box.expandByPoint(h.position);
  const centre = box.getCenter(new THREE.Vector3());

  const view = { k: K0, theta: 0, p0: new THREE.Vector3(0, 1, -0.9) };
  const panel = createPanel(app);
  const rig = new THREE.Group(); // room-space things: controllers, panel, cursor
  rig.add(panel.mesh);

  let session = null;
  let place = false;
  let saved = null;

  // ---- controllers
  const raycaster = new THREE.Raycaster();
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const cursor = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  cursor.visible = false;
  rig.add(cursor);

  const hands = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    line.scale.z = 1.5;
    c.add(line);
    const h = { c, line, source: null, grab: null, pressed: [], aim: null };
    c.addEventListener('connected', (e) => (h.source = e.data));
    c.addEventListener('disconnected', () => (h.source = null));
    c.addEventListener('selectstart', () => press(h));
    c.addEventListener('squeezestart', () => (h.grab = { from: c.position.clone(), p0: view.p0.clone() }));
    c.addEventListener('squeezeend', () => (h.grab = null));
    rig.add(c);
    return h;
  });

  function rayFrom(c) {
    c.updateMatrixWorld();
    raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).transformDirection(c.matrixWorld);
    return raycaster;
  }

  /** What a controller points at: a panel button, a crystal, or nothing. */
  function aimOf(h) {
    const r = rayFrom(h.c);
    const p = r.intersectObject(panel.mesh, false)[0];
    if (p) return { kind: 'panel', action: panel.hit(p.uv), point: p.point, dist: p.distance };
    const id = mine.pick(r);
    if (id) {
      const at = new THREE.Vector3();
      world.localToWorld(at.copy(mine.positionOf(id)));
      return { kind: 'crystal', id, point: at, dist: at.distanceTo(r.ray.origin) };
    }
    return null;
  }

  function press(h) {
    const aim = aimOf(h);
    if (!aim) return;
    if (aim.kind === 'crystal') return app.select(aim.id);
    const a = aim.action;
    if (!a) return;
    if (a.startsWith('pick:')) app.pick(Number(a.slice(5)));
    else if (a.startsWith('go:')) app.select(a.slice(3));
    else if (a === 'mine') app.startRun();
    else if (a === 'next') app.next();
    else if (a === 'leave') app.leaveRun();
    else if (a === 'close') app.select(null);
  }

  // ---- placing the mine and the panel
  function applyView() {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, view.theta);
    world.quaternion.copy(q);
    world.scale.setScalar(view.k);
    world.position.copy(view.p0).sub(centre.clone().multiplyScalar(view.k).applyQuaternion(q));
    if (fog) fog.density = saved.fog / view.k;
  }

  /** The mine 0.9 m ahead at table height, its front toward you; the panel at your left hand. */
  function placeFrom(xrFrame) {
    const pose = xrFrame?.getViewerPose(renderer.xr.getReferenceSpace());
    if (!pose) return false;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    const head = new THREE.Vector3(p.x, p.y, p.z);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const left = new THREE.Vector3(f.z, 0, -f.x);
    view.p0.copy(head).addScaledVector(f, 0.9);
    view.p0.y = Math.max(0.6, head.y - 0.45);
    view.theta = Math.atan2(f.x, f.z) - Math.PI;
    view.k = K0;
    const at = head.clone().addScaledVector(f, 0.6).addScaledVector(left, 0.55);
    at.y = head.y - 0.12;
    panel.mesh.position.copy(at);
    panel.mesh.rotation.set(0, Math.atan2(head.x - at.x, head.z - at.z), 0);
    return true;
  }

  // ---- entering and leaving
  async function enter(kind) {
    if (session) return;
    const s = await navigator.xr.requestSession(kind === 'ar' ? 'immersive-ar' : 'immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    });
    saved = {
      bg: scene.background,
      fog: fog?.density ?? 0,
      clear: renderer.getClearAlpha(),
      cam: { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, zoom: camera.zoom },
    };
    session = s;
    s.addEventListener('end', leave);
    if (kind === 'ar') {
      scene.background = null;
      renderer.setClearAlpha(0);
    }
    scene.add(rig);
    document.body.classList.add('xr-on');
    place = true;
    panel.draw();
    await renderer.xr.setSession(s);
  }

  function leave() {
    if (!session) return;
    session = null;
    scene.remove(rig);
    world.position.set(0, 0, 0);
    world.quaternion.identity();
    world.scale.setScalar(1);
    scene.background = saved.bg;
    if (fog) fog.density = saved.fog;
    renderer.setClearAlpha(saved.clear);
    camera.position.copy(saved.cam.pos);
    camera.quaternion.copy(saved.cam.quat);
    camera.fov = saved.cam.fov;
    camera.zoom = saved.cam.zoom;
    camera.updateProjectionMatrix();
    document.body.classList.remove('xr-on');
    // After three.js has finished its own teardown, so the canvas can be resized again.
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      controls.update();
    }, 0);
  }

  app.onChange(() => session && panel.draw());

  // ---- each frame
  function update(dt, xrFrame) {
    if (!session) return;
    if (place && placeFrom(xrFrame)) place = false;
    let hoverAction = null;
    let cursorAt = null;
    for (const h of hands) {
      const gp = h.source?.gamepad;
      if (gp) {
        const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
        if (Math.abs(ax[0]) > 0.15) view.theta += ax[0] * dt * 1.5;
        if (Math.abs(ax[1]) > 0.15) view.k = Math.min(0.5, Math.max(0.006, view.k * Math.exp(-ax[1] * dt * 1.3)));
        const now = !!gp.buttons[5]?.pressed;
        if (now && !h.pressed[5]) place = true;
        h.pressed[5] = now;
      }
      if (h.grab) view.p0.copy(h.grab.p0).add(h.c.position).sub(h.grab.from);
      if (h.source) {
        const aim = aimOf(h);
        h.line.scale.z = aim ? Math.min(3, aim.dist) : 1.5;
        if (aim?.kind === 'panel') {
          hoverAction = hoverAction || aim.action;
          cursorAt = cursorAt || aim.point;
        }
      }
    }
    panel.setHover(hoverAction);
    cursor.visible = !!cursorAt;
    if (cursorAt) cursor.position.copy(cursorAt);
    applyView();
  }

  // ---- the buttons on the page
  const btnVR = document.getElementById('btn-vr');
  const btnAR = document.getElementById('btn-ar');
  const fail = (err) => {
    console.warn('Truth Mines: could not start the headset view', err);
    leave();
  };
  btnVR?.addEventListener('click', () => enter('vr').catch(fail));
  btnAR?.addEventListener('click', () => enter('ar').catch(fail));
  navigator.xr?.isSessionSupported?.('immersive-vr').then((ok) => btnVR && (btnVR.hidden = !ok), () => {});
  navigator.xr?.isSessionSupported?.('immersive-ar').then((ok) => btnAR && (btnAR.hidden = !ok), () => {});

  return {
    get active() {
      return !!session;
    },
    update,
    enter,
    exit: () => session?.end(),
    panel,
    /** For scripts/xr-check: where the mine sits in the room. */
    get view() {
      return { p0: view.p0.toArray(), k: view.k, theta: view.theta, panel: panel.mesh.position.toArray() };
    },
  };
}

export { PANEL_M };
