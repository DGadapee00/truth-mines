"""Stage 5, depth: each landmark's longest path from the roots, in the full graph.

Roots (axioms and definitions) are depth 0; a theorem is one deeper than the deepest statement
its proof cites. Measured on the full graph, not the collapsed one, so a landmark that rests on
a long chain of hidden lemmas sits as deep as that chain.
"""

from __future__ import annotations

from .files import read_stage, write_stage


def depths(statements: dict) -> dict[str, int]:
    d: dict[str, int] = {}
    for label, s in sorted(statements.items(), key=lambda kv: kv[1]["order"]):
        d[label] = 1 + max((d[x] for x in s["deps"]), default=-1)
    return d


def run() -> None:
    st = read_stage("extract")["statements"]
    landmarks = [lm["label"] for lm in read_stage("curate")["landmarks"]]
    d = depths(st)
    write_stage("depth", {"depth": {k: d[k] for k in landmarks}, "max_full": max(d.values()), "all": d})
    print(f"depth: landmarks span depth 0..{max(d[k] for k in landmarks)} (full graph max {max(d.values())})")
