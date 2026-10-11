"""What Trurl may say about mathematics (pipeline/grounding.py -> data/grounding.json).

Built from a hand-made graph and comments so no set.mm is needed. The real data is checked in
worker/test (every moment and landmark exists in pathways.json and graph.json).
"""

import copy
import json

import pytest
from jsonschema import Draft202012Validator

from pipeline.files import ROOT, config
from pipeline.grounding import build, clean_comment
from pipeline.pathways import build as build_pathways

CFG = config()["cathedral"]


def node(i: str, **over) -> dict:
    n = {
        "id": i,
        "kind": "theorem",
        "name": f"Name of {i}",
        "statement": f"\\vdash {i}",
        "source": f"|- {i}",
        "display": "",
        "display_reviewed": False,
        "note": "",
    }
    n.update(over)
    return n


def world():
    nodes = {i: node(i) for i in ("df-prm", "1arith", "ramsey", "ax-mp", "efipi", "konigsberg", "df-lmod", "df-trkg", "bwth", "evth", "ax-ext", "ax-inf")}
    comments = {i: f"Set.mm says something true about {i}. (Contributed by A. Person, 1-Jan-2020.)" for i in nodes}
    return nodes, comments, {}


@pytest.fixture(scope="module")
def grounding():
    nodes, comments, notes = world()
    return build(CFG, nodes, comments, notes)


def test_landmarks_are_exactly_those_of_the_stretches(grounding):
    assert sorted(grounding["landmarks"]) == ["1arith", "df-prm"]


def test_each_landmark_carries_the_verified_statement(grounding):
    e = grounding["landmarks"]["1arith"]
    assert e["statement"] == "\\vdash 1arith" and e["source"] == "|- 1arith"
    assert e["comment"] == "Set.mm says something true about 1arith."
    assert e["kind"] == "theorem" and e["name"] == "Name of 1arith"


def test_an_unreviewed_display_form_is_left_out():
    nodes, comments, notes = world()
    nodes["1arith"].update(display="M : \\mathbb{N} \\to R", display_reviewed=False)
    assert "display" not in build(CFG, nodes, comments, notes)["landmarks"]["1arith"]


def test_a_reviewed_display_form_is_included():
    nodes, comments, notes = world()
    nodes["1arith"].update(display="M : \\mathbb{N} \\to R", display_reviewed=True)
    assert build(CFG, nodes, comments, notes)["landmarks"]["1arith"]["display"] == "M : \\mathbb{N} \\to R"


def test_a_reviewed_note_is_included_without_its_front_matter_and_no_note_means_no_field():
    nodes, comments, _ = world()
    note = "---\nlabel: 1arith\nreviewed: true\nreviewer: D\n---\nEvery number is built from primes in one way.\n"
    g = build(CFG, nodes, comments, {"1arith": note})
    assert g["landmarks"]["1arith"]["note"] == "Every number is built from primes in one way."
    assert "note" not in g["landmarks"]["df-prm"]


APPROVED = {
    "nt-1-road": "The visitor says, in their own words, that every whole number above 1 is built from primes in exactly one way, apart from order, for example by pointing at a stack such as 12 = 2 · 2 · 3.",
    "nt-1-sieve": "The visitor says, in their own words, that a prime is a whole number greater than 1 whose only divisors are 1 and itself, or recognizes that the numbers left standing are exactly those. Why the sieve stops after 7 (every composite up to 100 has a prime factor of at most 7) is a bonus Trurl may draw out, not a requirement.",
}


def configured_moments(cfg):
    nt = next(p for p in cfg["pathways"] if p["plane"] == "number-theory")
    return {m["id"]: m for s in nt["stretches"] for m in s["moments"]}


def test_every_moment_of_the_pathways_is_here_with_a_rubric(grounding):
    nodes, _, _ = world()
    pw = build_pathways(CFG, set(nodes), sorted(p["id"] for p in CFG["planes"]))
    want = {m["id"]: (p["plane"], s["id"], m["earns"]) for p in pw["pathways"] for s in p["stretches"] for m in s["moments"]}
    assert set(grounding["moments"]) == set(want)
    for mid, (plane, stretch, earns) in want.items():
        m = grounding["moments"][mid]
        assert (m["plane"], m["stretch"], m["earns"]) == (plane, stretch, earns)
        assert m["rubric"].strip() and isinstance(m["rubric_reviewed"], bool)
        assert set(m["earns"]) <= set(m["landmarks"])


def test_the_two_approved_rubrics_are_the_owners_exact_words_and_flagged_reviewed(grounding):
    for mid, text in APPROVED.items():
        assert grounding["moments"][mid]["rubric"] == text
        assert grounding["moments"][mid]["rubric_reviewed"] is True


def test_the_build_copies_the_flag_and_a_missing_flag_is_a_draft():
    bad = copy.deepcopy(CFG)
    moments = configured_moments(bad)
    del moments["nt-1-road"]["rubric_reviewed"]
    moments["nt-1-sieve"]["rubric_reviewed"] = False
    nodes, comments, notes = world()
    g = build(bad, nodes, comments, notes)
    assert g["moments"]["nt-1-road"]["rubric_reviewed"] is False
    assert g["moments"]["nt-1-sieve"]["rubric_reviewed"] is False


def test_a_flag_that_is_not_true_or_false_fails_the_build():
    bad = copy.deepcopy(CFG)
    configured_moments(bad)["nt-1-road"]["rubric_reviewed"] = "yes"
    nodes, comments, notes = world()
    with pytest.raises(SystemExit, match="nt-1-road"):
        build(bad, nodes, comments, notes)


def test_planes_carry_their_names(grounding):
    assert grounding["planes"]["number-theory"] == "Number theory"
    assert len(grounding["planes"]) == 12


def test_a_moment_without_a_rubric_fails_the_build():
    bad = copy.deepcopy(CFG)
    nt = next(p for p in bad["pathways"] if p["plane"] == "number-theory")
    del nt["stretches"][0]["moments"][0]["rubric"]
    nodes, comments, notes = world()
    with pytest.raises(SystemExit, match="nt-1-road"):
        build(bad, nodes, comments, notes)


def test_a_landmark_missing_from_the_graph_fails_the_build():
    nodes, comments, notes = world()
    del nodes["1arith"]
    with pytest.raises(SystemExit, match="1arith"):
        build(CFG, nodes, comments, notes)


def test_a_landmark_without_a_set_mm_comment_fails_the_build():
    nodes, comments, notes = world()
    del comments["df-prm"]
    with pytest.raises(SystemExit, match="df-prm"):
        build(CFG, nodes, comments, notes)


def test_clean_comment_drops_credits_but_keeps_the_statement_of_fact():
    raw = "Fundamental theorem of arithmetic, where  a prime\n factorization ` R ` is used.  (Contributed by Paul Chapman, 17-Nov-2012.)  (Proof shortened by Mario Carneiro, 30-May-2014.)"
    assert clean_comment(raw) == "Fundamental theorem of arithmetic, where a prime factorization ` R ` is used."
    assert clean_comment("Define the set of prime numbers. (Contributed by Paul Chapman, 22-Jun-2011.)") == "Define the set of prime numbers."


def test_build_is_deterministic(grounding):
    nodes, comments, notes = world()
    assert json.dumps(build(CFG, nodes, comments, notes), sort_keys=True) == json.dumps(grounding, sort_keys=True)


def test_output_validates_against_schema(grounding):
    schema = json.loads((ROOT / "docs" / "schemas" / "grounding.schema.json").read_text(encoding="utf8"))
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(json.loads(json.dumps(grounding))))
    assert not errors, errors[:3]
