"""Stage 2, validate: the full graph must be sound before anything is built on it.

Fails the build unless:
  - every citation resolves to a statement in the graph;
  - the graph is acyclic (shown by order: a proof cites only statements that come before it,
    which also gives a topological order for the later stages);
  - every theorem rests on a root, or is proved from its own hypotheses alone.
Axioms and definitions are the roots: in Metamath both are asserted, not proved.

The last rule is wider than "every theorem reaches an axiom", because set.mm itself is: a few
theorems cite nothing (idi, "from φ infer φ", and the placeholders in the guides), and a few
restate a definition and cite only it (wl-df.clab). Those are sound, and the build accepts them.
A theorem that cites something and still reaches no root is an error.
"""

from __future__ import annotations

from .files import read_stage, write_stage


def check(statements: dict) -> list[str]:
    errors: list[str] = []
    for label, s in statements.items():
        for d in s["deps"]:
            t = statements.get(d)
            if t is None:
                errors.append(f"{label} cites {d}, which is not in the graph")
            elif t["order"] >= s["order"]:
                errors.append(f"{label} cites {d}, which does not come before it (a cycle is possible)")
    if errors:
        return errors
    grounded: dict[str, bool] = {}
    for label, s in sorted(statements.items(), key=lambda kv: kv[1]["order"]):
        if s["kind"] in ("axiom", "definition") or not s["deps"]:
            grounded[label] = True
        else:
            grounded[label] = any(grounded[d] for d in s["deps"])
        if not grounded[label]:
            errors.append(f"{label} cites results that reach no axiom or definition")
    return errors


def run() -> None:
    st = read_stage("extract")["statements"]
    errors = check(st)
    if errors:
        for e in errors[:20]:
            print("validate:", e)
        raise SystemExit(f"validate: {len(errors)} problem(s); the graph is not built")
    write_stage("validate", {"ok": True, "statements": len(st), "citations": sum(len(s["deps"]) for s in st.values())})
    print(f"validate: {len(st)} statements, acyclic, every citation resolves, every theorem grounded")
