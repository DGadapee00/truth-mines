import { PROGRESS_SCHEMA_VERSION, SchemaError, type PathwayProgress, type PathwaysFile, type Progress, type Resume, type Vec3 } from './schema';

/**
 * Progress operations. All pure: inputs are never changed and results never share arrays with them.
 *
 * Merging is a join: earned ideas are a set union (never lost), and for each pathway the most
 * recent `updated_at` wins. Ties are broken by comparing the entries' text, so the result is the
 * same whichever side is `a`. That makes the merge commutative, associative and idempotent, so any
 * number of devices syncing in any order converge.
 */

const EPOCH = '1970-01-01T00:00:00Z';
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function emptyProgress(): Progress {
  return { schema_version: PROGRESS_SCHEMA_VERSION, earned: [], pathways: {}, updated_at: EPOCH };
}

const isTime = (v: unknown): v is string => typeof v === 'string' && TIME.test(v) && Number.isFinite(Date.parse(v));
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Check a parsed progress file and return a normalised copy (earned sorted, no repeats). Throws SchemaError. */
export function parseProgress(raw: unknown): Progress {
  const p = raw as Partial<Progress> | null;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new SchemaError('progress is not an object');
  if (p.schema_version !== PROGRESS_SCHEMA_VERSION) {
    throw new SchemaError(`progress has schema version ${String(p.schema_version)}; this app reads ${PROGRESS_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(p.earned) || !p.earned.every((x) => typeof x === 'string' && x.length > 0)) throw new SchemaError('progress: earned');
  if (!isTime(p.updated_at)) throw new SchemaError('progress: updated_at');
  if (!p.pathways || typeof p.pathways !== 'object' || Array.isArray(p.pathways)) throw new SchemaError('progress: pathways');
  const pathways: Record<string, PathwayProgress> = {};
  for (const [plane, w] of Object.entries(p.pathways)) {
    const where = `progress pathway ${plane}`;
    if (!plane || !w || typeof w.stretch !== 'string' || !w.stretch) throw new SchemaError(`${where}: stretch`);
    if (!w.resume || !isVec3(w.resume.pos) || typeof w.resume.yaw !== 'number' || !Number.isFinite(w.resume.yaw)) throw new SchemaError(`${where}: resume`);
    if (!isTime(w.updated_at)) throw new SchemaError(`${where}: updated_at`);
    pathways[plane] = { stretch: w.stretch, resume: { pos: [...w.resume.pos], yaw: w.resume.yaw }, updated_at: w.updated_at };
  }
  return { schema_version: PROGRESS_SCHEMA_VERSION, earned: [...new Set(p.earned)].sort(), pathways, updated_at: p.updated_at };
}

/** Whether time `a` is later than time `b`; equal instants written differently are ordered by text. */
function laterThan(a: string, b: string): boolean {
  const d = Date.parse(a) - Date.parse(b);
  return d !== 0 ? d > 0 : a > b;
}

const later = (a: string, b: string) => (laterThan(b, a) ? b : a);

/** Progress after earning `ids`. Earning only what is already earned returns an equal copy, untouched, time included. */
export function earn(p: Progress, ids: string[], now: string): Progress {
  const have = new Set(p.earned);
  const fresh = ids.filter((id) => !have.has(id));
  const copy = parseProgress(p);
  if (fresh.length === 0) return copy;
  copy.earned = [...new Set([...copy.earned, ...fresh])].sort();
  copy.updated_at = later(copy.updated_at, now);
  return copy;
}

/** Progress after recording where the visitor stands in a plane's pathway. */
export function setResume(p: Progress, plane: string, stretch: string, resume: Resume, now: string): Progress {
  const copy = parseProgress(p);
  copy.pathways[plane] = { stretch, resume: { pos: [...resume.pos], yaw: resume.yaw }, updated_at: now };
  copy.updated_at = later(copy.updated_at, now);
  return copy;
}

function text(w: PathwayProgress): string {
  return JSON.stringify([w.stretch, w.resume.pos, w.resume.yaw, w.updated_at]);
}

/** The entry that wins when two devices both have one for a plane. */
function newer(a: PathwayProgress, b: PathwayProgress): PathwayProgress {
  if (a.updated_at !== b.updated_at) return laterThan(a.updated_at, b.updated_at) ? a : b;
  return text(a) >= text(b) ? a : b;
}

/** Two devices' progress as one. Never loses an earned idea; commutative, associative, idempotent. */
export function mergeProgress(left: Progress, right: Progress): Progress {
  const a = parseProgress(left);
  const b = parseProgress(right);
  const out = parseProgress({ ...a, earned: [...a.earned, ...b.earned], updated_at: later(a.updated_at, b.updated_at) });
  for (const [plane, w] of Object.entries(b.pathways)) {
    const mine = out.pathways[plane];
    const win = mine ? newer(mine, w) : w;
    out.pathways[plane] = { stretch: win.stretch, resume: { pos: [...win.resume.pos], yaw: win.resume.yaw }, updated_at: win.updated_at };
  }
  return out;
}

/**
 * The saved place in a plane's pathway, or null when nothing is saved or the saved stretch is no
 * longer in `pathways` (data changed since the save). The visitor then starts the pathway afresh
 * rather than being put somewhere that no longer exists.
 */
export function validResume(p: Progress, pathways: PathwaysFile, plane: string): { stretch: string; resume: Resume } | null {
  const saved = p.pathways[plane];
  if (!saved) return null;
  const pathway = pathways.pathways.find((w) => w.plane === plane);
  if (!pathway?.stretches.some((s) => s.id === saved.stretch)) return null;
  return { stretch: saved.stretch, resume: { pos: [...saved.resume.pos], yaw: saved.resume.yaw } };
}
