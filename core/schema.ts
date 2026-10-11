/**
 * The data the pipeline writes and the app reads. Mirrors pipeline/schema.py field for field.
 * Bump SCHEMA_VERSION in both files on any change, so the app refuses data it does not understand.
 */
export const SCHEMA_VERSION = 6;

export type Kind = 'axiom' | 'definition' | 'theorem';
export const KINDS: readonly Kind[] = ['axiom', 'definition', 'theorem'];

export interface MineNode {
  /** set.mm label */
  id: string;
  kind: Kind;
  /** Human name from landmarks.yaml; may hold inline math between $ signs; empty if unnamed */
  name: string;
  /** The name as plain text (math turned into Unicode), for 3D labels */
  label: string;
  /** LaTeX translated from set.mm: hypotheses above a rule, then the conclusion */
  statement: string;
  /** The statement as set.mm writes it (ASCII) */
  source: string;
  /** Hand-written readable LaTeX from landmarks.yaml, or empty */
  display: string;
  /** Whether a person has checked `display` against the statement */
  display_reviewed: boolean;
  /** Subject id (meta.subjects) */
  subject: string;
  /** Longest path from the roots in the full set.mm graph */
  depth: number;
  /** Metres; y = -depth * metres_per_depth */
  pos: [number, number, number];
  /** Direct dependencies after collapse */
  deps: string[];
  /** Per tunnel (parallel to deps): non-landmark statements on any path down to the dependency */
  feeding_lemmas: number[];
  /** Per tunnel (parallel to deps): the longest citation path, statements strictly between,
   *  from the dependency's end down to this node's */
  chain: string[][];
  /** Path of a reviewed note under data/, or empty */
  note: string;
}

export interface GraphFile {
  schema_version: number;
  nodes: MineNode[];
}

export interface Meta {
  schema_version: number;
  built: string;
  sources: { name: string; repo: string; commit: string; sha256: string; license: string }[];
  counts: Record<string, number>;
  subjects: { id: string; name: string }[];
  metres_per_depth: number;
  max_depth: number;
  max_depth_full_graph: number;
}

export class SchemaError extends Error {}

/** Check a parsed graph.json before anything uses it. Throws SchemaError with the first problem. */
export function parseGraph(raw: unknown): GraphFile {
  const g = raw as Partial<GraphFile> | null;
  if (!g || typeof g !== 'object') throw new SchemaError('graph.json is not an object');
  if (g.schema_version !== SCHEMA_VERSION) {
    throw new SchemaError(`graph.json has schema version ${String(g.schema_version)}; this app reads version ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(g.nodes)) throw new SchemaError('graph.json has no nodes');
  for (const n of g.nodes) {
    const where = `node ${String(n?.id)}`;
    if (typeof n.id !== 'string' || !n.id) throw new SchemaError(`${where}: id`);
    if (!KINDS.includes(n.kind)) throw new SchemaError(`${where}: kind ${String(n.kind)}`);
    for (const f of ['name', 'label', 'statement', 'source', 'display', 'subject'] as const) {
      if (typeof n[f] !== 'string') throw new SchemaError(`${where}: ${f}`);
    }
    if (typeof n.display_reviewed !== 'boolean') throw new SchemaError(`${where}: display_reviewed`);
    if (!Number.isInteger(n.depth) || n.depth < 0) throw new SchemaError(`${where}: depth`);
    if (!Array.isArray(n.pos) || n.pos.length !== 3 || !n.pos.every(Number.isFinite)) throw new SchemaError(`${where}: pos`);
    if (!Array.isArray(n.deps) || !Array.isArray(n.feeding_lemmas) || !Array.isArray(n.chain) || n.deps.length !== n.feeding_lemmas.length || n.deps.length !== n.chain.length) throw new SchemaError(`${where}: deps`);
    if (typeof n.note !== 'string') throw new SchemaError(`${where}: note`);
  }
  return g as GraphFile;
}

export function parseMeta(raw: unknown): Meta {
  const m = raw as Partial<Meta> | null;
  if (!m || m.schema_version !== SCHEMA_VERSION) throw new SchemaError('meta.json has the wrong schema version');
  if (!Array.isArray(m.subjects) || !Array.isArray(m.sources)) throw new SchemaError('meta.json is missing subjects or sources');
  return m as Meta;
}

// ---------------------------------------------------------------- scene.json (the Inside view)
//
// Engine-neutral scene descriptors written by pipeline/scene.py. Every position, size and colour
// of the Inside view is here; a renderer draws these and decides nothing. Conventions travel with
// the file (`conventions`): metres, +Y up, right-handed, heading(yaw) = (sin yaw, 0, cos yaw).

export type Vec3 = [number, number, number];

export interface Strata {
  /** Ambient light, 1 at the surface, falling with depth */
  light: number;
  /** Fog density (exponential, per metre) */
  fog: number;
  /** Rock colour, #rrggbb */
  rock: string;
}

export interface Portal {
  dir: 'up' | 'down';
  /** The chamber at the other end */
  target: string;
  /** The tunnel through it */
  tunnel: string;
  index: number;
  /** Out of the chamber, down the tunnel */
  yaw: number;
  pos: Vec3;
  width: number;
  height: number;
  /** The sign above the doorway, facing into the chamber; `width` is the line width of its text */
  plaque: { pos: Vec3; yaw: number; width: number };
}

export interface Pillar {
  /** The dependency this pillar stands for */
  target: string;
  pos: Vec3;
  radius: number;
  height: number;
}

/**
 * A wedge off a hall, used when the doorways do not fit on the hall's radius.
 * Angles run from `a0` to `a1` (a1 may be greater than 2π). The wedge occupies the radii from
 * `inner_radius` out to `outer_radius`. A subject that needs more than one wedge deep has several
 * of these, sharing `a0` and `a1`, the next starting where the last ends. `portal_indices` name
 * the graph doorways on that outer arc (empty on a wedge that only leads to the next one).
 * `width` is the opening along the inner arc.
 */
export interface Gallery {
  subject: string;
  /** Centre of the mouth */
  yaw: number;
  pos: Vec3;
  width: number;
  length: number;
  height: number;
  inner_radius: number;
  outer_radius: number;
  a0: number;
  a1: number;
  portal_indices: number[];
}

export interface Chamber extends Strata {
  id: string;
  kind: Kind;
  depth: number;
  /** Absolute floor height: -depth * metres_per_depth */
  floor_y: number;
  radius: number;
  /** Height of the wall (and of the gallery ceilings) */
  height: number;
  /** Height of the hall's ceiling at its centre: a shallow dome from `height` at the wall */
  dome: number;
  statement: { pos: Vec3; yaw: number; size: [number, number] };
  spawn: { pos: Vec3; yaw: number };
  portals: Portal[];
  pillars: Pillar[];
  galleries: Gallery[];
}

export interface Marker {
  /** set.mm label of the lemma */
  id: string;
  depth: number;
  /** Distance along the path from the upper doorway */
  s: number;
  /** The point of the floor under it */
  at: Vec3;
  /** Where it stands, against the tunnel wall */
  pos: Vec3;
  side: 1 | -1;
}

export interface Tunnel {
  /** `${lower}>${upper}` */
  id: string;
  upper: string;
  lower: string;
  upper_portal: number;
  lower_portal: number;
  drop: number;
  length: number;
  width: number;
  height: number;
  feeding_lemmas: number;
  chain_length: number;
  ornament: { level: number; rib_spacing: number };
  /** The floor's centre line, in the upper chamber's frame */
  path: Vec3[];
  /** The lower chamber's frame, placed in the upper's */
  lower_in_upper: { pos: Vec3; yaw: number };
  markers: Marker[];
  light: [number, number];
  fog: [number, number];
  rock: [string, string];
}

export interface SceneFile {
  schema_version: number;
  conventions: Record<string, string>;
  metres_per_depth: number;
  chambers: Chamber[];
  tunnels: Tunnel[];
}

const isVec3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x));

/** Check a parsed scene.json before anything draws it. Throws SchemaError with the first problem. */
export function parseScene(raw: unknown): SceneFile {
  const s = raw as Partial<SceneFile> | null;
  if (!s || s.schema_version !== SCHEMA_VERSION) throw new SchemaError(`scene.json has schema version ${String(s?.schema_version)}; this app reads ${SCHEMA_VERSION}`);
  if (!Array.isArray(s.chambers) || !Array.isArray(s.tunnels)) throw new SchemaError('scene.json has no chambers or tunnels');
  for (const c of s.chambers) {
    const w = `chamber ${String(c?.id)}`;
    if (!(c.radius > 0) || !(c.height > 0) || !(c.dome >= c.height) || !Number.isFinite(c.floor_y)) throw new SchemaError(`${w}: size`);
    if (!isVec3(c.statement?.pos) || !isVec3(c.spawn?.pos)) throw new SchemaError(`${w}: statement or spawn`);
    if (!Array.isArray(c.galleries)) throw new SchemaError(`${w}: galleries`);
    for (const p of c.portals) if (!isVec3(p.pos) || !isVec3(p.plaque?.pos) || !(p.plaque.width > 0) || !(p.width > 0)) throw new SchemaError(`${w}: portal ${p.index}`);
    for (const p of c.pillars) if (!isVec3(p.pos) || !(p.radius > 0)) throw new SchemaError(`${w}: pillar ${p.target}`);
    for (const g of c.galleries) {
      if (typeof g.subject !== 'string' || !(g.outer_radius > g.inner_radius) || !(g.inner_radius >= c.radius - 0.02) || !(g.length > 0) || !isVec3(g.pos)) throw new SchemaError(`${w}: gallery ${g.subject}`);
      if (!Array.isArray(g.portal_indices) || g.portal_indices.some((i) => !c.portals[i])) throw new SchemaError(`${w}: gallery portals`);
    }
  }
  for (const t of s.tunnels) {
    const w = `tunnel ${String(t?.id)}`;
    if (!Array.isArray(t.path) || t.path.length < 2 || !t.path.every(isVec3)) throw new SchemaError(`${w}: path`);
    if (!isVec3(t.lower_in_upper?.pos) || !Number.isFinite(t.lower_in_upper?.yaw)) throw new SchemaError(`${w}: lower_in_upper`);
    for (const m of t.markers) if (!isVec3(m.pos) || !isVec3(m.at)) throw new SchemaError(`${w}: marker ${m.id}`);
  }
  return s as SceneFile;
}

// ---------------------------------------------------------------- plane-number-theory.json
//
// The number theory plane, written by pipeline/plane_nt.py. It has its own version, so adding a
// plane leaves the mine's files alone. As with scene.json, the app draws and animates this and
// decides no geometry (CLAUDE.md rule 9). Conventions travel with the file.

export const PLANE_SCHEMA_VERSION = 1;

export interface PlaneText {
  id: string;
  text: string;
  /** Drafts stay false until a person approves the line */
  reviewed: boolean;
}

export interface PlaneStop {
  id: string;
  name: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
}

export interface PrimeColour {
  p: number;
  hue: number;
  saturation: number;
  lightness: number;
  color: string;
}

export interface ColumnPart {
  prime: number;
  y: number;
  h: number;
  form: 'block' | 'monolith';
}

export interface RoadColumn {
  n: number;
  kind: 'unit' | 'prime' | 'composite';
  pos: Vec3;
  yaw: number;
  /** Prime factors with multiplicity, smallest first */
  factors: number[];
  /** "12 = 2² · 3" */
  label: string;
  parts: ColumnPart[];
  height: number;
  radius: number;
  /** One arc per block, from the block to its prime's monolith */
  threads: Vec3[][];
}

export interface PlazaCell {
  n: number;
  row: number;
  col: number;
  pos: Vec3;
}

export interface Plaza {
  centre: Vec3;
  yaw: number;
  cell: number;
  seed_cell: { row: number; col: number; pos: Vec3 };
  grid: PlazaCell[];
  column: { width: number; height: number; rubble_height: number };
  labels: { number_height: number; number_offset: number };
  footprint: number;
  stone: string;
  glow: string;
  crumble_step_s: number;
  /** For each number, the multiples after itself that crumble when it is struck */
  multiples: Record<string, number[]>;
  survivors: number[];
  bound: number;
  sufficient_primes: number[];
}

export interface OverlookSample {
  x: number;
  pi: number;
  estimate: number;
  ratio: number;
  /** Metres along the overlook road */
  s: number;
  at: Vec3;
  pi_at: Vec3;
  est_at: Vec3;
  /** On the ratio curve: base + ratio_scale * (ratio - 1) */
  ratio_at: Vec3;
  /** Where the marker's sign stands, beside the road */
  sign_at: Vec3;
}

export interface OverlookWindow {
  x0: number;
  span: number;
  label: string;
  count: number;
  label_at: Vec3;
  primes: { p: number; pos: Vec3 }[];
}

export interface Overlook {
  scale: { x0: number; x1: number; decades: number; metres_per_decade: number; origin: Vec3; yaw: number };
  road: { length: number; half_width: number };
  panel: { cell: number; base: number };
  decades: { x: number; label: string; pos: Vec3 }[];
  windows: OverlookWindow[];
  samples: OverlookSample[];
  marker: { sign_size: [number, number] };
  labels: { height: number };
  curve: { offset: number; base: number; height: number; width: number; ratio_scale: number; baseline: [Vec3, Vec3] };
}

export interface PlaneFile {
  schema_version: number;
  plane: string;
  conventions: Record<string, string>;
  texts: PlaneText[];
  stops: PlaneStop[];
  ground: { spine: Vec3[]; half_width: number; square: { centre: Vec3; yaw: number; half: number } };
  primes: PrimeColour[];
  road: {
    spacing: number;
    block: { size: number; gap: number };
    thread_radius: number;
    labels: { number_height: number; number_offset: number; sign_offset: number; sign_size: [number, number] };
    monolith: { width: number; height: number };
    seed: { pos: Vec3; size: [number, number] };
    columns: RoadColumn[];
  };
  plaza: Plaza;
  overlook: Overlook;
}

/** Check a parsed plane-number-theory.json before anything draws it. Throws SchemaError. */
export function parsePlane(raw: unknown): PlaneFile {
  const p = raw as Partial<PlaneFile> | null;
  if (!p || p.schema_version !== PLANE_SCHEMA_VERSION) throw new SchemaError(`plane-number-theory.json has schema version ${String(p?.schema_version)}; this app reads ${PLANE_SCHEMA_VERSION}`);
  for (const k of ['texts', 'stops', 'primes'] as const) if (!Array.isArray(p[k])) throw new SchemaError(`plane: ${k}`);
  if (!p.ground || !Array.isArray(p.ground.spine) || p.ground.spine.length < 2 || !p.ground.spine.every(isVec3)) throw new SchemaError('plane: ground');
  if (!p.road || !Array.isArray(p.road.columns)) throw new SchemaError('plane: road');
  for (const c of p.road.columns) {
    const w = `plane column ${String(c?.n)}`;
    if (!Number.isInteger(c.n) || !isVec3(c.pos) || typeof c.label !== 'string' || !Array.isArray(c.parts) || !Array.isArray(c.threads)) throw new SchemaError(w);
    if (!c.threads.every((t) => Array.isArray(t) && t.every(isVec3))) throw new SchemaError(`${w}: threads`);
  }
  const pl = p.plaza;
  if (!pl || !Array.isArray(pl.grid) || !pl.multiples || !Array.isArray(pl.survivors)) throw new SchemaError('plane: plaza');
  for (const c of pl.grid) if (!Number.isInteger(c.n) || !isVec3(c.pos) || !pl.multiples[String(c.n)]) throw new SchemaError(`plane plaza cell ${String(c?.n)}`);
  const ov = p.overlook;
  if (!ov || !Array.isArray(ov.samples) || ov.samples.length < 2 || !Array.isArray(ov.windows)) throw new SchemaError('plane: overlook');
  for (const s of ov.samples) if (!(s.x > 0) || !isVec3(s.at) || !isVec3(s.pi_at) || !isVec3(s.est_at) || !isVec3(s.ratio_at) || !isVec3(s.sign_at) || !Number.isFinite(s.s)) throw new SchemaError(`plane overlook sample ${String(s?.x)}`);
  return p as PlaneFile;
}

// ---------------------------------------------------------------- cathedral.json and pathways.json
//
// Written by pipeline/cathedral.py and pipeline/pathways.py; JSON Schema for both lives in
// docs/schemas/. Doors carry no state: core/doors.ts computes it from what has been earned.

export const CATHEDRAL_SCHEMA_VERSION = 1;
export const PATHWAYS_SCHEMA_VERSION = 2;

export const PLANE_IDS = [
  'logic',
  'sets',
  'infinity',
  'number-theory',
  'combinatorics',
  'graph-theory',
  'algebra-symmetry',
  'linear-algebra',
  'complex-numbers',
  'geometry',
  'topology',
  'calculus-analysis',
] as const;
export type PlaneId = (typeof PLANE_IDS)[number];

export type PreviewId = 'prime-stacks' | 'limit-curve' | 'torus-cup' | 'ring-motif';
const PREVIEW_IDS: readonly string[] = ['prime-stacks', 'limit-curve', 'torus-cup', 'ring-motif'];
const PLACEMENTS: readonly string[] = ['far-wall', 'left', 'right', 'entrance'];

export interface CathedralArc {
  id: string;
  name: string;
  placement: 'far-wall' | 'left' | 'right' | 'entrance';
  centre_deg: number;
  /** Plane ids, leftmost first as seen from the middle of the hall */
  planes: PlaneId[];
}

export interface CathedralDoor {
  plane: PlaneId;
  name: string;
  arc: string;
  /** 0..11, one per 30 degrees from the far wall, counted toward the left */
  slot: number;
  bearing_deg: number;
  pos: Vec3;
  /** The way the door faces: toward the hall centre */
  yaw: number;
  /** Where the visitor stands, facing the door, when they step back out of its plane */
  stand: { pos: Vec3; yaw: number };
  pedestal: { pos: Vec3; radius: number; height: number; preview_pos: Vec3 };
  preview: { id: PreviewId; params: Record<string, unknown> };
}

export interface ThresholdRing {
  k: number;
  scale: number;
  radius: number;
  rotation: number;
  pos: Vec3;
  /** Elevation of the path where the ring stands: the ring faces along the path */
  pitch: number;
}

export interface ThresholdSegment {
  kind: 'drift' | 'descent';
  s_from: number;
  s_to: number;
  /** metres per second, before easing */
  speed: number;
  /** 0..1: how far the comfort vignette closes in */
  vignette: number;
}

export interface CathedralFile {
  schema_version: number;
  conventions: Record<string, string>;
  arcs: CathedralArc[];
  hall: { radius: number; wall_height: number; /** The wall stands between the radius and the radius plus this */ wall_thickness: number; door: { width: number; height: number }; slots: number };
  arrival: { pos: Vec3; yaw: number; dais_radius: number };
  doors: CathedralDoor[];
  threshold: {
    motif: { kind: 'sierpinski'; depth: number; triangles: [number, number][][] };
    rings: ThresholdRing[];
    /** The rails path, in order: level through the tunnel in the vault, a turn, then straight down onto the arrival dais. It is where the visitor's feet go (the origin of their rig); the rings are centred `eye_height` above it. */
    path: Vec3[];
    eye_height: number;
    /** Speed and comfort vignette per stretch of the path, by arc length in metres: the drift through the tunnel, then the descent */
    segments: ThresholdSegment[];
    /** Seconds to ramp the speed at the start, between segments and at the dais */
    ease_s: number;
    duration_s: number;
  };
  vault: { tiers: { i: number; radius: number; y: number; sides: number; rotation: number }[]; ratio: number; limit_y: number };
}

export type MomentKind = 'road' | 'sieve' | 'overlook';

export interface PathwayMoment {
  id: string;
  kind: MomentKind;
  /** set.mm ids this moment can grant when the visitor explains it to Trurl */
  earns: string[];
}

export interface PathwayStretch {
  id: string;
  /** The plane file this stretch draws, next to the other data files */
  plane_data: string;
  landmarks: string[];
  moments: PathwayMoment[];
}

export interface Pathway {
  plane: PlaneId;
  /** The idea the gate was derived from: the first landmark of a built pathway, or the idea an unbuilt one will reach. null: no gate */
  gated_on: string | null;
  /**
   * Derived by the pipeline, never written by hand: the ideas on the map (landmarks of any stretch)
   * that `gated_on` truly rests on in set.mm. They must all be earned before the door can be a
   * frontier door. null means no true gate exists in the prototype and the door is sealed.
   */
  entry_requires: string[] | null;
  stretches: PathwayStretch[];
}

export interface PathwaysFile {
  schema_version: number;
  pathways: Pathway[];
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);
const isPlaneId = (v: unknown): v is PlaneId => (PLANE_IDS as readonly string[]).includes(v as string);

/** Check a parsed cathedral.json before anything draws it. Throws SchemaError. */
export function parseCathedral(raw: unknown): CathedralFile {
  const c = raw as Partial<CathedralFile> | null;
  if (!c || typeof c !== 'object') throw new SchemaError('cathedral.json is not an object');
  if (c.schema_version !== CATHEDRAL_SCHEMA_VERSION) {
    throw new SchemaError(`cathedral.json has schema version ${String(c.schema_version)}; this app reads ${CATHEDRAL_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(c.arcs) || c.arcs.length !== 4) throw new SchemaError('cathedral: arcs');
  for (const a of c.arcs) {
    if (typeof a.id !== 'string' || !PLACEMENTS.includes(a.placement) || !Number.isInteger(a.centre_deg) || !Array.isArray(a.planes) || a.planes.length !== 3 || !a.planes.every(isPlaneId)) {
      throw new SchemaError(`cathedral arc ${String(a?.id)}`);
    }
  }
  const h = c.hall;
  if (!h || !(h.radius > 0) || !(h.wall_height > 0) || !(h.wall_thickness > 0) || h.slots !== 12 || !(h.door?.width > 0) || !(h.door?.height > 0)) throw new SchemaError('cathedral: hall');
  if (!c.arrival || !isVec3(c.arrival.pos) || !Number.isFinite(c.arrival.yaw) || !(c.arrival.dais_radius > 0)) throw new SchemaError('cathedral: arrival');
  if (!Array.isArray(c.doors) || c.doors.length !== 12) throw new SchemaError('cathedral: there must be twelve doors');
  const seen = new Set<string>();
  for (const d of c.doors) {
    const w = `cathedral door ${String(d?.plane)}`;
    if (!isPlaneId(d.plane) || seen.has(d.plane)) throw new SchemaError(`${w}: plane`);
    seen.add(d.plane);
    if (!Number.isInteger(d.slot) || d.slot < 0 || d.slot > 11 || !Number.isInteger(d.bearing_deg)) throw new SchemaError(`${w}: slot`);
    if (!isVec3(d.pos) || !Number.isFinite(d.yaw)) throw new SchemaError(`${w}: pos`);
    if (!d.stand || !isVec3(d.stand.pos) || !Number.isFinite(d.stand.yaw)) throw new SchemaError(`${w}: stand`);
    if (!d.pedestal || !isVec3(d.pedestal.pos) || !isVec3(d.pedestal.preview_pos) || !(d.pedestal.radius > 0) || !(d.pedestal.height > 0)) throw new SchemaError(`${w}: pedestal`);
    if (!d.preview || !PREVIEW_IDS.includes(d.preview.id) || typeof d.preview.params !== 'object') throw new SchemaError(`${w}: preview`);
    if (!c.arcs.some((a) => a.id === d.arc && a.planes.includes(d.plane))) throw new SchemaError(`${w}: arc`);
  }
  if (new Set(c.doors.map((d) => d.slot)).size !== 12) throw new SchemaError('cathedral: two doors share a slot');
  const t = c.threshold;
  if (!t || !Array.isArray(t.rings) || t.rings.length < 2 || !Array.isArray(t.path) || t.path.length < 2 || !t.path.every(isVec3)) throw new SchemaError('cathedral: threshold');
  if (!(t.duration_s > 0) || !(t.ease_s > 0) || !(t.eye_height > 0) || t.motif?.kind !== 'sierpinski' || !Array.isArray(t.motif.triangles)) throw new SchemaError('cathedral: threshold motif or timing');
  if (!Array.isArray(t.segments) || t.segments.length !== 2 || t.segments[0]?.kind !== 'drift' || t.segments[1]?.kind !== 'descent') throw new SchemaError('cathedral: threshold segments');
  for (const g of t.segments) if (!(g.speed > 0) || !(g.vignette > 0 && g.vignette <= 1) || !Number.isFinite(g.s_from) || !(g.s_to > g.s_from)) throw new SchemaError(`cathedral threshold ${g.kind} segment`);
  if (t.segments[0].s_from !== 0 || t.segments[1].s_from !== t.segments[0].s_to) throw new SchemaError('cathedral: threshold segments leave a gap');
  for (const r of t.rings) if (!Number.isInteger(r.k) || !(r.scale > 0) || !(r.radius > 0) || !Number.isFinite(r.rotation) || !isVec3(r.pos) || !Number.isFinite(r.pitch)) throw new SchemaError(`cathedral threshold ring ${String(r?.k)}`);
  if (!c.vault || !Array.isArray(c.vault.tiers) || c.vault.tiers.length < 1 || !(c.vault.ratio > 0 && c.vault.ratio < 1)) throw new SchemaError('cathedral: vault');
  return c as CathedralFile;
}

/** Check a parsed pathways.json before anything uses it. Throws SchemaError. */
export function parsePathways(raw: unknown): PathwaysFile {
  const p = raw as Partial<PathwaysFile> | null;
  if (!p || typeof p !== 'object') throw new SchemaError('pathways.json is not an object');
  if (p.schema_version !== PATHWAYS_SCHEMA_VERSION) {
    throw new SchemaError(`pathways.json has schema version ${String(p.schema_version)}; this app reads ${PATHWAYS_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(p.pathways) || p.pathways.length !== 12) throw new SchemaError('pathways: there must be twelve');
  const planes = new Set<string>();
  const ids = new Set<string>();
  for (const w of p.pathways) {
    const where = `pathway ${String(w?.plane)}`;
    if (!isPlaneId(w.plane) || planes.has(w.plane)) throw new SchemaError(`${where}: plane`);
    planes.add(w.plane);
    if (!(w.entry_requires === null || isStringArray(w.entry_requires)) || !Array.isArray(w.stretches)) throw new SchemaError(`${where}: entry_requires or stretches`);
    if (!(w.gated_on === null || (typeof w.gated_on === 'string' && w.gated_on.length > 0)) || (w.gated_on === null) !== (w.entry_requires === null)) throw new SchemaError(`${where}: gated_on and entry_requires must both be set, or both be null`);
    for (const s of w.stretches) {
      if (typeof s.id !== 'string' || !s.id || typeof s.plane_data !== 'string' || !isStringArray(s.landmarks) || s.landmarks.length < 1 || !Array.isArray(s.moments)) throw new SchemaError(`${where}: stretch ${String(s?.id)}`);
      if (ids.has(s.id)) throw new SchemaError(`${where}: stretch id ${s.id} repeats`);
      ids.add(s.id);
      for (const m of s.moments) {
        if (typeof m.id !== 'string' || !m.id || ids.has(m.id) || !['road', 'sieve', 'overlook'].includes(m.kind) || !isStringArray(m.earns) || m.earns.length < 1) throw new SchemaError(`${where}: moment ${String(m?.id)}`);
        ids.add(m.id);
        if (!m.earns.every((e) => s.landmarks.includes(e))) throw new SchemaError(`${where}: moment ${m.id} earns a landmark outside its stretch`);
      }
    }
  }
  return p as PathwaysFile;
}

// ---------------------------------------------------------------- progress (player data)
//
// What the visitor has done, written at runtime and kept on the device and in the Worker's KV. It
// stores nothing derivable: door states come from `earned` (core/doors.ts). JSON Schema:
// docs/schemas/progress.schema.json. Operations: core/progress.ts.

export const PROGRESS_SCHEMA_VERSION = 1;

/** Where the visitor stood in a pathway, in that plane's own frame (metres, yaw about +Y) */
export interface Resume {
  pos: Vec3;
  yaw: number;
}

export interface PathwayProgress {
  /** The stretch id the visitor was in */
  stretch: string;
  resume: Resume;
  /** ISO 8601 UTC, e.g. 2026-10-10T21:00:00Z */
  updated_at: string;
}

export interface Progress {
  schema_version: number;
  /** set.mm ids the visitor has earned, sorted, no repeats */
  earned: string[];
  /** Per plane id */
  pathways: Record<string, PathwayProgress>;
  updated_at: string;
}

// ---------------------------------------------------------------- Trurl (Worker request and grounding)
//
// The client sends only facts about where the visitor is (docs/schemas/trurl-request.schema.json);
// the Worker builds the prompt. grounding.json (docs/schemas/grounding.schema.json) is what Trurl
// may assert, bundled into the Worker by pipeline/grounding.py.

export const TRURL_SCHEMA_VERSION = 1;
export const GROUNDING_SCHEMA_VERSION = 1;

export interface TrurlTurn {
  role: 'user' | 'trurl';
  text: string;
}

export interface TrurlRequest {
  schema_version: number;
  plane: string | null;
  stretch: string | null;
  moment: string | null;
  landmark: string | null;
  /** What the visitor is looking at, e.g. door:number-theory or column:12 */
  looking_at: string | null;
  earned: string[];
  dialogue: TrurlTurn[];
  utterance: string;
}

export interface GroundingLandmark {
  name: string;
  kind: Kind;
  /** LaTeX translated from set.mm */
  statement: string;
  /** The statement as set.mm writes it */
  source: string;
  /** set.mm's own description, without credits */
  comment: string;
  /** Present only once a person has reviewed the display form */
  display?: string;
  /** Present only once a person has reviewed the note */
  note?: string;
}

export interface GroundingMoment {
  plane: string;
  stretch: string;
  kind: MomentKind;
  landmarks: string[];
  earns: string[];
  /** A draft of what a good explanation says; private to Trurl's judge */
  rubric: string;
  rubric_reviewed: boolean;
}

export interface GroundingFile {
  schema_version: number;
  planes: Record<string, string>;
  landmarks: Record<string, GroundingLandmark>;
  moments: Record<string, GroundingMoment>;
}
