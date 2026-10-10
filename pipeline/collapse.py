"""Stage 4, collapse: replace the chains of lemmas between landmarks with single tunnels.

For each landmark B, walk down its citations without passing through another landmark. Every
landmark A met on the way gets a tunnel B -> A. Each tunnel records:

  feeding_lemmas  how many non-landmark statements lie on some path from B down to A: every lemma
                  that feeds the tunnel (the union of all its paths)
  chain           the statements on the LONGEST such path, in walking order: from A (shallower)
                  down to B (deeper), endpoints excluded. Longest, like depth itself, so a tunnel's
                  chain is the stretch of the critical path it carries.

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
    for b in sorted(landmarks):
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

    for b in sorted(landmarks):
        region = regions[b]
        # Feeding lemmas between B and A: those in B's region that can reach A.
        rev: dict[str, list[str]] = {}
        for x in region | {b}:
            for d in deps[x]:
                if d in region or d in landmarks:
                    rev.setdefault(d, []).append(x)
        feeding, chains = [], []
        for a in tunnels[b]:
            fed: set[str] = set()
            q = deque([a])
            while q:
                y = q.popleft()
                for x in rev.get(y, ()):
                    if x in region and x not in fed:
                        fed.add(x)
                        q.append(x)
            feeding.append(len(fed))
            chains.append(longest_chain(b, a, fed, deps))
        order = sorted(range(len(tunnels[b])), key=lambda i: tunnels[b][i])
        out[b] = {
            "deps": [tunnels[b][i] for i in order],
            "feeding_lemmas": [feeding[i] for i in order],
            "chain": [chains[i] for i in order],
        }
    return out


def longest_chain(b: str, a: str, fed: set[str], deps: dict[str, list[str]]) -> list[str]:
    """The longest citation path from B down to A through the feeding lemmas, as the statements
    strictly between them, ordered from A's end to B's end. Ties go to the smaller label, so the
    same data always gives the same chain."""
    allowed = fed | {a}
    length: dict[str, int] = {a: 0}
    nxt: dict[str, str] = {}

    def walk(x: str) -> int:
        stack = [(x, False)]
        while stack:
            y, done = stack.pop()
            if y in length:
                continue
            kids = [d for d in deps[y] if d in allowed]
            if not done:
                stack.append((y, True))
                stack.extend((d, False) for d in kids if d not in length)
                continue
            best = max(kids, key=lambda d: (length[d], [-ord(c) for c in d]))
            length[y] = length[best] + 1
            nxt[y] = best
        return length[x]

    walk(b)
    path = []
    y = nxt[b]
    while y != a:
        path.append(y)
        y = nxt[y]
    return path[::-1]


def run() -> None:
    st = read_stage("extract")["statements"]
    landmarks = {lm["label"] for lm in read_stage("curate")["landmarks"]}
    deps = {k: v["deps"] for k, v in st.items()}
    cfg = config()["collapse"]
    out = collapse(deps, landmarks, cfg.get("transitive_reduction", True))
    write_stage("collapse", out)
    n = sum(len(v["deps"]) for v in out.values())
    print(f"collapse: {len(out)} landmarks joined by {n} tunnels")
