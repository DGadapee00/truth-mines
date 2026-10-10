/**
 * The data the pipeline writes and the app reads. Mirrors pipeline/schema.py field for field.
 * Bump SCHEMA_VERSION in both files on any change, so the app refuses data it does not understand.
 */
export const SCHEMA_VERSION = 3;

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
