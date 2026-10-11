"""Stage 11, pathways: the ordered route behind each door (data/pathways.json).

A pathway names real set.mm ids: the ideas a door rests on (`entry_requires`), the landmarks of
each stretch, and the moments where a visitor can earn them by explaining. Curation lives in
config.yaml (CLAUDE.md rule 3); this stage only validates it against the graph and writes it out.
Moment rubrics are Trurl's private judging notes: they go to grounding.json, never into this file.
"""

from __future__ import annotations

import json

from .cathedral import build as build_cathedral
from .files import DATA, config, read_stage, write_stage
from .schema import PATHWAYS_SCHEMA_VERSION

# The plane file each plane's stretches draw, written by that plane's own stage.
PLANE_FILES = {"number-theory": "plane-number-theory.json"}


def check_ids(ids: list[str], known: set[str], where: str) -> None:
    for i in ids:
        if i not in known:
            raise SystemExit(f"pathways: {where} names {i}, which is not a landmark in graph.json")


def build(cfg: dict, graph_ids: set[str], plane_ids: list[str]) -> dict:
    by_plane: dict[str, dict] = {}
    for pw in cfg["pathways"]:
        if pw["plane"] in by_plane:
            raise SystemExit(f"pathways: plane {pw['plane']} has two pathways")
        by_plane[pw["plane"]] = pw
    for plane in plane_ids:
        if plane not in by_plane:
            raise SystemExit(f"pathways: the door for {plane} has no pathway")
    extra = sorted(set(by_plane) - set(plane_ids))
    if extra:
        raise SystemExit(f"pathways: {', '.join(extra)} has a pathway but no door")

    seen: set[str] = set()

    def unique(i: str, what: str) -> None:
        if i in seen:
            raise SystemExit(f"pathways: {what} id {i} is used twice")
        seen.add(i)

    out = []
    for plane in sorted(plane_ids):
        pw = by_plane[plane]
        check_ids(pw["entry_requires"], graph_ids, f"{plane} entry_requires")
        stretches = []
        for s in pw["stretches"]:
            unique(s["id"], "stretch")
            check_ids(s["landmarks"], graph_ids, f"stretch {s['id']}")
            if PLANE_FILES.get(plane) != s["plane_data"]:
                raise SystemExit(f"pathways: stretch {s['id']} draws {s['plane_data']}, but {plane} has {PLANE_FILES.get(plane)}")
            moments = []
            for m in s["moments"]:
                unique(m["id"], "moment")
                check_ids(m["earns"], graph_ids, f"moment {m['id']}")
                for e in m["earns"]:
                    if e not in s["landmarks"]:
                        raise SystemExit(f"pathways: moment {m['id']} earns {e}, which is not a landmark of stretch {s['id']}")
                moments.append({"id": m["id"], "kind": m["kind"], "earns": sorted(m["earns"])})
            stretches.append({"id": s["id"], "plane_data": s["plane_data"], "landmarks": list(s["landmarks"]), "moments": moments})
        out.append({"plane": plane, "entry_requires": sorted(pw["entry_requires"]), "stretches": stretches})
    return {"schema_version": PATHWAYS_SCHEMA_VERSION, "pathways": out}


def run() -> None:
    cfg = config()["cathedral"]
    graph_ids = {lm["label"] for lm in read_stage("curate")["landmarks"]}
    plane_ids = [d["plane"] for d in build_cathedral(cfg)["doors"]]
    pathways = build(cfg, graph_ids, plane_ids)
    for pw in pathways["pathways"]:
        for s in pw["stretches"]:
            if not (DATA / s["plane_data"]).exists():
                raise SystemExit(f"pathways: {s['plane_data']} is missing; run the 'plane' stage first")
    write_stage("pathways", pathways)
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / "pathways.json"
    path.write_text(json.dumps(pathways, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    stretches = sum(len(p["stretches"]) for p in pathways["pathways"])
    print(f"pathways: {len(pathways['pathways'])} pathways, {stretches} stretch -> data/pathways.json ({path.stat().st_size} bytes)")
