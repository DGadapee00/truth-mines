/**
 * Where each crystal sits, in mine units (about one unit per metre at life size).
 *
 * Each vein is a shaft under its law. Results hang in rings around the shaft, one ring per level,
 * LEVEL units apart. A ring's nodes turn to sit below what they come from, so tunnels run short and
 * do not cross the shaft. Positions are worked out once, the same way every time.
 */
export const LEVEL = 8;
const VEIN_X = { circuits: -17, biot: 0, ampere: 17 };

export function layoutMine(graph) {
  const pos = new Map();
  const angle = new Map();
  for (const vein of Object.keys(graph.veins)) {
    const cx = VEIN_X[vein] ?? 0;
    for (let d = 0; d <= graph.maxDepth; d++) {
      const ring = graph.nodes.filter((n) => n.vein === vein && n.depth === d);
      if (!ring.length) continue;
      const n = ring.length;
      const r = n === 1 ? 0 : Math.max(4, n * 1.55);
      // Where each node would like to be: under the nodes it comes from (their mean direction).
      const want = ring.map((node, i) => {
        const ps = node.from.filter((p) => angle.has(p));
        if (!ps.length) return (2 * Math.PI * i) / n;
        const sx = ps.reduce((s, p) => s + Math.sin(angle.get(p)), 0);
        const sz = ps.reduce((s, p) => s + Math.cos(angle.get(p)), 0);
        return Math.atan2(sx, sz);
      });
      const order = ring.map((node, i) => ({ node, a: want[i] })).sort((p, q) => p.a - q.a);
      spread(order, (2 * Math.PI) / n);
      for (const { node, a } of order) {
        if (r > 0) angle.set(node.id, a);
        pos.set(node.id, [cx + r * Math.sin(a), -d * LEVEL, r * Math.cos(a)]);
      }
    }
  }
  return pos;
}

/** Push neighbours apart round the circle until each pair is at least 0.9 of an even share apart. */
function spread(items, share) {
  const gap = 0.9 * share;
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (let i = 0; i < items.length && items.length > 1; i++) {
      const a = items[i];
      const b = items[(i + 1) % items.length];
      let d = b.a - a.a;
      if (i === items.length - 1) d += 2 * Math.PI;
      if (d < gap - 1e-6) {
        const push = (gap - d) / 2;
        a.a -= push;
        b.a += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}
