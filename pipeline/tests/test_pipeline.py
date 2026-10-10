from pathlib import Path

import pytest

from pipeline.collapse import collapse
from pipeline.curate import select
from pipeline.depth import depths
from pipeline.export import source_text
from pipeline.extract import parse, to_stage
from pipeline.latex import Translator
from pipeline.layout import layout
from pipeline.validate import check

MINI = (Path(__file__).parent / "fixtures" / "mini.mm").read_text(encoding="utf8")


@pytest.fixture(scope="module")
def ex():
    return to_stage(parse(MINI))


def test_extract_kinds_and_parts(ex):
    st = ex["statements"]
    assert {k: v["kind"] for k, v in st.items()} == {
        "ax-one": "axiom",
        "ax-mp": "axiom",
        "df-thing": "definition",
        "th1": "theorem",
        "th2": "theorem",
        "th3": "theorem",
        "th4": "theorem",
        "th5": "theorem",
        "idt": "theorem",
    }
    assert "wi" not in st  # syntax is grammar, not a node
    assert ex["parts"] == ["(before the first part)", "FIRST PART", "SECOND PART"]
    assert st["th3"]["part"] == 2


def test_extract_citations_drop_syntax_and_hypotheses(ex):
    st = ex["statements"]
    assert st["th1"]["deps"] == ["ax-one", "ax-mp"]  # duplicates collapse, wph/wi dropped
    assert st["th2"]["deps"] == ["th1", "df-thing"]  # compressed: labels in ( ), wi dropped
    assert st["idt"]["deps"] == []  # its own hypothesis is not a citation


def test_extract_hypotheses_and_latex(ex):
    st = ex["statements"]
    assert st["ax-mp"]["hyps"] == [["|-", "ph"], ["|-", "(", "ph", "->", "ps", ")"]]
    assert st["th3"]["hyps"] == []  # scope closed
    assert ex["latexdefs"]["ps"] == r"\psi"  # single-quoted
    assert ex["latexdefs"]["ch"] == r"\chi"  # concatenated with +
    tex = Translator(ex["latexdefs"]).with_hyps(st["ax-mp"]["hyps"], st["ax-mp"]["concl"])
    assert tex == r"\begin{array}{c} \varphi \\ \left( \varphi \rightarrow \psi \right) \\ \hline \psi \end{array}"
    assert source_text(st["ax-mp"]) == "|- ph   &   |- ( ph -> ps )   =>   |- ps"


def test_extract_rejects_unknown_citation():
    with pytest.raises(ValueError, match="nope"):
        parse(MINI.replace("( th2 ) AB", "( nope ) AB"))


def test_validate_passes_and_catches_problems(ex):
    st = ex["statements"]
    assert check(st) == []
    bad = {k: dict(v) for k, v in st.items()}
    bad["th1"] = {**bad["th1"], "deps": ["th5"]}  # cites something later: a possible cycle
    assert any("does not come before" in e for e in check(bad))
    lone = {k: dict(v) for k, v in st.items()}
    lone["th6"] = {"kind": "theorem", "order": 99, "part": 2, "hyps": [], "concl": ["|-"], "deps": ["th7"]}
    lone["th7"] = {"kind": "theorem", "order": 98, "part": 2, "hyps": [], "concl": ["|-"], "deps": ["th8"]}
    lone["th8"] = {"kind": "theorem", "order": 97, "part": 2, "hyps": [], "concl": ["|-"], "deps": ["th9"]}
    lone["th9"] = {"kind": "theorem", "order": 96, "part": 2, "hyps": [], "concl": ["|-"], "deps": ["missing"]}
    assert any("not in the graph" in e for e in check(lone))


CFG = {
    "subjects": [
        {"id": "a", "name": "A", "parts": ["(before the first part)", "FIRST PART"]},
        {"id": "b", "name": "B", "parts": ["SECOND PART"]},
    ],
    "axiom_subjects": ["a"],
}


def test_curate_adds_axioms_and_rejects_bad_labels(ex):
    picked = select(ex, CFG, [{"label": "th5", "name": "Five"}, {"label": "th3", "name": "Three", "subject": "a"}])
    labels = [p["label"] for p in picked]
    assert labels == ["th5", "th3", "ax-one", "ax-mp"]
    assert picked[0]["subject"] == "b" and picked[1]["subject"] == "a"
    with pytest.raises(SystemExit, match="not a statement"):
        select(ex, CFG, [{"label": "nope", "name": "x"}])
    with pytest.raises(SystemExit, match="axiom"):
        select(ex, CFG, [{"label": "ax-one", "name": "x"}])
    with pytest.raises(SystemExit, match="twice"):
        select(ex, CFG, [{"label": "th3", "name": "x"}, {"label": "th3", "name": "y"}])


def test_collapse_hides_lemmas_and_reduces(ex):
    deps = {k: v["deps"] for k, v in ex["statements"].items()}
    lm = {"th5", "th4", "th2", "ax-one", "ax-mp"}
    out = collapse(deps, lm, reduce=False)
    # th4 -> th3 (collapsed) -> th2: one feeding lemma, and it is the chain
    assert dict(zip(out["th4"]["deps"], out["th4"]["feeding_lemmas"])) == {"ax-mp": 0, "th2": 1}
    assert dict(zip(out["th4"]["deps"], out["th4"]["chain"])) == {"ax-mp": [], "th2": ["th3"]}
    assert out["th5"]["deps"] == ["th2", "th4"]
    red = collapse(deps, lm, reduce=True)
    assert red["th5"]["deps"] == ["th4"]  # th2 is reached through th4
    # th2 -> th1 (collapsed) -> ax-one, ax-mp
    assert dict(zip(red["th2"]["deps"], red["th2"]["feeding_lemmas"])) == {"ax-mp": 1, "ax-one": 1}
    assert red["th2"]["chain"] == [["th1"], ["th1"]]


def test_depth_is_longest_path(ex):
    d = depths(ex["statements"])
    assert d["ax-one"] == 0 and d["df-thing"] == 0
    assert d["th1"] == 1 and d["th2"] == 2 and d["th3"] == 3 and d["th4"] == 4 and d["th5"] == 5
    assert d["idt"] == 0


def test_layout_is_deterministic_spaced_and_fixed_in_height():
    nodes = [{"subject": "a" if i % 3 else "b", "depth": i % 4} for i in range(40)]
    edges = [(i, i - 1) for i in range(1, 40) if (i % 4)]
    p = {"metres_per_depth": 0.5, "inner_radius": 2, "outer_radius": 12, "min_spacing": 1.5, "iterations": 120, "seed": 3}
    a = layout(nodes, edges, ["a", "b"], p)
    b = layout(nodes, edges, ["a", "b"], p)
    assert (a == b).all()
    assert all(a[i][1] == -0.5 * nodes[i]["depth"] for i in range(40))
    import math

    closest = min(math.dist(a[i][[0, 2]], a[j][[0, 2]]) for i in range(40) for j in range(i) if nodes[i]["depth"] == nodes[j]["depth"])
    assert closest > 1.4
