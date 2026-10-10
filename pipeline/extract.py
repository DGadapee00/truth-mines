"""Stage 1, extract: parse a Metamath database into the full dependency graph.

One node per logical statement: every axiom, definition and theorem whose conclusion starts with
the turnstile `|-`. Syntax statements (`wff`, `class`, `setvar` constructors) and hypotheses are
not nodes; they are grammar, not mathematics.

An edge runs from a theorem to each statement its proof cites. For a compressed proof those are
the labels between `(` and `)`; for a normal proof, every label in the proof. Hypotheses and
syntax are dropped from both.

Alongside the graph this keeps what later stages and the app need: each statement's hypotheses
and conclusion as symbols, the part of set.mm it sits in (the `####` headings), its position in
the file, and the database's own LaTeX for each symbol (`latexdef` in the `$t` comment).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_TOKEN = re.compile(r"\S+")
# Strings in the $t comment use either quote; a doubled quote inside is a literal one.
_STR = r"""(?:"(?:[^"]|"")*"|'(?:[^']|'')*')"""
_LATEXDEF = re.compile(r"latexdef\s+(" + _STR + r")\s+as\s+((?:" + _STR + r"\s*(?:\+\s*)?)+);")
_STRING = re.compile(_STR)


def _unquote(s: str) -> str:
    q = s[0]
    return s[1:-1].replace(q + q, q)


@dataclass
class Statement:
    label: str
    kind: str  # 'axiom' | 'definition' | 'theorem'
    order: int  # position among logical statements in the file
    part: int  # index into Database.parts
    hyps: list[list[str]]  # each essential hypothesis, as symbols (typecode first)
    concl: list[str]  # the conclusion, as symbols (typecode first)
    deps: list[str] = field(default_factory=list)
    comment: str = ""


@dataclass
class Database:
    statements: dict[str, Statement]
    parts: list[str]
    latexdefs: dict[str, str]


def parse(text: str) -> Database:
    """Parse a whole .mm file. Raises ValueError on anything malformed."""
    statements: dict[str, Statement] = {}
    syntax: set[str] = set()  # $a/$p labels whose typecode is not |-
    hyp_labels: set[str] = set()
    parts: list[str] = ["(before the first part)"]
    latexdefs: dict[str, str] = {}

    scopes: list[list[tuple[str, list[str]]]] = [[]]  # active $e hypotheses per ${ $} scope
    last_comment = ""
    pos = 0
    n = len(text)
    order = 0

    def next_token(p: int) -> tuple[str | None, int]:
        m = _TOKEN.search(text, p)
        if not m:
            return None, n
        return m.group(0), m.end()

    def read_until(p: int, stops: tuple[str, ...]) -> tuple[list[str], str, int]:
        out: list[str] = []
        while True:
            tok, p = next_token(p)
            if tok is None:
                raise ValueError("unexpected end of file inside a statement")
            if tok == "$(":
                p = skip_comment(p)[1]
                continue
            if tok in stops:
                return out, tok, p
            out.append(tok)

    def skip_comment(p: int) -> tuple[str, int]:
        m = re.compile(r"(?:^|\s)\$\)(?=\s|$)").search(text, p)
        if not m:
            raise ValueError("unterminated comment")
        return text[p : m.start()], m.end()

    pending_label: str | None = None
    while True:
        tok, pos = next_token(pos)
        if tok is None:
            break
        if tok == "$(":
            body, pos = skip_comment(pos)
            stripped = body.strip()
            if re.match(r"#{20,}", stripped):
                title = next((ln.strip() for ln in stripped.splitlines()[1:] if ln.strip() and not ln.strip().startswith("#")), "")
                parts.append(title)
            elif stripped.startswith("$t"):
                for m in _LATEXDEF.finditer(body):
                    latexdefs[_unquote(m.group(1))] = "".join(_unquote(s) for s in _STRING.findall(m.group(2)))
            else:
                last_comment = stripped
            continue
        if tok == "${":
            scopes.append([])
            continue
        if tok == "$}":
            if len(scopes) == 1:
                raise ValueError("unbalanced $}")
            scopes.pop()
            continue
        if tok in ("$c", "$v", "$d"):
            pos = read_until(pos, ("$.",))[2]
            continue
        if tok in ("$[", "$]"):
            raise ValueError("file inclusion is not supported")
        if tok in ("$a", "$p", "$e", "$f"):
            label = pending_label
            pending_label = None
            if label is None:
                raise ValueError(f"{tok} statement without a label near offset {pos}")
            if tok in ("$e", "$f"):
                math, _, pos = read_until(pos, ("$.",))
                hyp_labels.add(label)
                if tok == "$e":
                    scopes[-1].append((label, math))
                last_comment = ""
                continue
            if tok == "$a":
                math, _, pos = read_until(pos, ("$.",))
                proof: list[str] = []
            else:
                math, _, pos = read_until(pos, ("$=",))
                proof, _, pos = read_until(pos, ("$.",))
            if not math:
                raise ValueError(f"{label}: empty statement")
            if math[0] != "|-":
                syntax.add(label)
                last_comment = ""
                continue
            if tok == "$a":
                kind = "definition" if label.startswith("df-") else "axiom"
            else:
                kind = "theorem"
            hyps = [m for scope in scopes for (_, m) in scope]
            st = Statement(label, kind, order, len(parts) - 1, hyps, math, comment=last_comment)
            order += 1
            if tok == "$p":
                st.deps = _proof_refs(proof)
            statements[label] = st
            last_comment = ""
            continue
        if tok.startswith("$"):
            raise ValueError(f"unknown keyword {tok}")
        pending_label = tok

    # Keep only references to logical statements: hypotheses and syntax are grammar.
    for st in statements.values():
        seen: set[str] = set()
        deps = []
        for d in st.deps:
            if d in statements and d not in seen and d != st.label:
                seen.add(d)
                deps.append(d)
            elif d not in statements and d not in syntax and d not in hyp_labels and d != "?":
                raise ValueError(f"{st.label} cites {d}, which is not defined")
        st.deps = deps
    return Database(statements, parts, latexdefs)


def _proof_refs(proof: list[str]) -> list[str]:
    """Labels a proof cites. Compressed proofs list them between ( and )."""
    if proof and proof[0] == "(":
        end = proof.index(")")
        return proof[1:end]
    return [t for t in proof if t != "?"]


def to_stage(db: Database) -> dict:
    return {
        "parts": db.parts,
        "latexdefs": db.latexdefs,
        "statements": {
            s.label: {"kind": s.kind, "order": s.order, "part": s.part, "hyps": s.hyps, "concl": s.concl, "deps": s.deps}
            for s in db.statements.values()
        },
    }


def run() -> None:
    from .fetch import source_path
    from .files import write_stage

    db = parse(source_path().read_text(encoding="utf8"))
    path = write_stage("extract", to_stage(db))
    edges = sum(len(s.deps) for s in db.statements.values())
    print(f"extract: {len(db.statements)} statements, {edges} citations, {len(db.parts)} parts -> {path.name}")
