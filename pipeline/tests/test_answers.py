"""While a moment is open, nothing the visitor can read says its answer.

Each moment in config.yaml lists `never_show` phrases: the answer to what Trurl will ask. This checks the
sources of everything the visitor reads about the number theory plane: the plane's own texts, Trurl's
questions, and the lines the app shows while a moment is open. (e2e/cathedral.spec.ts scans what the
app really puts on screen.) The phrases are checked to have teeth: the lines that do hold the answer
match them, so a phrase that matched nothing would be noticed.
"""

import re

import pytest

from pipeline.files import config
from pipeline.pathways import build as build_pathways
from pipeline.plane_nt import build as build_plane

CFG = config()["cathedral"]
PLANE = build_plane(config()["number_theory_plane"])
TEXTS = {t["id"]: t["text"] for t in PLANE["texts"]}
MOMENTS = {m["id"]: m for pw in CFG["pathways"] for s in pw["stretches"] for m in s["moments"]}
OPEN_TEXTS = ["arrive_open", "road_open", "plaza_open"]


def hits(patterns: list[str], text: str) -> list[str]:
    return [p for p in patterns if re.search(p, text, re.IGNORECASE)]


def test_every_moment_lists_what_must_never_be_shown():
    for mid, m in MOMENTS.items():
        assert m["never_show"], mid
        for p in m["never_show"]:
            re.compile(p)


@pytest.mark.parametrize("mid", sorted(MOMENTS))
def test_the_question_does_not_contain_its_answer(mid):
    assert hits(MOMENTS[mid]["never_show"], MOMENTS[mid]["question"]) == []


@pytest.mark.parametrize("text_id", OPEN_TEXTS)
def test_the_lines_shown_while_a_moment_is_open_contain_no_answer(text_id):
    for mid, m in MOMENTS.items():
        assert hits(m["never_show"], TEXTS[text_id]) == [], f"{text_id} says the answer to {mid}"
    # nor does it give a stack away: "12 = 2² · 3"
    assert not re.search(r"\d+\s*=\s*\d", TEXTS[text_id])


def test_the_phrases_have_teeth_the_lines_that_hold_the_answer_match_them():
    assert hits(MOMENTS["nt-1-road"]["never_show"], TEXTS["arrive"])
    assert hits(MOMENTS["nt-1-sieve"]["never_show"], TEXTS["plaza"])
    assert hits(MOMENTS["nt-1-sieve"]["never_show"], TEXTS["sieve_note"])
    assert re.search(r"\d+\s*=\s*\d", TEXTS["road"])  # the full road text names stacks


def test_a_question_that_gives_the_answer_fails_the_build():
    import copy

    bad = copy.deepcopy(CFG)
    nt = next(p for p in bad["pathways"] if p["plane"] == "number-theory")
    nt["stretches"][0]["moments"][0]["question"] = "Is it true that every number is built from primes in exactly one way?"
    deps = {i: [] for i in ["df-prm", "1arith", "ablfac", "pnt", "euclemma", "sylow1", "ramsey", "konigsberg", "df-lmod", "df-trkg", "bwth", "evth", "ax-mp", "ax-ext", "ax-inf"]}
    deps.update({"euclemma": ["df-prm"], "1arith": ["euclemma"], "pnt": ["1arith"], "sylow1": ["euclemma"], "ablfac": ["sylow1"]})
    with pytest.raises(SystemExit, match="answer"):
        build_pathways(bad, deps, sorted(p["id"] for p in CFG["planes"]))
