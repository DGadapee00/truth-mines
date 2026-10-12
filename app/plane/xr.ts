import * as THREE from 'three';
import type { PlaneWalk } from './walk';

/**
 * The plane in a headset (WebXR). Comfort follows CLAUDE.md rule 6: nothing moves you unless you
 * asked. Teleport is instant, turning is a 30-degree snap, and travelling to the next stop (button
 * A) is a guided move with an ease in and out and a vignette that never turns your view. The
 * trigger strikes the plaza column you point at, or teleports you to the floor you point at.
 */
export interface XRContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  rig: THREE.Group;
  scene: THREE.Scene;
  eye: number;
  walk(): PlaneWalk;
  isPlaneActive(): boolean;
  getHeading(): number;
  setHeading(h: number): void;
  /** What the student is looking at, and what it is */
  focusKind(): 'road' | 'plaza' | null;
  strikeFocused(): void;
  startTravel(id: string): void;
  nextStop(): string;
  travelling(): boolean;
  /** 0..1 through a guided move, or null */
  travelK(): number | null;
  setRay(fn: (() => { o: THREE.Vector3; d: THREE.Vector3 } | null) | null): void;
  onXR(end: () => void, isActive: () => boolean, info: () => XRInfo): void;
}

export interface XRInfo {
  active: boolean;
  heading: number;
  vignette: number;
  target: boolean;
  aim: 'column' | 'floor' | null;
}

interface Hand {
  c: THREE.Group;
  line: THREE.Line;
  source: XRInputSource | null;
  aiming: boolean;
  turnArmed: boolean;
  pressed: boolean[];
}

export function attachXR(x: XRContext) {
  const { renderer: r, camera, rig, scene } = x;
  let session: XRSession | null = null;
  let hands: Hand[] = [];
  let aim: 'column' | 'floor' | null = null;
  let aimPoint: THREE.Vector3 | null = null;

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
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 998;
  ring.visible = false;
  scene.add(ring);

  const handRay = (h: Hand) => {
    h.c.updateMatrixWorld();
    return { o: new THREE.Vector3().setFromMatrixPosition(h.c.matrixWorld), d: new THREE.Vector3(0, 0, -1).transformDirection(h.c.matrixWorld) };
  };
  /** The ray that points: the hand holding the trigger, else the right hand, else any that is connected. */
  const activeHand = () => hands.find((h) => h.aiming && h.source) ?? hands.find((h) => h.source?.handedness === 'right') ?? hands.find((h) => h.source) ?? null;

  function teleport() {
    if (x.focusKind() === 'plaza') {
      x.strikeFocused();
      return;
    }
    if (aim === 'floor' && aimPoint && !x.travelling()) x.walk().place(aimPoint.x, aimPoint.z);
  }

  async function enter() {
    if (session || !x.isPlaneActive() || !navigator.xr) return;
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    session = s;
    if (document.pointerLockElement) document.exitPointerLock();
    camera.position.set(0, 0, 0);
    hands = [0, 1].map((i) => {
      const c = r.xr.getController(i);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
      line.scale.z = 8;
      c.add(line);
      const h: Hand = { c, line, source: null, aiming: false, turnArmed: true, pressed: [] };
      c.addEventListener('connected', (e) => (h.source = (e as unknown as { data: XRInputSource }).data));
      c.addEventListener('disconnected', () => (h.source = null));
      c.addEventListener('selectstart', () => (h.aiming = true));
      c.addEventListener('selectend', () => {
        // The pointing is read this frame, so a release acts on what the ray is on right now.
        h.aiming = true;
        update();
        h.aiming = false;
        teleport();
      });
      rig.add(c);
      return h;
    });
    x.setRay(() => {
      const h = activeHand();
      return h ? handRay(h) : null;
    });
    s.addEventListener('end', () => {
      for (const h of hands) rig.remove(h.c);
      hands = [];
      session = null;
      aim = null;
      ring.visible = false;
      vignette.visible = false;
      x.setRay(null);
      camera.position.set(0, x.eye, 0);
      window.dispatchEvent(new Event('resize'));
    });
    await r.xr.setSession(s);
  }

  /** Per frame: the aim ring, the snap turn, the buttons, the vignette. */
  function update() {
    if (!session) {
      aim = null;
      return;
    }
    const h = activeHand();
    for (const hand of hands) {
      const gp = hand.source?.gamepad;
      if (!gp) continue;
      // Snap turn: one 30-degree step per flick of the thumbstick.
      const sx = gp.axes.length >= 4 ? (gp.axes[2] ?? 0) : (gp.axes[0] ?? 0);
      if (hand.turnArmed && Math.abs(sx) > 0.7) {
        x.setHeading(x.getHeading() - Math.sign(sx) * (Math.PI / 6));
        hand.turnArmed = false;
      } else if (Math.abs(sx) < 0.3) hand.turnArmed = true;
      const press = (i: number) => {
        const now = !!gp.buttons[i]?.pressed;
        const was = !!hand.pressed[i];
        hand.pressed[i] = now;
        return now && !was;
      };
      if (press(4) && !x.travelling()) x.startTravel(x.nextStop());
      if (press(5)) session.end();
    }
    aim = null;
    aimPoint = null;
    if (h && !x.travelling()) {
      if (x.focusKind() === 'plaza') aim = 'column';
      else {
        const { o, d } = handRay(h);
        if (d.y < -1e-3) {
          const t = -o.y / d.y;
          const hit = o.clone().addScaledVector(d, t);
          if (t > 0 && t < 40 && x.walk().free(hit.x, hit.z)) {
            aim = 'floor';
            aimPoint = hit;
          }
        }
      }
    }
    ring.visible = aim === 'floor' && !!aimPoint;
    if (aimPoint) ring.position.copy(aimPoint).setY(0.02);
    const k = x.travelK();
    if (k === null) vignette.visible = false;
    else {
      vignette.visible = true;
      (vignette.material as THREE.ShaderMaterial).uniforms.uOpacity!.value = 0.9 * Math.min(1, k * 4, (1 - k) * 4);
    }
  }

  const btn = document.getElementById('pl-vr') as HTMLButtonElement;
  btn.addEventListener('click', () => enter().catch((e: unknown) => console.warn('Truth Mines: could not start the headset', e)));
  navigator.xr?.isSessionSupported?.('immersive-vr').then((ok) => (btn.hidden = !ok), () => {});

  x.onXR(
    () => session?.end(),
    () => !!session,
    () => ({
      active: !!session,
      heading: x.getHeading(),
      vignette: vignette.visible ? ((vignette.material as THREE.ShaderMaterial).uniforms.uOpacity!.value as number) : 0,
      target: ring.visible,
      aim,
    }),
  );
  return { update };
}
