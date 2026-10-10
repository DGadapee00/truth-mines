"""Stage 6, layout: place every landmark in the mine, in metres.

y is fixed by depth: y = -depth * metres_per_depth. Each subject owns a wedge of the mine, sized by
how many landmarks it has, so a subject reads as one region all the way down. Within its wedge a
landmark settles under what it depends on:

  - each tunnel pulls its two ends together horizontally (short tunnels, fewer crossings);
  - landmarks at about the same depth push apart until they are min_spacing apart;
  - after each step a landmark is put back inside its wedge and between the inner and outer radius.

The step size cools over the iterations, and the start is seeded, so the same input always gives
the same mine.
"""

from __future__ import annotations

import math

import numpy as np

from .files import config, read_stage, write_stage


def wedges(subjects: list[str], counts: dict[str, int]) -> dict[str, tuple[float, float]]:
    """Angle range per subject, in order round the mine, sized by count^0.75 (small subjects stay readable)."""
    present = [s for s in subjects if counts.get(s, 0)]
    weights = [counts[s] ** 0.75 for s in present]
    total = sum(weights)
    out = {}
    a = 0.0
    for s, w in zip(present, weights):
        span = 2 * math.pi * w / total
        out[s] = (a, a + span)
        a += span
    return out


def layout(nodes: list[dict], edges: list[tuple[int, int]], subjects: list[str], p: dict) -> np.ndarray:
    """nodes: [{subject, depth}], edges: index pairs. Returns an (n, 3) array of positions."""
    n = len(nodes)
    rng = np.random.default_rng(p["seed"])
    counts: dict[str, int] = {}
    for nd in nodes:
        counts[nd["subject"]] = counts.get(nd["subject"], 0) + 1
    wd = wedges(subjects, counts)
    lo = np.array([wd[nd["subject"]][0] for nd in nodes])
    hi = np.array([wd[nd["subject"]][1] for nd in nodes])
    r_in, r_out = p["inner_radius"], p["outer_radius"]
    y = -np.array([nd["depth"] for nd in nodes], dtype=float) * p["metres_per_depth"]

    # Start: spread through the wedge.
    ang = lo + (hi - lo) * (0.15 + 0.7 * rng.random(n))
    rad = r_in + (r_out - r_in) * (0.2 + 0.7 * rng.random(n))
    xz = np.stack([rad * np.cos(ang), rad * np.sin(ang)], axis=1)

    e = np.array(edges, dtype=int).reshape(-1, 2)
    s = p["min_spacing"]
    band = 3 * s  # landmarks this close in height can collide
    near = np.abs(y[:, None] - y[None, :]) < band
    np.fill_diagonal(near, False)

    def confine(xz: np.ndarray, hard: bool) -> np.ndarray:
        """Pull (or, at the end, put) each landmark back inside its wedge and the ring."""
        a = np.mod(np.arctan2(xz[:, 1], xz[:, 0]), 2 * math.pi)
        r = np.hypot(xz[:, 0], xz[:, 1])
        margin = np.minimum(0.05, (hi - lo) * 0.1)
        a_in = np.clip(a, lo + margin, hi - margin)
        r_in_ = np.clip(r, r_in, r_out)
        if not hard:
            a_in = a + 0.3 * (a_in - a)
            r_in_ = r + 0.3 * (r_in_ - r)
        return np.stack([r_in_ * np.cos(a_in), r_in_ * np.sin(a_in)], axis=1)

    deg = np.ones(n)
    if len(e):
        np.add.at(deg, e[:, 0], 1)
        np.add.at(deg, e[:, 1], 1)

    def repel(xz: np.ndarray) -> np.ndarray:
        diff = xz[:, None, :] - xz[None, :, :]
        dist = np.sqrt((diff**2).sum(-1))
        # Two landmarks in exactly the same place: nudge them apart in a fixed direction.
        same = near & (dist < 1e-6)
        diff = np.where(same[:, :, None], rng.standard_normal(diff.shape) * 0.01, diff)
        dist = np.sqrt((diff**2).sum(-1)) + 1e-9
        reach = 1.6 * s
        push = np.where(near & (dist < reach), (reach - dist) / dist, 0.0)
        return (diff * push[:, :, None]).sum(1)

    for it in range(p["iterations"]):
        step = 0.6 * (1 - it / p["iterations"]) + 0.05
        force = np.zeros_like(xz)
        if len(e):
            d = xz[e[:, 1]] - xz[e[:, 0]]
            np.add.at(force, e[:, 0], 0.05 * d)
            np.add.at(force, e[:, 1], -0.05 * d)
            # A much-cited root is pulled by dozens of tunnels; scale by degree so no landmark is
            # dragged onto the same spot as its neighbours.
            force /= np.sqrt(deg)[:, None]
        force += repel(xz)
        xz = confine(xz + step * force, hard=False)
    # Last, spacing only: settle overlaps left by the pull of the tunnels, inside the wedges.
    for _ in range(150):
        xz = confine(xz + 0.3 * repel(xz), hard=True)
    return np.stack([xz[:, 0], y, xz[:, 1]], axis=1)


def run() -> None:
    cfg = config()
    lms = read_stage("curate")["landmarks"]
    col = read_stage("collapse")
    dep = read_stage("depth")["depth"]
    index = {lm["label"]: i for i, lm in enumerate(lms)}
    nodes = [{"subject": lm["subject"], "depth": dep[lm["label"]]} for lm in lms]
    edges = [(index[b], index[a]) for b, v in sorted(col.items()) for a in v["deps"]]
    pos = layout(nodes, edges, [s["id"] for s in cfg["subjects"]], cfg["layout"])
    write_stage("layout", {lm["label"]: [float(v) for v in pos[i]] for i, lm in enumerate(lms)})
    # How crowded is it? The closest pair at about the same depth.
    p = cfg["layout"]
    worst = min(
        (math.dist(pos[i][[0, 2]], pos[j][[0, 2]]) for i in range(len(lms)) for j in range(i) if abs(pos[i][1] - pos[j][1]) < p["min_spacing"]),
        default=float("inf"),
    )
    print(f"layout: {len(lms)} landmarks placed; closest pair at the same depth is {worst:.2f} m apart")
