import { NODES, VEINS } from '../data/mine.js';
import DERIVATIONS from '../data/derivations.js';

/**
 * The mine as a graph: each node with its derivation, its depth, and the nodes it leads to.
 * Depth: laws are 0; a result sits one below the deepest node it comes from.
 */
export function buildGraph(nodes = NODES, derivations = DERIVATIONS) {
  const byId = new Map(nodes.map((n) => [n.id, { ...n, from: n.from || [], to: [] }]));
  for (const n of byId.values()) {
    if (!n.law) {
      n.derivation = derivations.find((d) => d.id === n.id) || null;
      n.title = n.title || n.derivation?.title || n.id;
    }
    for (const p of n.from) byId.get(p)?.to.push(n.id);
  }
  const depth = (n, seen = new Set()) => {
    if (n.depth != null) return n.depth;
    if (seen.has(n.id)) throw new Error(`the mine has a loop through ${n.id}`);
    seen.add(n.id);
    n.depth = n.from.length ? 1 + Math.max(...n.from.map((p) => depth(byId.get(p), seen))) : 0;
    return n.depth;
  };
  for (const n of byId.values()) depth(n);
  const list = [...byId.values()];
  return {
    nodes: list,
    get: (id) => byId.get(id),
    veins: VEINS,
    results: list.filter((n) => !n.law),
    maxDepth: Math.max(...list.map((n) => n.depth)),
  };
}

/** 'law' | 'mined' | 'open' (everything it comes from is mined) | 'locked'. */
export function statusOf(node, mined) {
  if (node.law) return 'law';
  if (mined.has(node.id)) return 'mined';
  return node.from.every((p) => mined.has(p) || isLaw(p)) ? 'open' : 'locked';
}
const isLaw = (id) => NODES.find((n) => n.id === id)?.law;
