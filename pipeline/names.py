"""Landmark names: inline math between $ signs, and a plain-text form for the 3D labels.

The page renders a name's $…$ parts with KaTeX. The 3D labels cannot typeset TeX, so each name
also gets a plain form: the math converted to Unicode with the small table below. A name whose
math does not convert fails the build, rather than showing TeX source on a label.
"""

from __future__ import annotations

import re

SYMBOLS = {
    r"\varphi": "φ", r"\phi": "φ", r"\psi": "ψ", r"\chi": "χ", r"\pi": "π", r"\omega": "ω", r"\theta": "θ",
    r"\forall": "∀", r"\exists": "∃", r"\exists!": "∃!", r"\to": "→", r"\rightarrow": "→", r"\leftrightarrow": "↔",
    r"\Rightarrow": "⇒", r"\land": "∧", r"\wedge": "∧", r"\lor": "∨", r"\vee": "∨", r"\neg": "¬", r"\lnot": "¬",
    r"\neq": "≠", r"\ne": "≠", r"\le": "≤", r"\leq": "≤", r"\ge": "≥", r"\pm": "±", r"\cdot": "·", r"\times": "×",
    r"\in": "∈", r"\subseteq": "⊆", r"\cup": "∪", r"\cap": "∩", r"\emptyset": "∅", r"\varnothing": "∅",
    r"\circ": "∘", r"\approx": "≈", r"\preccurlyeq": "≼", r"\prec": "≺", r"\langle": "⟨", r"\rangle": "⟩",
    r"\sum": "Σ", r"\prod": "Π", r"\infty": "∞", r"\mid": "|", r"\{": "{", r"\}": "}", r"\ldots": "…",
    r"\mathbb{R}": "ℝ", r"\mathbb{C}": "ℂ", r"\mathbb{N}": "ℕ", r"\mathbb{Q}": "ℚ", r"\mathbb{Z}": "ℤ",
    r"\sqrt{2}": "√2", r"\sqrt": "√", r"\,": " ", r"\;": " ", r"\ ": " ", "-": "−",
}
SUPER = str.maketrans("0123456789+-=()nik", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵏ")


def _sup(m: re.Match) -> str:
    body = m.group(1) or m.group(2)
    out = body.translate(SUPER)
    if any(c not in "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵏ" for c in out):
        return f"^({body})"
    return out


def math_to_plain(tex: str) -> str:
    s = tex
    for k in sorted(SYMBOLS, key=len, reverse=True):
        s = s.replace(k, SYMBOLS[k])
    s = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"\1/\2", s)
    s = re.sub(r"\^\{([^{}]*)\}|\^(.)", _sup, s)
    s = re.sub(r"_\{([^{}]*)\}|_(.)", lambda m: m.group(1) or m.group(2), s)
    s = s.replace("{", "").replace("}", "")
    s = re.sub(r"\s+", " ", s).strip()
    if "\\" in s:
        raise SystemExit(f"names: cannot turn the math {tex!r} into plain text for a label (left {s!r})")
    return s


def plain_label(name: str) -> str:
    parts = name.split("$")
    if len(parts) % 2 == 0:
        raise SystemExit(f"names: unbalanced $ in {name!r}")
    return "".join(math_to_plain(p) if i % 2 else p for i, p in enumerate(parts))
