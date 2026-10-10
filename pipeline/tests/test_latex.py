from pipeline.latex import Translator, parse

DEFS = {
    "(": "(", ")": ")", "`": "`", "(,)": "(,)", "[,]": "[,]", "...": "...", "/": "/", "^": "^",
    "F": "F", "A": "A", "B": "B", "x": "x", "1": "1", "2": "2", "N": "N", "+oo": r"+\infty",
    "+": "+", "sqrt": r"\surd", "abs": "abs", "!": "!", "exp": r"\exp", "e.": r"\in", "QQ": r"\mathbb{Q}",
    "e/": r"\notin", "=": "=", "ppi": r"\pi", "log": r"\log", "|-": r"\vdash", "ph": r"\varphi", "->": r"\rightarrow",
}
T = Translator(DEFS)


def tex(s: str) -> str:
    return T.statement(s.split())


def test_parse_nests_brackets():
    g = parse("( F ` A )".split())
    assert len(g) == 1 and g[0].items == ["F", "`", "A"]
    assert parse("( A".split()) == ["(", "A"]  # unbalanced: left flat


def test_function_application():
    assert tex("|- ( F ` A ) = 1") == r"F\left( A \right) = 1"
    assert tex("( ppi ` x )") == r"\pi\left( x \right)"
    assert tex("( F ` ( A + B ) )") == r"F\left( A + B \right)"  # no double brackets
    assert tex("( log ` ( F ` x ) )") == r"\log\left( F\left( x \right) \right)"


def test_special_functions():
    assert tex("( sqrt ` 2 ) e/ QQ") == r"\sqrt{2} \notin \mathbb{Q}"
    assert tex("( abs ` A )") == r"\left\lvert A \right\rvert"
    assert tex("( exp ` A )") == "e^{A}"
    assert tex("( ! ` N )") == "N!"
    assert tex("( ! ` ( N + 1 ) )") == r"\left( N + 1 \right)!"


def test_intervals_ranges_fractions_powers():
    assert tex("( 1 (,) +oo )") == r"\left( 1, +\infty \right)"
    assert tex("( A [,] B )") == r"\left[ A, B \right]"
    assert tex("( 1 ... N )") == r"\{ 1, \ldots, N \}"
    assert tex("( A / B )") == r"\frac{A}{B}"
    assert tex("( A ^ 2 )") == "{A}^{2}"
    assert tex("( ( A + B ) ^ 2 )") == r"{\left( A + B \right)}^{2}"


def test_other_groups_keep_brackets():
    assert tex("( ph -> ph )") == r"\left( \varphi \rightarrow \varphi \right)"


def test_hypotheses_sit_above_a_rule():
    out = T.with_hyps([["|-", "ph"]], ["|-", "ph"])
    assert out == r"\begin{array}{c} \varphi \\ \hline \varphi \end{array}"
