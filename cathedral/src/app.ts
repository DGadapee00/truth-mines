import {
  Color,
  EnvironmentType,
  FogExp2,
  Frustum,
  HemisphereLight,
  LocomotionEnvironment,
  LocomotionSystem,
  Matrix4,
  PointLight,
  Raycaster,
  SlideSystem,
  TurningMethod,
  Vector2,
  Vector3,
  VisibilityState,
  type Entity,
  type World,
} from '@iwsdk/core';
import { doorStates, type DoorState } from '../../core/doors';
import { createDoing, type DoingKind } from '../../core/doing';
import { validResume } from '../../core/progress';
import { parseCathedral, parseGraph, parsePathways, parsePlane, type CathedralDoor, type CathedralFile, type GraphFile, type PathwaysFile, type PlaneFile } from '../../core/schema';
import { approveForTest, doors, hints, places, type Line } from './copy';
import { DesktopInput } from './input-desktop';
import { createActivity, type Activity } from './lib/activity';
import { DEFAULT_WORKER_URL } from './lib/config';
import { doorLook } from './lib/door-look';
import { createFlow, type Flow, type Phase } from './lib/flow';
import { buildPlan, newMotion, poseAt, stepMotion, type MotionPlan, type Motion } from './lib/motion';
import { pickDoor } from './lib/pick-door';
import { BrowserMic, createPushToTalk, type PttError } from './lib/ptt';
import { createProgressStore, workerProgressApi, type ProgressApi, type ProgressStore } from './lib/progress-store';
import { openStt } from './lib/stt-client';
import { createDeviceStore, type DeviceStore } from './lib/storage';
import { askTrurl } from './lib/trurl-client';
import { createTrurlSession, type TrurlContext, type TrurlSession } from './lib/trurl-session';
import { Ui } from './ui/dom';
import { XrInput, type XrFrame } from './xr-input';
import { XrPanel } from './xr-ui';
import { Comfort } from './world/comfort';
import { buildHall, type Hall } from './world/hall';
import { NumberTheoryPlane, EYE, type Place } from './world/plane-nt';
import { Previews } from './world/previews';
import { PALETTE } from './world/palette';
import { Ribbon } from './world/ribbon';
import { buildThreshold } from './world/threshold';
import { buildVault } from './world/vault';

/** Comfort policy (CLAUDE.md rule 6): teleport and a 30 degree snap turn in a headset; no smooth movement of any kind. */
export const COMFORT_POLICY = { turningMethod: TurningMethod.SnapTurn, turningAngle: 30, slidingSpeed: 0, enableJumping: false } as const;

const WALK_SPEED = 3.2;
const SAVE_EVERY_S = 4;

type Transition = { to: 'plane' | 'cathedral'; door: CathedralDoor; stage: 'out' | 'in' } | { to: 'dais'; stage: 'out' | 'in' } | null;

export class CathedralApp {
  readonly flow: Flow;
  readonly device: DeviceStore = createDeviceStore();
  readonly store: ProgressStore;
  readonly trurl: TrurlSession;
  readonly ui: Ui;
  private readonly desktop: DesktopInput;
  private readonly comfort: Comfort;
  private readonly hall: Hall;
  private readonly previews: Previews;
  private readonly ribbon = new Ribbon();
  private readonly thresholdGroup;
  private readonly vault;
  private readonly plane: NumberTheoryPlane;
  /** What the visitor has done since this page was opened; never saved */
  private readonly doing = createDoing();
  private readonly activity: Activity;
  private readonly asked = new Set<DoingKind>();
  private readonly planeGroupEntity: Entity;
  private readonly planeGroundEntity: Entity;
  private readonly plan: MotionPlan;
  private readonly motion: Motion = newMotion();
  private readonly mic = new BrowserMic();
  private readonly ptt;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly origin = new Vector3();
  private readonly dir = new Vector3();
  private readonly o3: [number, number, number] = [0, 0, 0];
  private readonly d3: [number, number, number] = [0, 0, 0];
  private readonly pose: [number, number, number] = [0, 0, 0];
  private hudClock = 0;
  private xrClock = 0;
  private readonly xrInput: XrInput;
  private xrRay: XrFrame['ray'] = null;
  private placeName = '';
  private states: Record<string, DoorState> = {};
  private transition: Transition = null;
  private focusDoor: CathedralDoor | null = null;
  private saveTimer = 0;
  private slideGone = false;
  private wasImmersive = false;
  private toastUntil = 0;
  private toastLine: Line | null = null;
  private clock = 0;
  private currentDoor: CathedralDoor | null = null;
  private lastZone = 'road';

  private constructor(
    private readonly world: World,
    readonly cathedral: CathedralFile,
    readonly pathways: PathwaysFile,
    readonly graph: GraphFile,
    planeData: PlaneFile,
    private readonly xrPanel: XrPanel | null,
  ) {
    this.xrInput = new XrInput(world);
    const scene = world.scene;
    scene.background = new Color(PALETTE.night);
    scene.fog = new FogExp2(PALETTE.night, 0.004);

    this.store = createProgressStore({ device: this.device, api: this.makeApi(), now: () => new Date().toISOString() });
    this.flow = createFlow({ returning: this.device.thresholdSeen.get() });
    this.states = doorStates(this.store.get().earned, cathedral, pathways, graph);

    // The world, from the descriptors
    this.hall = buildHall(cathedral, this.states);
    this.previews = new Previews(cathedral, planeData);
    this.previews.setStates(this.states);
    this.thresholdGroup = buildThreshold(cathedral);
    this.plane = new NumberTheoryPlane(planeData);
    this.plane.group.visible = false;
    this.plane.ground.visible = false;
    this.activity = createActivity({
      doing: this.doing,
      plane: {
        standing: () => this.plane.plaza.state().standing,
        struck: () => this.plane.plaza.state().struck,
        strike: (n) => void this.plane.strike(n),
        reveal: (n) => this.plane.reveal(n),
        isRevealed: (n) => this.plane.isRevealed(n),
        labelOf: (n) => this.plane.column(n).label,
      },
      zone: () => this.lastZone as 'road' | 'plaza' | 'overlook',
      looking: () => (this.plane.focused?.kind === 'road' ? this.plane.focused.n : null),
      say: (l) => this.sayLine(l),
      onDone: (kind) => this.doingDone(kind),
    });
    this.syncVeil();
    this.plan = buildPlan(cathedral.threshold);

    world.createTransformEntity(this.hall.group);
    const floor = world.createTransformEntity(this.hall.floor);
    floor.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
    this.vault = buildVault(cathedral);
    world.createTransformEntity(this.vault);
    world.createTransformEntity(this.thresholdGroup);
    world.createTransformEntity(this.previews.group);
    world.createTransformEntity(this.ribbon.group);
    this.planeGroupEntity = world.createTransformEntity(this.plane.group);
    this.planeGroundEntity = world.createTransformEntity(this.plane.ground);
    const sky = new HemisphereLight(PALETTE.starlight, 0x120c20, 1.1);
    const glow = new PointLight(PALETTE.gold, 60, 40, 1.6);
    glow.position.set(0, 9, 0);
    world.createTransformEntity(sky);
    world.createTransformEntity(glow);

    this.comfort = new Comfort(world.camera);

    this.ptt = createPushToTalk({
      mic: this.mic,
      open: (onInterim) => openStt({ ...this.creds(), onInterim }),
      onInterim: (t) => this.ui.setSayInterim(t),
      onTranscript: (t) => {
        this.ui.setSayInterim('');
        this.utter(t);
      },
      onError: (k) => this.pttError(k),
      now: () => performance.now(),
      minHoldMs: 250,
    });

    this.trurl = createTrurlSession({
      ask: (req, signal) => askTrurl(this.creds(), req, signal),
      context: () => this.trurlContext(),
      earned: () => this.store.get().earned,
      doing: () => this.doing.facts(),
      allowed: (ids) => this.allowedEarned(ids),
      onEarned: (ids) => this.store.earn(ids),
      enabled: () => this.hasCreds(),
    });

    this.ui = new Ui(
      document.body,
      {
        onSaveCredentials: (w, s) => this.saveCredentials(w, s),
        onContinueWithout: () => this.flow.send('continue'),
        onBegin: () => this.begin(),
        onEnterVR: () => void this.enterVR(),
        onSkip: () => this.skip(),
        onSay: (t) => this.utter(t),
        onTalkStart: () => this.talk(true),
        onTalkEnd: () => this.talk(false),
        onLeavePlane: () => this.leavePlane(),
        onStop: (id) => this.goToStop(id),
        onResetSieve: () => {
          this.plane.plaza.reset();
          this.doing.resetSieve();
        },
        onForget: () => this.forget(),
      },
      { workerUrl: this.device.workerUrl.get() ?? DEFAULT_WORKER_URL },
    );

    const canvas = world.renderer.domElement;
    this.desktop = new DesktopInput(
      canvas,
      {
        onClick: (ndc) => this.click(ndc),
        onKey: (code) => this.key(code),
        onTalk: (down) => this.talk(down),
      },
      () => !this.xr(),
    );

    this.trurl.subscribe((s) => {
      this.ui.setCaptions(s);
      this.ribbon.mood = s.status;
    });
    this.store.subscribe(() => this.progressChanged());
    this.flow.subscribe((p) => this.phaseChanged(p));
    world.visibilityState.subscribe(() => this.sessionChanged());
    window.addEventListener('pagehide', () => this.saveResume());
    window.addEventListener('online', () => void this.store.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.ptt.cancel();
        this.saveResume();
      }
    });

    this.ui.setSync(this.store.syncStatus());
    this.ui.setCaptions(this.trurl.state());
    this.start();
  }

  static async create(world: World): Promise<CathedralApp> {
    const get = async (name: string): Promise<unknown> => {
      const res = await fetch(new URL(`data/${name}`, document.baseURI));
      if (!res.ok) throw new Error(`${name}: ${res.status}`);
      return res.json();
    };
    const [c, p, g, pl] = await Promise.all([get('cathedral.json'), get('pathways.json'), get('graph.json'), get('plane-number-theory.json')]);
    // The headset panel needs UIKit's fonts; if it cannot load, the desktop app and the rest of the world still run.
    const panel = await XrPanel.create(world).catch((e: unknown) => {
      console.warn('the headset panel could not load', e);
      return null;
    });
    return new CathedralApp(world, parseCathedral(c), parsePathways(p), parseGraph(g), parsePlane(pl), panel);
  }

  // ---------------------------------------------------------------- credentials

  private creds() {
    return { workerUrl: this.device.workerUrl.get() ?? DEFAULT_WORKER_URL, secret: this.device.secret.get() ?? '' };
  }

  private hasCreds(): boolean {
    const c = this.creds();
    return !!c.workerUrl && !!c.secret;
  }

  private makeApi(): ProgressApi | null {
    if (!this.hasCreds()) return null;
    const cfg = this.creds();
    return workerProgressApi(cfg);
  }

  private saveCredentials(worker: string, secret: string): void {
    if (worker) this.device.workerUrl.set(worker);
    if (secret) this.device.secret.set(secret);
    this.credentialsChanged();
    if (this.flow.phase() === 'gate') this.flow.send('continue');
  }

  private forget(): void {
    this.device.forget();
    this.ui.setWorkerUrl(DEFAULT_WORKER_URL);
    this.credentialsChanged();
  }

  private credentialsChanged(): void {
    this.store.setApi(this.makeApi());
    this.trurl.reset();
    this.ui.setSync(this.store.syncStatus());
    this.ui.setCaptions(this.trurl.state());
    this.ui.setWorkerUrl(this.device.workerUrl.get() ?? DEFAULT_WORKER_URL);
    void this.store.sync().then(() => this.ui.setSync(this.store.syncStatus()));
  }

  // ---------------------------------------------------------------- lifecycle

  private start(): void {
    this.setView(this.cathedral.threshold.path[0] as [number, number, number], 0, 0);
    this.thresholdGroup.visible = true;
    if (this.hasCreds()) {
      this.flow.send('continue');
      void this.store.sync().then(() => this.ui.setSync(this.store.syncStatus()));
    } else this.ui.showGate();
  }

  private xr(): boolean {
    return this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
  }

  private async enterVR(): Promise<void> {
    void this.mic.prepare(); // ask for the microphone now, on a click, rather than mid-session
    this.world.launchXR();
  }

  private sessionChanged(): void {
    const immersive = this.xr();
    if (this.wasImmersive && !immersive) {
      // The headset left (its own menu, or taken off) wherever the visitor was: keep their place in a
      // plane and put the hall back, so the next crossing arrives in a whole cathedral.
      if (this.flow.phase() === 'plane') {
        this.saveResume();
        this.showHall();
      }
      this.transition = null;
      this.comfort.setFade(0);
      this.flow.send('session-ended');
    }
    if (immersive && !this.wasImmersive) {
      this.eye(this.tmp);
      this.xrPanel?.snap(this.tmp, this.viewYaw());
    }
    this.wasImmersive = immersive;
  }

  private begin(): void {
    void this.mic.prepare();
    this.flow.send('begin');
  }

  private skip(): void {
    if (!this.flow.canSkip() || this.transition) return;
    this.transition = { to: 'dais', stage: 'out' };
    this.comfort.setFade(1);
  }

  private phaseChanged(phase: Phase): void {
    const returning = this.device.thresholdSeen.get();
    switch (phase) {
      case 'gate':
        this.ui.showGate();
        break;
      case 'ready':
        this.thresholdGroup.visible = true;
        this.setView(this.cathedral.threshold.path[0] as [number, number, number], 0, 0);
        this.placeName = 'The Truth Mines';
        this.ui.showReady({ vr: this.vrAvailable(), returning });
        break;
      case 'threshold':
        this.motion.s = 0;
        this.motion.v = 0;
        this.motion.done = false;
        this.ui.showHud();
        this.placeName = 'The threshold';
        this.ui.setPlace('The threshold', places.threshold());
        break;
      case 'cathedral':
        this.thresholdGroup.visible = false;
        this.comfort.setVignette(0);
        this.ui.showHud();
        this.ui.showPlane(false);
        this.ui.setSkip(false);
        this.placeName = 'The cathedral';
        this.ui.setPlace('The cathedral', places.cathedral());
        break;
      case 'plane':
        this.ui.showPlane(true, this.plane.data.stops.map((s) => ({ id: s.id, name: s.name })));
        break;
    }
  }

  private vrAvailable(): boolean {
    return this.world.xrEnabled;
  }

  // ---------------------------------------------------------------- the player

  /** The visitor's feet go here and they face `heading` (descriptor yaw). */
  private setView(pos: readonly [number, number, number], heading: number, pitch: number): void {
    this.desktop.heading = heading;
    this.desktop.pitch = pitch;
    this.place(pos[0], pos[1], pos[2]);
  }

  private place(x: number, y: number, z: number): void {
    this.tmp.set(x, y, z);
    const loco = this.world.getSystem(LocomotionSystem);
    if (loco) loco.setPlayerPosition(this.tmp);
    else this.world.player.position.copy(this.tmp);
  }

  private feet(out: Vector3): Vector3 {
    return out.copy(this.world.player.position);
  }

  private eye(out: Vector3): Vector3 {
    return this.world.camera.getWorldPosition(out);
  }

  /** The way the visitor looks, as a descriptor yaw, from the camera itself (so a headset turn counts) */
  private viewYaw(): number {
    const d = this.world.camera.getWorldDirection(this.tmp2);
    return Math.atan2(d.x, d.z);
  }

  // ---------------------------------------------------------------- input

  private click(ndc: { x: number; y: number }): void {
    this.ray.setFromCamera(this.ndc.set(ndc.x, ndc.y), this.world.camera);
    this.activateAt(this.ray.ray.origin, this.ray.ray.direction);
  }

  /** Act on what a ray (the mouse, the view or a controller) points at */
  activateAt(origin: Vector3, dir: Vector3): void {
    const phase = this.flow.phase();
    if (this.transition) return;
    if (phase === 'cathedral') {
      const door = this.doorAt(origin, dir);
      if (door) this.openDoor(door);
    } else if (phase === 'plane') {
      const f = this.plane.pick(origin, dir);
      if (f?.kind === 'plaza') this.activity.name(f.n);
    }
  }

  private key(code: string): void {
    const phase = this.flow.phase();
    if (code === 'KeyT') {
      document.getElementById('say-input')?.focus();
      return;
    }
    if (phase === 'ready' && (code === 'Enter' || code === 'Space')) this.begin();
    else if (phase === 'threshold' && (code === 'Escape' || code === 'Space')) this.skip();
    else if (phase === 'cathedral' && (code === 'Enter' || code === 'KeyE')) this.activateView();
    else if (phase === 'plane') {
      if (code === 'KeyM' || code === 'Escape') this.leavePlane();
      else if (code === 'Enter' || code === 'KeyF') this.activateView();
      else if (code === 'KeyR') this.plane.plaza.reset();
      else if (code.startsWith('Digit')) {
        const s = this.plane.data.stops[Number(code.slice(5)) - 1];
        if (s) this.goToStop(s.id);
      }
    }
  }

  private activateView(): void {
    const cam = this.world.camera;
    cam.getWorldPosition(this.origin);
    cam.getWorldDirection(this.dir);
    this.activateAt(this.origin, this.dir);
  }

  private talk(down: boolean): void {
    if (down) {
      if (this.ptt.state() === 'idle' && this.flow.phase() !== 'gate') this.ptt.start();
      this.ui.setTalking(true);
    } else {
      this.ui.setTalking(false);
      void this.ptt.stop();
    }
  }

  private pttError(kind: PttError): void {
    this.ui.setTalking(false);
    this.notice({ 'no-microphone': 'No microphone here: type to Trurl instead.', unavailable: 'The speech service did not answer. Try again, or type.', unauthorized: 'The speech service does not accept this secret.' }[kind]);
  }

  /** Test lever: show a plain interface message */
  showNotice(text: string): void {
    this.notice(text);
  }

  /** A plain interface message (no microphone, the secret was not accepted): no voice, no mathematics, so not a draft of anything */
  private notice(text: string): void {
    this.sayLine({ id: 'notice', text, draft: false });
  }

  private sayLine(l: Line): void {
    this.toastLine = l;
    this.ui.toast(l.text, l.draft);
    this.toastUntil = this.clock + 4;
  }

  // ---------------------------------------------------------------- what the visitor says: the doing, or Trurl

  /** What was said or typed: an answer to the activity is judged here; anything else is for Trurl. */
  private utter(text: string): void {
    if (this.flow.phase() === 'plane' && this.activity.utter(text)) return;
    void this.trurl.say(text);
  }

  /** The moments of the current stretch, with whether the visitor already holds what each earns */
  private momentOf(kind: DoingKind) {
    const stretch = this.pathways.pathways.find((p) => p.plane === 'number-theory')?.stretches[0];
    return stretch?.moments.find((m) => m.kind === kind);
  }

  private momentOpen(kind: DoingKind): boolean {
    const m = this.momentOf(kind);
    return !!m && !m.earns.every((e) => this.store.get().earned.includes(e));
  }

  /** The doing for a moment is complete: now, and only now, Trurl asks his question */
  private doingDone(kind: DoingKind): void {
    const m = this.momentOf(kind);
    if (!m || this.asked.has(kind) || !this.momentOpen(kind)) return;
    this.asked.add(kind);
    this.trurl.announce(m.question, !m.question_reviewed);
  }

  /** A verdict can grant an idea only if the visitor did the activity behind it in this session. */
  private allowedEarned(ids: string[]): string[] {
    const stretch = this.pathways.pathways.flatMap((p) => p.stretches);
    return ids.filter((id) => stretch.some((s) => s.moments.some((m) => m.earns.includes(id) && this.doing.done(m.kind))));
  }

  /** The road's stacks stay veiled while the idea behind the road is not yet the visitor's */
  private syncVeil(): void {
    if (!this.momentOpen('road')) this.plane.unveil();
  }

  // ---------------------------------------------------------------- doors and planes

  private openDoor(door: CathedralDoor): void {
    if (!doorLook(this.states[door.plane] ?? 'sealed').enterable) {
      this.sayLine(doors.notOpen(door.name));
      return;
    }
    const pathway = this.pathways.pathways.find((p) => p.plane === door.plane);
    if (!pathway || pathway.stretches.length === 0) {
      this.sayLine(doors.unbuilt(door.name));
      return;
    }
    this.currentDoor = door;
    this.transition = { to: 'plane', door, stage: 'out' };
    this.comfort.setFade(1);
  }

  private enterPlane(door: CathedralDoor): void {
    const pathway = this.pathways.pathways.find((p) => p.plane === door.plane);
    const stretch = pathway?.stretches[0];
    if (!stretch) return;
    this.hall.group.visible = false;
    this.hall.floor.visible = false;
    this.previews.group.visible = false;
    this.vault.visible = false;
    this.plane.group.visible = true;
    this.plane.ground.visible = true;
    this.planeGroundEntity.addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });
    this.world.scene.fog = new FogExp2(0x07090c, 0.003);
    this.plane.plaza.reset();
    const saved = validResume(this.store.get(), this.pathways, door.plane);
    const stop = this.plane.stop('road');
    if (saved) {
      this.plane.walk.place(saved.resume.pos[0], saved.resume.pos[2]);
      this.setView([saved.resume.pos[0], 0, saved.resume.pos[2]], saved.resume.yaw, 0);
    } else {
      this.plane.walk.place(stop.x, stop.z);
      this.setView([stop.x, 0, stop.z], stop.heading, stop.pitch);
    }
    this.flow.send('enter-plane');
    this.placeName = 'The number theory plane';
    this.ui.setPlace('The number theory plane', places.plane());
  }

  private leavePlane(): void {
    if (this.flow.phase() !== 'plane' || this.transition) return;
    this.saveResume();
    const door = this.currentDoor ?? (this.cathedral.doors.find((d) => d.plane === 'number-theory') as CathedralDoor);
    this.transition = { to: 'cathedral', door, stage: 'out' };
    this.comfort.setFade(1);
  }

  private exitPlane(door: CathedralDoor): void {
    this.showHall();
    this.flow.send('leave-plane');
    this.setView(door.stand.pos, door.stand.yaw, 0);
  }

  /** Hide the plane and show the hall again, as it was before the door */
  private showHall(): void {
    this.plane.group.visible = false;
    this.plane.ground.visible = false;
    this.planeGroundEntity.removeComponent(LocomotionEnvironment);
    this.hall.group.visible = true;
    this.hall.floor.visible = true;
    this.previews.group.visible = true;
    this.vault.visible = true;
    this.world.scene.fog = new FogExp2(PALETTE.night, 0.004);
  }

  private goToStop(id: string): void {
    if (this.flow.phase() !== 'plane') return;
    const s = this.plane.stop(id);
    this.plane.walk.place(s.x, s.z);
    this.setView([s.x, 0, s.z], s.heading, s.pitch);
  }

  private saveResume(): void {
    if (this.flow.phase() !== 'plane') return;
    const door = this.currentDoor;
    const stretch = door ? this.pathways.pathways.find((p) => p.plane === door.plane)?.stretches[0] : undefined;
    if (!door || !stretch) return;
    this.store.resume(door.plane, stretch.id, { pos: [this.plane.walk.x, 0, this.plane.walk.z], yaw: this.desktop.heading });
  }

  private progressChanged(): void {
    this.syncVeil();
    this.states = doorStates(this.store.get().earned, this.cathedral, this.pathways, this.graph);
    this.hall.setStates(this.states);
    this.previews.setStates(this.states);
    this.ui.setSync(this.store.syncStatus());
  }

  // ---------------------------------------------------------------- what Trurl is told

  private trurlContext(): TrurlContext {
    if (this.flow.phase() === 'plane' && this.currentDoor) {
      const pathway = this.pathways.pathways.find((p) => p.plane === this.currentDoor?.plane);
      const stretch = pathway?.stretches[0];
      const kind = ({ road: 'road', plaza: 'sieve', overlook: 'overlook' } as const)[this.lastZone as 'road' | 'plaza' | 'overlook'];
      const moment = stretch?.moments.find((m) => m.kind === kind);
      const f = this.plane.focused;
      return {
        plane: this.currentDoor.plane,
        stretch: stretch?.id ?? null,
        moment: moment?.id ?? null,
        landmark: moment?.earns[0] ?? null,
        looking_at: f ? `${f.kind === 'road' ? 'column' : 'plaza'}:${f.n}` : `stop:${this.lastZone}`,
      };
    }
    return { plane: null, stretch: null, moment: null, landmark: null, looking_at: this.focusDoor ? `door:${this.focusDoor.plane}` : null };
  }

  // ---------------------------------------------------------------- each frame

  update(dt: number): void {
    this.clock += dt;
    this.removeSlide();
    const phase = this.flow.phase();
    const cam = this.world.camera;
    const xr = this.xr();

    // The view: on a screen the visitor drags to look; in a headset the headset does it.
    if (!xr) {
      this.world.player.rotation.set(0, this.desktop.heading + Math.PI, 0);
      cam.position.set(0, EYE, 0);
      cam.rotation.set(this.desktop.pitch, 0, 0);
    }

    if (phase === 'gate' || phase === 'ready') {
      // Waiting at the mouth of the tunnel: the locomotor's gravity would drop the visitor, so hold them there.
      const s = this.cathedral.threshold.path[0] as [number, number, number];
      this.place(s[0], s[1], s[2]);
    } else if (phase === 'threshold') this.updateThreshold(dt);
    else if (phase === 'cathedral') this.updateCathedral(dt);
    else if (phase === 'plane') this.updatePlane(dt);

    if (xr) this.updateXr(dt);
    this.updateTransition();
    this.comfort.update(dt, this.cathedral.threshold.ease_s);

    this.eye(this.tmp);
    this.ribbon.update(dt, this.tmp, this.viewYaw() - Math.PI);
    this.previews.update(dt);
    if (this.toastUntil && this.clock > this.toastUntil) {
      this.toastUntil = 0;
      this.ui.toast(null);
    }
    this.ui.setSkip(this.flow.canSkip() && !this.transition);
  }

  /** The headset: controller buttons act on what the ray points at, and the panel carries the words. */
  private updateXr(dt: number): void {
    const f = this.xrInput.poll();
    this.xrRay = f.ray;
    const phase = this.flow.phase();
    if (f.talkDown) this.talk(true);
    if (f.talkUp) this.talk(false);
    if (f.trigger) {
      if (phase === 'ready') this.begin();
      else if (phase === 'threshold') this.skip();
      else if ((phase === 'cathedral' || phase === 'plane') && f.ray) this.activateAt(f.ray.origin, f.ray.dir);
    }
    if (f.back && phase === 'plane') this.leavePlane();
    const panel = this.xrPanel;
    if (!panel) return;
    panel.setVisible(true);
    this.eye(this.tmp);
    panel.follow(dt, this.tmp, this.viewYaw());
    this.xrClock += dt;
    if (this.xrClock < 0.1) return;
    this.xrClock = 0;
    const t = this.trurl.state();
    const hint = this.xrHint(phase);
    const toast = this.clock < this.toastUntil ? this.toastLine : null;
    const caption = t.caption || (t.status === 'thinking' ? '...' : toast?.text || (t.hint ?? ''));
    const captionDraft = t.caption ? t.draft : !!toast?.draft || (!!t.hint && !toast);
    panel.setText({ place: this.placeName, caption, hint: hint.text, draft: hint.draft || (caption !== '' && caption !== '...' && captionDraft) });
  }

  /** What the panel tells a headset visitor to do here */
  private xrHint(phase: Phase): Line {
    if (phase === 'ready') return hints.ready();
    if (phase === 'threshold') return this.flow.canSkip() ? hints.skip() : hints.look();
    if (phase === 'cathedral') return this.focusDoor ? this.doorLine(this.focusDoor) : hints.point();
    if (phase === 'plane') return this.lastZone === 'road' ? hints.road() : this.lastZone === 'plaza' ? hints.plaza() : hints.overlook();
    return hints.talk();
  }

  private updateThreshold(dt: number): void {
    if (this.transition) return;
    stepMotion(this.motion, dt, this.plan);
    const p = poseAt(this.plan, this.motion.s, this.pose);
    this.place(p[0], p[1], p[2]);
    this.comfort.setVignette(this.plan.vignetteAt(this.motion.s));
    if (this.motion.done) {
      this.device.thresholdSeen.set();
      this.flow.send('arrived');
      this.setView(this.cathedral.arrival.pos, this.cathedral.arrival.yaw, 0);
    }
  }

  private updateCathedral(dt: number): void {
    if (!this.xr() && !this.transition) {
      const w = this.desktop.walk();
      if (w.forward || w.right) {
        const h = this.desktop.heading;
        const speed = (w.fast ? 7 : WALK_SPEED) * dt;
        const fx = Math.sin(h);
        const fz = Math.cos(h);
        let nx = this.world.player.position.x + (fx * w.forward - fz * w.right) * speed;
        let nz = this.world.player.position.z + (fz * w.forward + fx * w.right) * speed;
        const limit = this.cathedral.hall.radius - 1.4;
        const r = Math.hypot(nx, nz);
        if (r > limit) {
          nx *= limit / r;
          nz *= limit / r;
        }
        this.place(nx, 0, nz);
      }
    }
    // What is looked at: the mouse in a window, the middle of the view otherwise
    this.viewRay(this.origin, this.dir);
    this.focusDoor = this.transition ? null : this.doorAt(this.origin, this.dir);
    if (!this.xr()) this.ui.setDoorLabel(this.focusDoor ? this.doorLine(this.focusDoor) : null);
  }

  /** The ray the visitor is pointing along: the mouse in a window, the middle of the view otherwise. No allocation. */
  private viewRay(origin: Vector3, dir: Vector3): void {
    if (this.desktop.pointer && !this.xr()) {
      this.ray.setFromCamera(this.ndc.set(this.desktop.pointer.x, this.desktop.pointer.y), this.world.camera);
      origin.copy(this.ray.ray.origin);
      dir.copy(this.ray.ray.direction);
    } else if (this.xr() && this.xrRay) {
      origin.copy(this.xrRay.origin);
      dir.copy(this.xrRay.dir);
    } else {
      this.world.camera.getWorldPosition(origin);
      this.world.camera.getWorldDirection(dir);
    }
  }

  private doorAt(origin: Vector3, dir: Vector3): CathedralDoor | null {
    this.o3[0] = origin.x;
    this.o3[1] = origin.y;
    this.o3[2] = origin.z;
    this.d3[0] = dir.x;
    this.d3[1] = dir.y;
    this.d3[2] = dir.z;
    return pickDoor(this.cathedral.doors, this.cathedral.hall, this.o3, this.d3);
  }

  private doorLine(d: CathedralDoor): Line {
    const state = this.states[d.plane] ?? 'sealed';
    if (state === 'frontier') return doors.open(d.name, this.xr() ? 'Pull the trigger' : 'Click, or press Enter,');
    if (state === 'dim') return doors.dim(d.name);
    return doors.sealed(d.name);
  }

  private updatePlane(dt: number): void {
    const walk = this.plane.walk;
    if (!this.xr() && !this.transition) {
      const w = this.desktop.walk();
      if (w.forward || w.right) {
        const h = this.desktop.heading;
        const speed = (w.fast ? 8 : WALK_SPEED) * dt;
        const fx = Math.sin(h);
        const fz = Math.cos(h);
        walk.move((fx * w.forward - fz * w.right) * speed, (fz * w.forward + fx * w.right) * speed);
        this.place(walk.x, 0, walk.z);
      }
    } else if (this.xr()) {
      // A teleport or a snap turn moved the rig: follow it, so the plane's idea of where we stand is true.
      const p = this.world.player.position;
      walk.place(p.x, p.z);
    }
    this.viewRay(this.origin, this.dir);
    this.eye(this.tmp);
    this.plane.setFocus(this.transition ? null : this.plane.pick(this.origin, this.dir), this.tmp);
    this.plane.update(dt, this.tmp);
    const zone = this.plane.zoneOf(walk.x, walk.z);
    this.lastZone = zone;
    this.hudClock += dt;
    if (!this.xr() && this.hudClock > 0.1) {
      this.hudClock = 0;
      this.planeHud(zone);
    }
    this.saveTimer += dt;
    if (this.saveTimer > SAVE_EVERY_S) {
      this.saveTimer = 0;
      this.saveResume();
    }
  }

  private planeHud(zone: string): void {
    const d = this.plane.data;
    const walk = this.plane.walk;
    const text = (id: string) => d.texts.find((t) => t.id === id);
    const near = Math.hypot(walk.x - d.road.seed.pos[0], walk.z - d.road.seed.pos[2]) < 14;
    // While a moment is open the lines say what to do, never what is true; the lines that say what is true wait until the idea is the visitor's
    const roadOpen = this.momentOpen('road');
    const sieveOpen = this.momentOpen('sieve');
    const id = zone === 'road' ? (near ? (roadOpen ? 'arrive_open' : 'arrive') : roadOpen ? 'road_open' : 'road') : zone === 'plaza' ? (sieveOpen ? 'plaza_open' : 'plaza') : zone;
    const t = text(id);
    const ps = this.plane.plaza.state();
    const f = this.plane.focused;
    const m = this.plane.marker;
    const note = !sieveOpen && ps.done ? text('sieve_note') : undefined;
    this.ui.setPlane({
      name: zone === 'road' ? 'The road of integers' : (d.stops.find((s) => s.id === zone)?.name ?? zone),
      text: t?.text ?? '',
      draft: !!t && !t.reviewed,
      focus: f?.kind === 'road' ? (this.plane.isRevealed(f.n) ? this.plane.column(f.n).label : String(f.n)) : f?.kind === 'plaza' ? `${f.n}: click to name it` : '',
      sieve: zone === 'plaza',
      count: `${ps.standing.length} of ${d.plaza.grid.length} standing`,
      note: note?.text ?? null,
      noteDraft: !!note && !note.reviewed,
      readout: zone === 'overlook' && m ? `x = ${m.x.toLocaleString('en-US')} · π(x) = ${m.pi.toLocaleString('en-US')} · x / ln x ≈ ${Math.round(m.estimate).toLocaleString('en-US')} · ratio ${m.ratio.toFixed(3)}` : null,
      here: zone,
    });
  }

  private updateTransition(): void {
    const tr = this.transition;
    if (!tr || this.comfort.fade < 0.995) {
      if (tr?.stage === 'in' && this.comfort.fade <= 0.005) this.transition = null;
      return;
    }
    if (tr.stage === 'out') {
      if (tr.to === 'plane') this.enterPlane(tr.door);
      else if (tr.to === 'cathedral') this.exitPlane(tr.door);
      else {
        this.thresholdGroup.visible = false;
        this.flow.send('skip');
        this.setView(this.cathedral.arrival.pos, this.cathedral.arrival.yaw, 0);
      }
      this.transition = { ...tr, stage: 'in' } as Transition;
      this.comfort.setFade(0);
    }
  }

  /** Teleport and snap turn only: take the thumbstick slide out as soon as IWSDK has registered it. */
  private removeSlide(): void {
    const loco = this.world.getSystem(LocomotionSystem);
    if (loco) {
      const c = loco.config;
      if (c.slidingSpeed.peek() !== COMFORT_POLICY.slidingSpeed) c.slidingSpeed.value = COMFORT_POLICY.slidingSpeed;
      if (c.enableJumping.peek() !== COMFORT_POLICY.enableJumping) c.enableJumping.value = COMFORT_POLICY.enableJumping;
      if (c.turningMethod.peek() !== COMFORT_POLICY.turningMethod) c.turningMethod.value = COMFORT_POLICY.turningMethod;
      if (c.turningAngle.peek() !== COMFORT_POLICY.turningAngle) c.turningAngle.value = COMFORT_POLICY.turningAngle;
    }
    if (!this.slideGone && this.world.getSystem(SlideSystem)) {
      this.world.unregisterSystem(SlideSystem);
      this.slideGone = true;
    }
  }

  // ---------------------------------------------------------------- for tests

  /** The rig's heading about +Y, read from its quaternion (Euler y flips once a turn passes 90 degrees). */
  private rigHeading(): number {
    const q = this.world.player.quaternion;
    return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
  }

  /** A read-only view of the app and a few levers for the end-to-end tests. */
  debug() {
    const p = this.world.player.position;
    return {
      phase: this.flow.phase(),
      xr: this.xr(),
      rigYaw: this.rigHeading(),
      xrPanel: this.xrPanel?.snapshot() ?? null,
      states: { ...this.states },
      earned: [...this.store.get().earned],
      sync: this.store.syncStatus(),
      pos: [p.x, p.y, p.z] as [number, number, number],
      heading: this.desktop.heading,
      fade: this.comfort.fade,
      thresholdS: this.motion.s,
      thresholdTotal: this.plan.total,
      slideRegistered: !!this.world.getSystem(SlideSystem),
      locomotion: (() => {
        const l = this.world.getSystem(LocomotionSystem);
        return l ? { slidingSpeed: l.config.slidingSpeed.peek(), turningAngle: l.config.turningAngle.peek(), turningMethod: l.config.turningMethod.peek(), enableJumping: l.config.enableJumping.peek() } : null;
      })(),
      transition: this.transition ? { to: this.transition.to, stage: this.transition.stage } : null,
      focusDoor: this.focusDoor?.plane ?? null,
      captions: this.trurl.state(),
      zone: this.lastZone,
      standing: this.flow.phase() === 'plane' ? this.plane.plaza.state().standing.length : null,
      doing: this.doing.facts(),
      doingDone: { road: this.doing.done('road'), sieve: this.doing.done('sieve') },
      focus: this.plane.focused,
      plane: this.flow.phase() === 'plane' ? { x: this.plane.walk.x, z: this.plane.walk.z } : null,
      plazaInView: this.flow.phase() === 'plane' ? this.plazaInView() : null,
      shown: { hall: this.hall.group.visible && this.hall.floor.visible && this.previews.group.visible, vault: this.vault.visible, plane: this.plane.group.visible || this.plane.ground.visible },
    };
  }

  /** Whether the renderer's frustum test keeps the plaza's columns: what three.js decides before drawing them */
  private plazaInView(): boolean {
    const cam = this.world.camera;
    cam.updateMatrixWorld();
    const f = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const mesh = this.plane.plaza.group.getObjectByName('plaza-columns');
    return !!mesh && f.intersectsObject(mesh);
  }

  /** Test lever: face a heading and pitch */
  face(heading: number, pitch = 0): void {
    this.desktop.heading = heading;
    this.desktop.pitch = pitch;
  }

  /** Test lever: stand at a point of the hall */
  stand(x: number, z: number): void {
    this.place(x, 0, z);
  }

  /** Test lever: look at a door from where you stand and press Enter */
  lookAtDoor(plane: string): void {
    const d = this.cathedral.doors.find((x) => x.plane === plane);
    if (!d) return;
    const p = this.world.player.position;
    this.desktop.heading = Math.atan2(d.pos[0] - p.x, d.pos[2] - p.z);
    this.desktop.pitch = 0.08;
  }

  /** Test lever: look at a plaza column from where you stand */
  /** Walk the visitor to a spot beside a road column (three metres to its left), so a ray to it meets nothing nearer */
  standBeside(n: number): void {
    const c = this.plane.column(n);
    const x = c.pos[0] + Math.cos(c.yaw) * 3;
    const z = c.pos[2] - Math.sin(c.yaw) * 3;
    this.plane.walk.place(x, z);
    this.place(x, 0, z);
  }

  /** Walk the visitor into the gap just in front of a plaza column, so a ray to it meets nothing nearer */
  standBesidePlaza(n: number): void {
    const pl = this.plane.data.plaza;
    const cell = pl.grid.find((g) => g.n === n);
    if (!cell) return;
    const x = cell.pos[0] - Math.sin(pl.yaw) * 1.2;
    const z = cell.pos[2] - Math.cos(pl.yaw) * 1.2;
    this.plane.walk.place(x, z);
    this.place(x, 0, z);
  }

  /** Test lever: treat these lines as reviewed by a person, as adding their ids to REVIEWED_LINES would */
  approveLines(...ids: string[]): void {
    approveForTest(...ids);
  }

  /** Act on the plaza column in view, as a click or a trigger pull would */
  activateFocus(): void {
    const f = this.plane.focused;
    if (f?.kind === 'plaza') this.activity.name(f.n);
  }

  /** The colour a road block is drawn in, and whether the column's threads and sign are showing its factors */
  roadBlock(n: number, k: number): string {
    return this.plane.road.blockColour(n, k);
  }

  roadRevealed(n: number): boolean {
    return this.plane.isRevealed(n);
  }

  /** Every line of text a visitor can read at this moment, for the test that nothing says the answer */
  visibleText(): string[] {
    return [...document.querySelectorAll<HTMLElement>('#hud *')].filter((e) => e.childElementCount === 0 && e.offsetParent !== null && !!e.textContent?.trim()).map((e) => e.textContent!.trim());
  }

  lookAtColumn(kind: 'road' | 'plaza', n: number): void {
    const d = this.plane.data;
    const c = kind === 'road' ? this.plane.column(n) : null;
    const cell = kind === 'plaza' ? d.plaza.grid.find((g) => g.n === n) : null;
    const pos = c ? c.pos : cell?.pos;
    if (!pos) return;
    const h = c ? c.height : d.plaza.column.height;
    const dx = pos[0] - this.plane.walk.x;
    const dz = pos[2] - this.plane.walk.z;
    this.desktop.heading = Math.atan2(dx, dz);
    this.desktop.pitch = Math.atan2(h * 0.6 - EYE, Math.hypot(dx, dz));
  }

  /** Test lever: press a key as the visitor would */
  press(code: string): void {
    this.key(code);
  }

  /** Test lever: stand on the plane at a stop */
  planeStop(id: string): void {
    this.goToStop(id);
  }

  strikeInPlane(n: number): number[] | null {
    return this.plane.strike(n);
  }

  /** Place for tests: where the plane says the stop is */
  stopPlace(id: string): Place {
    return this.plane.stop(id);
  }

  drawCalls(): { calls: number; triangles: number } {
    const info = this.world.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles };
  }
}
