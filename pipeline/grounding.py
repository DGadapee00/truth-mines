"""Stage 12, grounding: what Trurl may say about mathematics (data/grounding.json).

For each landmark on a pathway: set.mm's own statement and description, the display form and the
plain-language note only once a person has reviewed them (CLAUDE.md rule 7). For each moment: the
landmarks it covers, what it can earn, and a rubric for judging an explanation. The Worker
bundles a copy and builds Trurl's prompt from it, so Trurl asserts only mathematics found here.

A rubric is a draft by Claude (`rubric_reviewed: false`) until a person approves its exact text and sets
`rubric_reviewed: true` beside it in config.yaml; the build copies the flag and never sets it. Rubrics
steer Trurl's judge and are never shown to the visitor.
"""

from __future__ import annotations

import json
import re

from . import extract, fetch
from .cathedral import build as build_cathedral
from .export import reviewed_note
from .files import DATA, config, write_stage
from .schema import GROUNDING_SCHEMA_VERSION

CREDIT = re.compile(r"\s*\((?:Contributed|Proof shortened|Proof modification|Revised|New usage|Moved|Originally)[^()]*\)")


def clean_comment(raw: str) -> str:
    """set.mm's description without its credits and with plain spacing."""
    return re.sub(r"\s+", " ", CREDIT.sub("", raw)).strip()


def note_body(text: str) -> str:
    return re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.S).strip()


def build(cfg: dict, nodes: dict[str, dict], comments: dict[str, str], notes: dict[str, str]) -> dict:
    landmarks: dict[str, dict] = {}
    moments: dict[str, dict] = {}
    for pw in sorted(cfg["pathways"], key=lambda p: p["plane"]):
        for s in pw["stretches"]:
            for lid in s["landmarks"]:
                if lid in landmarks:
                    continue
                n = nodes.get(lid)
                if n is None:
                    raise SystemExit(f"grounding: {lid} is not in graph.json")
                if lid not in comments:
                    raise SystemExit(f"grounding: {lid} has no description in set.mm")
                e = {"name": n["name"], "kind": n["kind"], "statement": n["statement"], "source": n["source"], "comment": clean_comment(comments[lid])}
                if n.get("display") and n.get("display_reviewed"):
                    e["display"] = n["display"]
                if lid in notes:
                    e["note"] = note_body(notes[lid])
                landmarks[lid] = e
            for m in s["moments"]:
                rubric = (m.get("rubric") or "").strip()
                if not rubric:
                    raise SystemExit(f"grounding: moment {m['id']} has no rubric")
                reviewed = m.get("rubric_reviewed", False)
                if not isinstance(reviewed, bool):
                    raise SystemExit(f"grounding: moment {m['id']}: rubric_reviewed must be true or false")
                moments[m["id"]] = {
                    "plane": pw["plane"],
                    "stretch": s["id"],
                    "kind": m["kind"],
                    "landmarks": list(s["landmarks"]),
                    "earns": sorted(m["earns"]),
                    "rubric": re.sub(r"\s+", " ", rubric),
                    "rubric_reviewed": reviewed,
                }
    planes = {p["id"]: p["name"] for p in sorted(cfg["planes"], key=lambda p: p["id"])}
    return {"schema_version": GROUNDING_SCHEMA_VERSION, "planes": planes, "landmarks": dict(sorted(landmarks.items())), "moments": dict(sorted(moments.items()))}


def run() -> None:
    cfg = config()["cathedral"]
    build_cathedral(cfg)  # fails early if the cathedral config is broken
    graph = json.loads((DATA / "graph.json").read_text(encoding="utf8"))
    nodes = {n["id"]: n for n in graph["nodes"]}
    wanted = {lid for pw in cfg["pathways"] for s in pw["stretches"] for lid in s["landmarks"]}
    db = extract.parse(fetch.source_path().read_text(encoding="utf8"))
    comments = {lid: db.statements[lid].comment for lid in wanted if lid in db.statements}
    notes = {lid: t for lid in wanted if (t := reviewed_note(lid)) is not None}
    grounding = build(cfg, nodes, comments, notes)
    write_stage("grounding", grounding)
    path = DATA / "grounding.json"
    path.write_text(json.dumps(grounding, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"grounding: {len(grounding['landmarks'])} landmarks, {len(grounding['moments'])} moments -> data/grounding.json ({path.stat().st_size} bytes)")
