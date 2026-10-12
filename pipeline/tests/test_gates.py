"""Every door's gate, re-derived from set.mm itself.

pipeline/pathways.py derives each gate from data/graph.json, which is the pipeline's own collapse of
set.mm. This test does not trust that. It reads the pinned set.mm text, finds each theorem's proof
with its own small parser (no code from pipeline/extract.py or collapse.py), follows every label a
proof cites, and checks that the gate in data/pathways.json is exactly the set of ideas on the map
that the gated idea rests on: none missing, none extra. Planes with no gate are checked the same way:
the first idea they would start from must rest on nothing on the map.

Needs `python -m pipeline` to have run (the pinned set.mm and data/pathways.json).
"""

import io
import json
import re
from contextlib import redirect_stdout

import pytest

from pipeline import __main__ as cli
from pipeline.fetch import source_path
from pipeline.files import DATA, config

_COMMENT = re.compile(r"\$\(.*?\$\)", re.DOTALL)
_PROOF = re.compile(r"(?<!\S)(\S+)\s+\$p\s.*?\$=\s(.*?)\$\.", re.DOTALL)


@pytest.fixture(scope="module")
def cited() -> dict[str, set[str]]:
    """label -> every label its proof cites (hypotheses and grammar included: they are harmless leaves)."""
    path = source_path()
    if not path.exists():
        pytest.fail("the pinned set.mm is missing: run `python -m pipeline` first")
    text = _COMMENT.sub(" ", path.read_text(encoding="utf8"))
    proofs: dict[str, set[str]] = {}
    for m in _PROOF.finditer(text):
        label, proof = m.group(1), m.group(2).strip()
        if proof.startswith("("):  # compressed: the labels between the parentheses
            labels = proof[1 : proof.index(")")].split()
        else:  # plain: every token is a label (or ? for an unfinished step)
            labels = [t for t in proof.split() if t != "?"]
        proofs[label] = set(labels)
    assert len(proofs) > 40000, "set.mm should hold tens of thousands of proofs"
    return proofs


def rests_on(label: str, cited: dict[str, set[str]]) -> set[str]:
    """Everything `label` depends on, however deeply, by following the proofs."""
    seen: set[str] = set()
    stack = [label]
    while stack:
        for c in cited.get(stack.pop(), ()):
            if c not in seen:
                seen.add(c)
                stack.append(c)
    return seen


@pytest.fixture(scope="module")
def pathways() -> dict:
    path = DATA / "pathways.json"
    if not path.exists():
        pytest.fail("data/pathways.json is missing: run `python -m pipeline` first")
    return json.loads(path.read_text(encoding="utf8"))


@pytest.fixture(scope="module")
def on_map(pathways) -> set[str]:
    return {lid for p in pathways["pathways"] for s in p["stretches"] for lid in s["landmarks"]}


def test_the_parser_finds_the_proofs_it_should(cited):
    # a few facts about set.mm that anyone can check by reading it with `python -m pipeline show`
    assert "euclemma" in rests_on("1arith", cited)
    assert "df-prm" in rests_on("euclemma", cited)
    assert "ax-mp" in rests_on("mpd", cited)
    assert rests_on("df-prm", cited) == set()  # a definition is asserted, not proved


def gate_errors(pathways: dict, on_map: set[str], cited: dict[str, set[str]]) -> list[str]:
    errors = []
    for p in pathways["pathways"]:
        if p["gated_on"] is None:
            continue
        truth = (rests_on(p["gated_on"], cited) & on_map) - {p["gated_on"]}
        if set(p["entry_requires"]) != truth or len(p["entry_requires"]) != len(set(p["entry_requires"])):
            errors.append(f"{p['plane']}: gate {p['entry_requires']}, set.mm says {sorted(truth)}")
    return errors


def test_every_gate_is_exactly_what_its_idea_truly_rests_on_among_the_ideas_on_the_map(pathways, on_map, cited):
    assert gate_errors(pathways, on_map, cited) == []
    assert sum(1 for p in pathways["pathways"] if p["gated_on"]) >= 3  # number theory, algebra and complex numbers


def test_the_check_has_teeth_an_extra_a_missing_or_a_wrong_idea_is_found(pathways, on_map, cited):
    def with_gate(plane: str, gate):
        bad = json.loads(json.dumps(pathways))
        next(p for p in bad["pathways"] if p["plane"] == plane)["entry_requires"] = gate
        return gate_errors(bad, on_map, cited)

    assert with_gate("algebra-symmetry", ["1arith", "df-prm"])  # the old, false gate
    assert with_gate("algebra-symmetry", [])  # missing
    assert with_gate("complex-numbers", ["df-prm"])  # missing 1arith
    assert with_gate("number-theory", ["df-prm"])  # an idea gated on itself
    assert with_gate("complex-numbers", ["1arith", "df-prm", "1arith"])  # repeated


def test_no_gate_is_written_where_the_idea_rests_on_something_on_the_map(pathways, on_map, cited):
    cfg = {p["plane"]: p for p in config()["cathedral"]["pathways"]}
    for p in pathways["pathways"]:
        if p["gated_on"] is not None:
            continue
        pw = cfg[p["plane"]]
        assert p["entry_requires"] is None and not p["stretches"]
        assert pw["no_gate"].strip()
        assert not (rests_on(pw["first_idea"], cited) & on_map), f"{p['plane']}: {pw['first_idea']} rests on an idea on the map, so the door has a true gate"


def test_the_algebra_door_is_not_gated_on_unique_factorization(pathways, cited):
    """The review's finding: the fundamental theorem of finite abelian groups does not rest on 1arith."""
    assert "1arith" not in rests_on("ablfac", cited)
    algebra = next(p for p in pathways["pathways"] if p["plane"] == "algebra-symmetry")
    assert algebra["entry_requires"] == ["df-prm"]
    assert "df-prm" in rests_on("ablfac", cited)


def test_the_complex_numbers_door_rests_on_both_prime_ideas(pathways, cited):
    complex_ = next(p for p in pathways["pathways"] if p["plane"] == "complex-numbers")
    assert complex_["entry_requires"] == ["1arith", "df-prm"]
    assert {"1arith", "df-prm"} <= rests_on("pnt", cited)


@pytest.mark.parametrize("label", ["df-prm", "1arith", "ablfac", "pnt", "euclemma", "sylow1"])
def test_python_m_pipeline_show_knows_every_idea_named(label):
    buf = io.StringIO()
    with redirect_stdout(buf):
        cli.show(label)
    assert buf.getvalue().startswith(label + " (")
