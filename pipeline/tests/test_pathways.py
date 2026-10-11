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
        ids.update(pw["entry_requires"])
        for s in pw["stretches"]:
            ids.update(s["landmarks"])
            for m in s["moments"]:
                ids.update(m["earns"])
    return ids


IDS = every_id(CFG) | {"extra-landmark"}


@pytest.fixture(scope="module")
def pathways():
    return build(CFG, IDS, PLANES)


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
        build(CFG, IDS - {"1arith"}, PLANES)


def test_unknown_entry_requires_id_fails_the_build():
    with pytest.raises(SystemExit, match="ramsey"):
        build(CFG, IDS - {"ramsey"}, PLANES)


def test_unknown_earns_id_fails_the_build():
    bad = copy.deepcopy(CFG)
    nt = next(p for p in bad["pathways"] if p["plane"] == "number-theory")
    nt["stretches"][0]["moments"][0]["earns"] = ["no-such-label"]
    with pytest.raises(SystemExit, match="no-such-label"):
        build(bad, IDS, PLANES)


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
        build(bad, IDS, PLANES)


def test_only_number_theory_has_no_entry_requirement(pathways):
    free = [p["plane"] for p in pathways["pathways"] if not p["entry_requires"]]
    assert free == ["number-theory"]


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
        build(bad, IDS, PLANES)


def test_a_door_without_a_pathway_fails_the_build():
    bad = copy.deepcopy(CFG)
    bad["pathways"] = [p for p in bad["pathways"] if p["plane"] != "topology"]
    with pytest.raises(SystemExit, match="topology"):
        build(bad, IDS, PLANES)


def test_rubrics_do_not_leak_into_the_pathway_file(pathways):
    # a rubric is Trurl's private judging note; it travels in grounding.json, not to the client
    assert "rubric" not in json.dumps(pathways)


def test_pathways_are_deterministic_and_order_independent(pathways):
    a = canonical(pathways)
    assert canonical(build(CFG, IDS, PLANES)) == a
    shuffled = copy.deepcopy(CFG)
    random.Random(5).shuffle(shuffled["pathways"])
    assert canonical(build(shuffled, IDS, list(reversed(PLANES)))) == a


def test_output_validates_against_schema(pathways):
    schema = json.loads((ROOT / "docs" / "schemas" / "pathways.schema.json").read_text(encoding="utf8"))
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(json.loads(json.dumps(pathways))))
    assert not errors, errors[:3]
