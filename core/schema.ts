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
  decades: { x: number; label: string; pos: Vec3 }[];
  windows: OverlookWindow[];
  samples: OverlookSample[];
  marker: { height: number };
  curve: { offset: number; base: number; height: number };
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
    block: { size: number };
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
  for (const s of ov.samples) if (!(s.x > 0) || !isVec3(s.at) || !isVec3(s.pi_at) || !isVec3(s.est_at) || !Number.isFinite(s.s)) throw new SchemaError(`plane overlook sample ${String(s?.x)}`);
  return p as PlaneFile;
}
