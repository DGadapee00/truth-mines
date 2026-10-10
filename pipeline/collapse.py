"""Stage 4, collapse: replace the chains of lemmas between landmarks with single tunnels.

For each landmark B, walk down its citations without passing through another landmark. Every
landmark A met on the way gets a tunnel B -> A, and the statements walked through are the lemmas
that tunnel hides. `hidden_steps` counts the hidden lemmas that lie on some path from B down to A.

With `transitive_reduction`, a tunnel B -> A is dropped when A can already be reached from B
through other tunnels. Ancestors, and so every trace to the axioms, are unchanged.
"""

from __future__ import annotations

from collections import deque

import networkx as nx

from .files import config, read_stage, write_stage


def collapse(deps: dict[str, list[str]], landmarks: set[str], reduce: bool = True) -> dict[str, dict]:
    out: dict[str, dict] = {}
    tunnels: dict[str, list[str]] = {}
    regions: dict[str, set[str]] = {}
    for b in landmarks:
        region: set[str] = set()
        found: list[str] = []
        q = deque(deps[b])
        seen = set(deps[b])
        while q:
            x = q.popleft()
            if x in landmarks:
                found.append(x)
                continue
            region.add(x)
            for d in deps[x]:
                if d not in seen:
                    seen.add(d)
                    q.append(d)
        tunnels[b] = found
        regions[b] = region

    if reduce:
        g = nx.DiGraph()
        g.add_nodes_from(landmarks)
        g.add_edges_from((b, a) for b, ts in tunnels.items() for a in ts)
        if not nx.is_directed_acyclic_graph(g):
            raise SystemExit("collapse: the landmark graph has a cycle")
        r = nx.transitive_reduction(g)
        tunnels = {b: [a for a in tunnels[b] if r.has_edge(b, a)] for b in tunnels}

    for b in landmarks:
        region = regions[b]
        # Hidden lemmas between B and A: those in B's region that can reach A.
        rev: dict[str, list[str]] = {}
        for x in region | {b}:
            for d in deps[x]:
                if d in region or d in landmarks:
                    rev.setdefault(d, []).append(x)
        hidden = []
        for a in tunnels[b]:
            seen = set()
            q = deque([a])
            while q:
                y = q.popleft()
                for x in rev.get(y, ()):
                    if x in region and x not in seen:
                        seen.add(x)
                        q.append(x)
            hidden.append(len(seen))
        order = sorted(range(len(tunnels[b])), key=lambda i: tunnels[b][i])
        out[b] = {"deps": [tunnels[b][i] for i in order], "hidden_steps": [hidden[i] for i in order]}
    return out


def run() -> None:
    st = read_stage("extract")["statements"]
    landmarks = {lm["label"] for lm in read_stage("curate")["landmarks"]}
    deps = {k: v["deps"] for k, v in st.items()}
    cfg = config()["collapse"]
    out = collapse(deps, landmarks, cfg.get("transitive_reduction", True))
    write_stage("collapse", out)
    n = sum(len(v["deps"]) for v in out.values())
    print(f"collapse: {len(out)} landmarks joined by {n} tunnels")
