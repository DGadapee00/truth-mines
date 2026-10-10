"""set.mm statements as LaTeX, built on set.mm's own typesetting (`latexdef` in its `$t` comment).

Symbol by symbol, set.mm's latexdefs give flat text: `( F ` A )` comes out as "( F ‘ A )" and
`( 1 (,) +oo )` as "( 1 (,) +∞ )". This module parses the statement first. set.mm brackets every
binary operation and every function application, so `(` … `)` groups give the structure, and a
group of three, `( X op Y )`, is read by its middle symbol:

  ( F ` A )            F(A), with special forms for √, |·|, !, conjugate, exp and set size
  ( A (,) B ) etc.     intervals (A, B), [A, B], [A, B), (A, B]
  ( M ... N )          {M, …, N}
  ( A / B )            a fraction
  ( A ^ B )            a power

Anything else keeps its brackets. Each symbol's own LaTeX is set.mm's latexdef, with the
overrides in config.yaml.
"""

from __future__ import annotations

from dataclasses import dataclass

INTERVALS = {"(,)": ("(", ")"), "[,]": ("[", "]"), "[,)": ("[", ")"), "(,]": ("(", "]")}


@dataclass
class Group:
    items: list  # of str and Group


def parse(symbols: list[str]) -> list:
    """Nest the symbols by ( and ). Unbalanced brackets fall back to a flat list."""
    stack: list[list] = [[]]
    for s in symbols:
        if s == "(":
            stack.append([])
        elif s == ")":
            if len(stack) == 1:
                return list(symbols)
            items = stack.pop()
            stack[-1].append(Group(items))
        else:
            stack[-1].append(s)
    if len(stack) != 1:
        return list(symbols)
    return stack[0]


class Translator:
    def __init__(self, defs: dict[str, str]):
        self.defs = defs

    def sym(self, s: str) -> str:
        return self.defs[s]

    def node(self, x, bare: bool = False) -> str:
        """One item. `bare`: a group without its own outer brackets (inside f(…), a fraction, …)."""
        if isinstance(x, str):
            return self.sym(x)
        return self.group(x.items, bare)

    def seq(self, items: list) -> str:
        return " ".join(self.node(i) for i in items)

    def group(self, items: list, bare: bool = False) -> str:
        if len(items) == 3 and isinstance(items[1], str):
            a, op, b = items
            if op == "`":
                return self.apply(a, b)
            if op in INTERVALS:
                lo, hi = INTERVALS[op]
                return rf"\left{lo} {self.node(a, True)}, {self.node(b, True)} \right{hi}"
            if op == "...":
                return rf"\{{ {self.node(a, True)}, \ldots, {self.node(b, True)} \}}"
            if op == "/":
                return rf"\frac{{{self.node(a, True)}}}{{{self.node(b, True)}}}"
            if op == "^":
                base = self.node(a)
                return rf"{{{base}}}^{{{self.node(b, True)}}}"
        inner = self.seq(items)
        return inner if bare else rf"\left( {inner} \right)"

    def apply(self, f, x) -> str:
        arg = self.node(x, True)
        if isinstance(f, str):
            if f == "sqrt":
                return rf"\sqrt{{{arg}}}"
            if f == "abs":
                return rf"\left\lvert {arg} \right\rvert"
            if f == "#":
                return rf"\left\lvert {arg} \right\rvert"
            if f == "*":
                return rf"\overline{{{arg}}}"
            if f == "exp":
                return rf"e^{{{arg}}}"
            if f == "!":
                return f"{self.node(x)}!" if isinstance(x, Group) and not _is_atomic(x) else f"{arg}!"
        return rf"{self.node(f)}\left( {arg} \right)"

    def statement(self, symbols: list[str]) -> str:
        body = symbols[1:] if symbols and symbols[0] == "|-" else symbols
        return self.seq(parse(body))

    def with_hyps(self, hyps: list[list[str]], concl: list[str]) -> str:
        """Hypotheses above a rule, the conclusion below: how inference rules are written."""
        c = self.statement(concl)
        if not hyps:
            return c
        rows = r" \\ ".join(self.statement(h) for h in hyps)
        return rf"\begin{{array}}{{c}} {rows} \\ \hline {c} \end{{array}}"


def _is_atomic(g: Group) -> bool:
    """A group whose rendering is already a single unit (an application, a fraction …)."""
    return len(g.items) == 3 and isinstance(g.items[1], str) and g.items[1] in ("`", "/", "^", *INTERVALS)
