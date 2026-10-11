"""The pathways behind the doors (pipeline/pathways.py).

These check structure against a graph id set, so they run without a build. That the real ids
exist in the real data/graph.json is checked in core/tests/data.test.ts.
"""

import copy
import json
import random

import pytest
from jsonschema import Draft202012Validator

from pipeline.cathedral import build as build_cathedral
from pipeline.files import ROOT, config
from pipeline.pathways import build
from pipeline.plane_nt import build as build_plane

CFG = config()["cathedral"]
PLANES = sorted(p["id"] for p in CFG["planes"])


def every_id(cfg: dict) -> set[str]:
    ids: set[str] = set()
    for pw in cfg["pathways"]:
        ids.update(i for i in (pw.get("gated_on"), pw.get("first_idea")) if i)
        for s in pw["stretches"]:
            ids.update(s["landmarks"])
            for m in s["moments"]:
                ids.update(m["earns"])
    return ids


# A small stand-in for graph.json's dependencies, shaped like the real ones for the ideas that matter:
# df-prm <- euclemma <- 1arith <- pnt, and euclemma <- sylow1 <- ablfac. Every other id rests on nothing.
REAL = {"euclemma": ["df-prm"], "1arith": ["euclemma"], "pnt": ["1arith"], "sylow1": ["euclemma"], "ablfac": ["sylow1"]}
IDS = every_id(CFG) | {"extra-landmark"} | set(REAL) | {d for ds in REAL.values() for d in ds}
DEPS = {i: list(REAL.get(i, [])) for i in IDS}


def nt(cfg: dict) -> dict:
    return next(p for p in cfg["pathways"] if p["plane"] == "number-theory")


def pathway(cfg: dict, plane: str) -> dict:
    return next(p for p in cfg["pathways"] if p["plane"] == plane)


@pytest.fixture(scope="module")
def pathways():
    return build(CFG, DEPS, PLANES)


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False)


def test_every_plane_has_exactly_one_pathway(pathways):
    assert [p["plane"] for p in pathways["pathways"]] == PLANES
    assert len(PLANES) == 12


def test_pathway_planes_are_the_cathedrals_doors(pathways):
    doors = sorted(d["plane"] for d in build_cathedral(CFG)["doors"])
    assert [p["plane"] for p in pathways["pathways"]] == doors


def test_unknown_landmark_id_fails_the_build():
    with pytest.raises(SystemExit, match="1arith"):
        build(CFG, {i: [d for d in ds if d != '1arith'] for i, ds in DEPS.items() if i != '1arith'}, PLANES)


def test_an_unknown_gated_on_or_first_idea_fails_the_build():
    with pytest.raises(SystemExit, match="ablfac"):
        build(CFG, {i: [d for d in ds if d != "ablfac"] for i, ds in DEPS.items() if i != "ablfac"}, PLANES)
    with pytest.raises(SystemExit, match="ramsey"):
        build(CFG, {i: ds for i, ds in DEPS.items() if i != "ramsey"}, PLANES)


def test_unknown_earns_id_fails_the_build():
    bad = copy.deepcopy(CFG)
    nt = next(p for p in bad["pathways"] if p["plane"] == "number-theory")
    nt["stretches"][0]["moments"][0]["earns"] = ["no-such-label"]
    with pytest.raises(SystemExit, match="no-such-label"):
        build(bad, DEPS, PLANES)


def test_earns_are_landmarks_of_their_stretch(pathways):
    for pw in pathways["pathways"]:
        for s in pw["stretches"]:
            for m in s["moments"]:
                assert m["earns"], m["id"]
                assert set(m["earns"]) <= set(s["landmarks"]), m["id"]


def test_an_earn_outside_the_stretch_fails_the_build():
    bad = copy.deepcopy(CFG)
    nt = next(p for p in bad["pathways"] if p["plane"] == "number-theory")
    nt["stretches"][0]["moments"][0]["earns"] = ["extra-landmark"]
    with pytest.raises(SystemExit, match="extra-landmark"):
        build(bad, DEPS, PLANES)


def test_gates_are_derived_from_the_dependencies_among_the_ideas_on_the_map(pathways):
    gates = {p["plane"]: p["entry_requires"] for p in pathways["pathways"]}
    assert gates["number-theory"] == []  # df-prm rests on nothing on the map: the door starts open
    assert gates["algebra-symmetry"] == ["df-prm"]  # ablfac rests on df-prm, through sylow1 and euclemma, and not on 1arith
    assert gates["complex-numbers"] == ["1arith", "df-prm"]
    assert [pl for pl, g in gates.items() if g is None] == [pl for pl in PLANES if pl not in ("number-theory", "algebra-symmetry", "complex-numbers")]


def test_a_gate_written_by_hand_fails_the_build():
    bad = copy.deepcopy(CFG)
    pathway(bad, "algebra-symmetry")["entry_requires"] = ["1arith"]
    with pytest.raises(SystemExit, match="by hand"):
        build(bad, DEPS, PLANES)


def test_the_idea_a_gate_is_derived_from_is_recorded(pathways):
    assert {p["plane"]: p["gated_on"] for p in pathways["pathways"] if p["gated_on"]} == {"number-theory": "df-prm", "algebra-symmetry": "ablfac", "complex-numbers": "pnt"}


def test_a_built_pathway_is_gated_on_the_first_landmark_of_its_first_stretch():
    bad = copy.deepcopy(CFG)
    nt(bad)["gated_on"] = "1arith"
    with pytest.raises(SystemExit, match="first landmark"):
        build(bad, DEPS, PLANES)


def test_an_unbuilt_pathway_gated_on_an_idea_that_rests_on_nothing_on_the_map_fails_the_build():
    bad = copy.deepcopy(CFG)
    pathway(bad, "topology")["gated_on"] = "bwth"
    with pytest.raises(SystemExit, match="empty"):
        build(bad, DEPS, PLANES)


def test_no_gate_must_say_why_and_name_where_the_pathway_would_begin():
    for key, match in (("no_gate", "no_gate"), ("first_idea", "first_idea")):
        bad = copy.deepcopy(CFG)
        del pathway(bad, "topology")[key]
        with pytest.raises(SystemExit, match=match):
            build(bad, DEPS, PLANES)


def test_no_gate_is_refused_where_the_first_idea_does_rest_on_the_map():
    bad = copy.deepcopy(CFG)
    pathway(bad, "topology")["first_idea"] = "pnt"
    with pytest.raises(SystemExit, match="pnt"):
        build(bad, DEPS, PLANES)


def test_a_built_pathway_cannot_be_ungated():
    bad = copy.deepcopy(CFG)
    nt(bad)["gated_on"] = None
    with pytest.raises(SystemExit, match="built"):
        build(bad, DEPS, PLANES)


def test_a_gate_nobody_can_earn_fails_the_build():
    bad = copy.deepcopy(CFG)
    nt(bad)["stretches"][0]["moments"] = [m for m in nt(bad)["stretches"][0]["moments"] if m["id"] != "nt-1-sieve"]
    with pytest.raises(SystemExit, match="df-prm"):
        build(bad, DEPS, PLANES)


def test_nt_stretch_points_at_the_plane_file_and_its_plane(pathways):
    nt = next(p for p in pathways["pathways"] if p["plane"] == "number-theory")
    stretch = nt["stretches"][0]
    assert stretch["plane_data"] == "plane-number-theory.json"
    assert build_plane(config()["number_theory_plane"])["plane"] == nt["plane"]


def test_ids_are_unique_across_pathways(pathways):
    ids = [s["id"] for p in pathways["pathways"] for s in p["stretches"]]
    ids += [m["id"] for p in pathways["pathways"] for s in p["stretches"] for m in s["moments"]]
    assert len(ids) == len(set(ids)) and ids


def test_a_repeated_moment_id_fails_the_build():
    bad = copy.deepcopy(CFG)
    nt = next(p for p in bad["pathways"] if p["plane"] == "number-theory")
    nt["stretches"][0]["moments"][1]["id"] = nt["stretches"][0]["moments"][0]["id"]
    with pytest.raises(SystemExit, match="nt-1-road"):
        build(bad, DEPS, PLANES)


def test_a_door_without_a_pathway_fails_the_build():
    bad = copy.deepcopy(CFG)
    bad["pathways"] = [p for p in bad["pathways"] if p["plane"] != "topology"]
    with pytest.raises(SystemExit, match="topology"):
        build(bad, DEPS, PLANES)


def test_rubrics_do_not_leak_into_the_pathway_file(pathways):
    # a rubric is Trurl's private judging note; it travels in grounding.json, not to the client
    assert "rubric" not in json.dumps(pathways)


def test_pathways_are_deterministic_and_order_independent(pathways):
    a = canonical(pathways)
    assert canonical(build(CFG, DEPS, PLANES)) == a
    shuffled = copy.deepcopy(CFG)
    random.Random(5).shuffle(shuffled["pathways"])
    assert canonical(build(shuffled, DEPS, list(reversed(PLANES)))) == a


def test_output_validates_against_schema(pathways):
    schema = json.loads((ROOT / "docs" / "schemas" / "pathways.schema.json").read_text(encoding="utf8"))
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(json.loads(json.dumps(pathways))))
    assert not errors, errors[:3]
