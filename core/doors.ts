import { SchemaError, type CathedralFile, type GraphFile, type PathwaysFile } from './schema';

/**
 * How a door shows itself. Never stored: it is derived from what the visitor has earned, so the
 * saved progress and the mathematics can never disagree.
 *
 *   frontier  every id in the pathway's `entry_requires` is earned (a door with none starts here)
 *   dim       not a frontier, but every unmet requirement is one step from the earned set: all of
 *             its own dependencies in the graph are earned (an axiom or definition has none)
 *   sealed    everything else, and every door whose pathway has no true gate (`entry_requires` null):
 *             no idea on the map leads to it
 *
 * `entry_requires` is derived by the pipeline from the real dependencies (pipeline/pathways.py).
 *
 * A door only ever moves sealed to dim to frontier as ideas are earned.
 */
export type DoorState = 'frontier' | 'dim' | 'sealed';

/**
 * The state of every door, keyed by plane id.
 *
 * `earned` may hold ids the graph does not know; they are ignored. A requirement the graph does
 * not know, or a door with no pathway, is a data error and throws a SchemaError. Dependencies are
 * the direct ones in graph.json, as the design says.
 */
export function doorStates(earned: Iterable<string>, cathedral: CathedralFile, pathways: PathwaysFile, graph: GraphFile): Record<string, DoorState> {
  const have = new Set(earned);
  const deps = new Map<string, string[]>();
  for (const n of graph.nodes) deps.set(n.id, n.deps);
  const byPlane = new Map(pathways.pathways.map((p) => [p.plane as string, p]));
  const out: Record<string, DoorState> = {};
  for (const door of cathedral.doors) {
    const pathway = byPlane.get(door.plane);
    if (!pathway) throw new SchemaError(`door ${door.plane} has no pathway`);
    if (pathway.entry_requires === null) {
      out[door.plane] = 'sealed';
      continue;
    }
    let state: DoorState = 'frontier';
    for (const id of pathway.entry_requires) {
      const d = deps.get(id);
      if (!d) throw new SchemaError(`door ${door.plane} requires ${id}, which is not in the graph`);
      if (have.has(id)) continue;
      if (!d.every((x) => have.has(x))) state = 'sealed';
      else if (state === 'frontier') state = 'dim';
    }
    out[door.plane] = state;
  }
  return out;
}
