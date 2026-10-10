"""Every tunnel in the built mine, checked against the FULL set.mm graph.

Recomputed here independently of pipeline/collapse.py, from opposite directions:

  - A tunnel B -> A is real: A is in B's transitive dependency closure in the full graph, through
    a path whose intermediate statements are all non-landmarks.
  - feeding_lemmas is exact: the collapsed statements of the tunnel are those reachable from B
    without passing a landmark (a forward search from B) that can also reach A without passing
    a landmark (a backward search from A). Their count must equal feeding_lemmas.
  - chain is a real citation path from A's end to B's (each statement cites the one before it),
    made of the tunnel's feeding lemmas, with depth rising strictly along it, no longer than the
    depth difference allows, and as long as the longest path through the feeding lemmas.
  - Reduction is minimal: no tunnel B -> A is implied by B's other tunnels.
  - Nothing is lost: every landmark B rests on is reached through its tunnels.

Runs on pipeline/build/ (`python -m pipeline` first). In CI a missing build is a failure.
"""

import os
from collections import deque

import pytest

from pipeline.files import stage_file
from pipeline.files import read_stage

BUILT = all(stage_file(s).exists() for s in ("extract", "curate", "collapse"))
pytestmark = pytest.mark.skipif(not BUILT and not os.environ.get("CI"), reason="run `python -m pipeline` first")


@pytest.fixture(scope="module")
def mine():
    st = read_stage("extract")["statements"]
    deps = {k: v["deps"] for k, v in st.items()}
    users: dict[str, list[str]] = {k: [] for k in deps}
    for k, ds in deps.items():
        for d in ds:
            users[d].append(k)
    lms = {lm["label"] for lm in read_stage("curate")["landmarks"]}
    # Depth, recomputed here: longest path from the roots, in file order (a proof cites only
    # earlier statements).
    depth: dict[str, int] = {}
    for k, v in sorted(st.items(), key=lambda kv: kv[1]["order"]):
        depth[k] = 1 + max((depth[d] for d in v["deps"]), default=-1)
    return deps, users, lms, read_stage("collapse"), depth


def walk(start: list[str], nxt: dict[str, list[str]], stop: set[str]) -> tuple[set[str], set[str]]:
    """BFS from `start`; does not pass through `stop`. Returns (non-stop nodes seen, stop nodes met)."""
    seen: set[str] = set()
    met: set[str] = set()
    q = deque(start)
    while q:
        x = q.popleft()
        if x in stop:
            met.add(x)
            continue
        if x in seen:
            continue
        seen.add(x)
        q.extend(nxt[x])
    return seen, met


def closure(b: str, deps: dict[str, list[str]]) -> set[str]:
    seen: set[str] = set()
    stack = list(deps[b])
    while stack:
        x = stack.pop()
        if x not in seen:
            seen.add(x)
            stack.extend(deps[x])
    return seen


def longest(b: str, a: str, fed: set[str], deps: dict[str, list[str]], depth: dict[str, int]) -> int:
    """Edges on the longest path from B to A through `fed`, by DP in depth order (not DFS)."""
    best = {a: 0}
    for x in sorted(fed, key=lambda k: depth[k]) + [b]:
        options = [best[d] + 1 for d in deps[x] if d in best]
        if options:
            best[x] = max(options)
    return best[b]


def test_every_tunnel_is_a_real_dependency_with_exact_feeding_count(mine):
    deps, users, lms, col, _ = mine
    back: dict[str, set[str]] = {}
    wrong = []
    for b, t in col.items():
        forward, met = walk(list(deps[b]), deps, lms)
        full = closure(b, deps)
        for a, feeding in zip(t["deps"], t["feeding_lemmas"]):
            if a not in full:
                wrong.append(f"{b} -> {a}: {a} is not in {b}'s closure")
                continue
            if a not in met:
                wrong.append(f"{b} -> {a}: every path passes another landmark")
                continue
            if a not in back:
                back[a] = walk(list(users[a]), users, lms)[0]
            got = len(forward & back[a])
            if got != feeding:
                wrong.append(f"{b} -> {a}: feeding_lemmas {feeding}, recomputed {got}")
    assert wrong == []


def test_every_chain_is_the_longest_real_path_through_its_tunnel(mine):
    deps, users, lms, col, depth = mine
    back: dict[str, set[str]] = {}
    wrong = []
    for b, t in col.items():
        forward, _ = walk(list(deps[b]), deps, lms)
        for a, chain in zip(t["deps"], t["chain"]):
            path = [a, *chain, b]
            who = f"{b} -> {a}"
            if any(path[i] not in deps[path[i + 1]] for i in range(len(path) - 1)):
                wrong.append(f"{who}: chain is not a citation path")
                continue
            if a not in back:
                back[a] = walk(list(users[a]), users, lms)[0]
            fed = forward & back[a]
            if not set(chain) <= fed:
                wrong.append(f"{who}: chain leaves the feeding lemmas")
            if any(depth[path[i]] >= depth[path[i + 1]] for i in range(len(path) - 1)):
                wrong.append(f"{who}: depth does not rise along the chain")
            if len(chain) + 1 > depth[b] - depth[a]:
                wrong.append(f"{who}: chain of {len(chain) + 1} steps exceeds depth difference {depth[b] - depth[a]}")
            if len(chain) + 1 != longest(b, a, fed, deps, depth):
                wrong.append(f"{who}: chain of {len(chain) + 1} steps, longest path is {longest(b, a, fed, deps, depth)}")
    assert wrong == []


def test_reduction_is_minimal_and_loses_nothing(mine):
    deps, _, lms, col, _ = mine
    tunnels = {b: t["deps"] for b, t in col.items()}
    memo: dict[str, set[str]] = {}

    def up(x: str) -> set[str]:
        if x not in memo:
            s: set[str] = set()
            for d in tunnels[x]:
                s.add(d)
                s |= up(d)
            memo[x] = s
        return memo[x]

    redundant = [(b, a) for b, ts in tunnels.items() for a in ts if any(a in up(o) for o in ts if o != a)]
    assert redundant == []
    lost = [b for b in tunnels if (closure(b, deps) & lms) != up(b)]
    assert lost == []
