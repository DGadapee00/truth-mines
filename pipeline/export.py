"""Stage 7, export: write data/graph.json and data/meta.json for the app.

Statements are turned into LaTeX by pipeline/latex.py, on set.mm's own `latexdef`s. A landmark
may also carry a hand-written `display` form from landmarks.yaml, flagged until reviewed.

A note in content/<label>.md is exported only when its front matter says `reviewed: true`
(CLAUDE.md rule 7). Reviewed notes are copied to data/notes/.

The label font is cut down to the characters in the names (pipeline/fonts.py).
"""

from __future__ import annotations

import datetime as dt
import json
import re
import shutil

from .files import BUILD, CONTENT, DATA, config, read_lock, read_stage
from .fonts import build_label_font
from .latex import Translator
from .names import plain_label
from .schema import SCHEMA_VERSION, Node


def source_text(st: dict) -> str:
    """The statement as set.mm writes it, hypotheses first: the raw form behind the toggle."""
    parts = [" ".join(h) for h in st["hyps"]]
    return "   &   ".join(parts) + ("   =>   " if parts else "") + " ".join(st["concl"])


def reviewed_note(label: str) -> str | None:
    """content/<label>.md, if it exists and its front matter has reviewed: true."""
    path = CONTENT / f"{label}.md"
    if not path.exists():
        return None
    text = path.read_text(encoding="utf8")
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m or not re.search(r"^reviewed:\s*true\s*$", m.group(1), re.M):
        return None
    return text


def build() -> tuple[list[Node], dict]:
    cfg = config()
    ex = read_stage("extract")
    lms = read_stage("curate")["landmarks"]
    col = read_stage("collapse")
    dep = read_stage("depth")
    pos = read_stage("layout")
    st, defs = ex["statements"], {**ex["latexdefs"], **cfg.get("latex_overrides", {})}
    tr = Translator(defs)
    nodes = []
    for lm in lms:
        k = lm["label"]
        display = lm.get("display") or {}
        nodes.append(
            Node(
                id=k,
                kind=st[k]["kind"],
                name=lm["name"],
                label=plain_label(lm["name"] or k),
                statement=tr.with_hyps(st[k]["hyps"], st[k]["concl"]),
                source=source_text(st[k]),
                display=display.get("tex", ""),
                display_reviewed=bool(display.get("reviewed", False)),
                subject=lm["subject"],
                depth=dep["depth"][k],
                pos=tuple(pos[k]),
                deps=col[k]["deps"],
                hidden_steps=col[k]["hidden_steps"],
            )
        )
    nodes.sort(key=lambda n: (n.depth, n.id))
    lock = read_lock()
    counts = {kind: sum(1 for n in nodes if n.kind == kind) for kind in ("axiom", "definition", "theorem")}
    meta = {
        "schema_version": SCHEMA_VERSION,
        "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": [
            {"name": name, "repo": s["repo"], "commit": s["commit"], "sha256": s["sha256"], "license": s["license"]} for name, s in lock.items()
        ],
        "counts": {
            "nodes": len(nodes),
            **counts,
            "tunnels": sum(len(n.deps) for n in nodes),
            "full_graph_statements": len(st),
            "full_graph_citations": sum(len(s["deps"]) for s in st.values()),
        },
        "subjects": [{"id": s["id"], "name": s["name"]} for s in cfg["subjects"]],
        "metres_per_depth": cfg["layout"]["metres_per_depth"],
        "max_depth": max(n.depth for n in nodes),
        "max_depth_full_graph": dep["max_full"],
    }
    return nodes, meta


def full_ancestors(statements: dict, landmarks: set[str]) -> dict[str, list[str]]:
    """For each landmark, the landmarks it rests on, found by walking the FULL graph.

    core/'s tests compare this with ancestors walked over the collapsed tunnels: collapsing and
    reducing must never lose or invent a dependency.
    """
    out = {}
    for b in landmarks:
        seen: set[str] = set()
        stack = list(statements[b]["deps"])
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            stack.extend(statements[x]["deps"])
        out[b] = sorted(seen & landmarks)
    return out


def run() -> None:
    nodes, meta = build()
    st = read_stage("extract")["statements"]
    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "check-ancestors.json").write_text(json.dumps(full_ancestors(st, {n.id for n in nodes})), encoding="utf8")
    if DATA.exists():
        shutil.rmtree(DATA)
    (DATA / "notes").mkdir(parents=True)
    shown = 0
    for n in nodes:
        text = reviewed_note(n.id)
        if text is not None:
            (DATA / "notes" / f"{n.id}.md").write_text(text, encoding="utf8")
            n.note = f"notes/{n.id}.md"
            shown += 1
    meta["counts"]["reviewed_notes"] = shown
    glyphs = build_label_font([n.label for n in nodes], DATA / "fonts" / "labels.woff")
    graph = {"schema_version": SCHEMA_VERSION, "nodes": [n.to_json() for n in nodes]}
    (DATA / "graph.json").write_text(json.dumps(graph, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    (DATA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf8")
    size = (DATA / "graph.json").stat().st_size
    font = (DATA / "fonts" / "labels.woff").stat().st_size
    print(f"export: {len(nodes)} nodes, {meta['counts']['tunnels']} tunnels, {shown} reviewed notes -> data/graph.json ({size / 1024:.0f} KB)")
    print(f"export: label font with {glyphs} characters -> data/fonts/labels.woff ({font / 1024:.0f} KB)")
