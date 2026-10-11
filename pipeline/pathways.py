"""Stage 11, pathways: the ordered route behind each door (data/pathways.json).

A pathway names real set.mm ids: the landmarks of each stretch and the moments where a visitor can earn
them by explaining. Its door's gate (`entry_requires`) is derived here, never written by hand: the
ideas on the map (the landmarks of any stretch) that the pathway's `gated_on` idea truly rests on, by
graph.json's dependencies. `null` means no true gate exists yet (config says why) and the door is
sealed. Curation lives in config.yaml (CLAUDE.md rule 3); test_gates.py re-derives every gate from the
raw set.mm.
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


def ancestors(of: str, deps: dict[str, list[str]]) -> set[str]:
    """Every landmark `of` rests on, directly or through others (graph.json's dependency edges)."""
    seen: set[str] = set()
    stack = list(deps[of])
    while stack:
        i = stack.pop()
        if i not in seen:
            seen.add(i)
            stack.extend(deps[i])
    return seen


def build(cfg: dict, deps: dict[str, list[str]], plane_ids: list[str]) -> dict:
    """`deps` is graph.json's landmark dependencies: id -> the landmarks it directly rests on."""
    graph_ids = set(deps)
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

    # The ideas on the map: every landmark of every stretch, the ideas a visitor can earn somewhere
    on_map = {lid for pw in cfg["pathways"] for s in pw["stretches"] for lid in s["landmarks"]}
    check_ids(sorted(on_map), graph_ids, "a stretch")

    def gate_of(idea: str) -> list[str]:
        return sorted((ancestors(idea, deps) & on_map) - {idea})

    out = []
    for plane in sorted(plane_ids):
        pw = by_plane[plane]
        if "entry_requires" in pw:
            raise SystemExit(f"pathways: {plane} writes its gate by hand; name `gated_on` and the build derives it")
        built = bool(pw["stretches"])
        target = pw.get("gated_on")
        if target is not None:
            check_ids([target], graph_ids, f"{plane} gated_on")
            if built and target != pw["stretches"][0]["landmarks"][0]:
                raise SystemExit(f"pathways: {plane} is built, so it is gated on the first landmark of its first stretch ({pw['stretches'][0]['landmarks'][0]}), not {target}")
            requires: list[str] | None = gate_of(target)
            if not built and not requires:
                raise SystemExit(f"pathways: {plane} is not built and {target} rests on nothing on the map, so its gate would be empty and the door would glow with nothing behind it: set gated_on to null and say why in no_gate")
        else:
            requires = None
            if built:
                raise SystemExit(f"pathways: {plane} is built, so it is gated on its first landmark; gated_on cannot be null")
            if not str(pw.get("no_gate", "")).strip():
                raise SystemExit(f"pathways: {plane} has no gate and does not say why: write no_gate")
            first = pw.get("first_idea")
            if first is None:
                raise SystemExit(f"pathways: {plane} has no gate: name first_idea, where its pathway would begin")
            check_ids([first], graph_ids, f"{plane} first_idea")
            if gate_of(first):
                raise SystemExit(f"pathways: {plane} says nothing on the map leads to it, but {first} rests on {', '.join(gate_of(first))}: gate it on {first}")
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
        out.append({"plane": plane, "gated_on": target, "entry_requires": requires, "stretches": stretches})
    # A gate no visitor can ever meet would be a door sealed for good
    earnable = {e for pw in cfg["pathways"] for s in pw["stretches"] for m in s["moments"] for e in m["earns"]}
    for pw in out:
        for r in pw["entry_requires"] or []:
            if r not in earnable:
                raise SystemExit(f"pathways: the gate of {pw['plane']} needs {r}, which no moment earns, so the door could never open")
    return {"schema_version": PATHWAYS_SCHEMA_VERSION, "pathways": out}


def run() -> None:
    cfg = config()["cathedral"]
    graph = json.loads((DATA / "graph.json").read_text(encoding="utf8"))
    deps = {n["id"]: list(n["deps"]) for n in graph["nodes"]}
    plane_ids = [d["plane"] for d in build_cathedral(cfg)["doors"]]
    pathways = build(cfg, deps, plane_ids)
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
