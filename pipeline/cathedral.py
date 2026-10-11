"""Stage 10, cathedral: the hub as engine-neutral descriptors (data/cathedral.json).

The hall, its twelve doors with their pedestals and living previews, the fractal threshold the
visitor drifts through, and the vault above. All of it is computed here and only drawn by the app
(CLAUDE.md rule 9), so another engine can build the identical place.

Conventions as for scene.json and the plane: metres, +Y up, yaw about +Y, heading(yaw) =
(sin yaw, 0, cos yaw). A door's bearing is the yaw of the direction from the hall centre to it:
the far wall is 0, the left side +90 (+X), the right side -90, the entrance wall 180.

Nothing here is random and nothing depends on the order of the config lists, so the same build
always gives the same bytes (rule 10: no hash(), no input-order dependence).
"""

from __future__ import annotations

import json
import math

from .files import DATA, config, write_stage
from .numtheory import factorize
from .plane_nt import heading, pt
from .schema import CATHEDRAL_SCHEMA_VERSION

R2 = lambda v: round(v, 2)  # noqa: E731  (centimetres)
RA = lambda v: round(v, 5)  # noqa: E731

CONVENTIONS = {
    "units": "metres; +Y is up; right-handed",
    "yaw": "angle about +Y; heading(yaw) = (sin yaw, 0, cos yaw), so yaw 0 faces +Z",
    "left": "left of heading(yaw) is (cos yaw, 0, -sin yaw)",
    "bearing": "the yaw of the direction from the hall centre to a door: far wall 0, left +90, right -90, entrance wall 180",
    "world": "one frame: the hall centre is the origin, the floor is y = 0, the arrival dais stands at the origin facing +Z",
}


def wrap_deg(a: float) -> int:
    """Degrees into (-180, 180]."""
    a = round(a) % 360
    return a - 360 if a > 180 else a


# ---------------------------------------------------------------- the doors


def arc_slots(cfg: dict) -> list[dict]:
    """The planes of each arc at their bearings. Order in the config does not matter: arcs are
    taken by id and planes by their `order` within the arc."""
    step = cfg["slot_step_deg"]
    out = []
    for arc in sorted(cfg["arcs"], key=lambda a: a["id"]):
        members = sorted((p for p in cfg["planes"] if p["arc"] == arc["id"]), key=lambda p: (p["order"], p["id"]))
        if len(members) != 3:
            raise SystemExit(f"cathedral: arc {arc['id']} holds {len(members)} planes; every arc holds three")
        orders = [p["order"] for p in members]
        if len(set(orders)) != 3:
            raise SystemExit(f"cathedral: two planes of arc {arc['id']} share the same slot")
        # first plane leftmost as seen from the middle of the hall, looking at the arc
        for i, p in enumerate(members):
            out.append({"arc": arc, "plane": p, "bearing": wrap_deg(arc["centre_deg"] + (1 - i) * step)})
    return out


def prime_stacks(cfg: dict, door: dict) -> dict:
    p = cfg["previews"]["prime-stacks"]
    block = p["block"]
    numbers = sorted(p["numbers"])
    towers = []
    for i, n in enumerate(numbers):
        a = 2 * math.pi * i / len(numbers)
        towers.append(
            {
                "n": n,
                "pos": [R2(p["ring_radius"] * math.sin(a)), R2(p["ring_radius"] * math.cos(a))],
                "delay_s": R2(i * p["stagger_s"]),
                "blocks": [{"prime": q, "y": R2(k * block), "h": R2(block)} for k, q in enumerate(factorize(n))],
            }
        )
    return {"towers": towers, "period_s": p["period_s"]}


def limit_curve(cfg: dict) -> dict:
    p = cfg["previews"]["limit-curve"]
    n = p["samples"]
    pts = []
    for i in range(n):
        t = p["t_max"] * i / (n - 1)
        pts.append([RA(p["width"] * t / p["t_max"]), RA(p["height"] * (1 - 1 / (1 + t)))])
    return {"points": pts, "asymptote": p["height"], "width": p["width"]}


def preview(cfg: dict, plane: dict, slot: int) -> dict:
    kind = plane["preview"]
    p = cfg["previews"][kind]
    if kind == "prime-stacks":
        params = prime_stacks(cfg, plane)
    elif kind == "limit-curve":
        params = limit_curve(cfg)
    elif kind == "torus-cup":
        params = {"torus": dict(p["torus"]), "steps": p["steps"]}
    elif kind == "ring-motif":
        params = {"sides": p["min_sides"] + slot % 6, "rings": p["rings"]}
    else:
        raise SystemExit(f"cathedral: plane {plane['id']} names an unknown preview {kind}")
    return {"id": kind, "params": params}


def build_doors(cfg: dict) -> list[dict]:
    h = cfg["hall"]
    r = h["radius"]
    pr = r - h["pedestal"]["inset"]
    doors = []
    for s in arc_slots(cfg):
        b = s["bearing"]
        a = math.radians(b)
        slot = round(b / cfg["slot_step_deg"]) % round(360 / cfg["slot_step_deg"])
        yaw = math.radians(wrap_deg(b + 180))
        if yaw <= -math.pi:
            yaw = math.pi
        doors.append(
            {
                "plane": s["plane"]["id"],
                "name": s["plane"]["name"],
                "arc": s["arc"]["id"],
                "slot": slot,
                "bearing_deg": b,
                "pos": pt(r * math.sin(a), 0, r * math.cos(a)),
                "yaw": RA(yaw),
                "pedestal": {
                    "pos": pt(pr * math.sin(a), 0, pr * math.cos(a)),
                    "radius": h["pedestal"]["radius"],
                    "height": h["pedestal"]["height"],
                    "preview_pos": pt(pr * math.sin(a), h["pedestal"]["height"] + h["pedestal"]["preview_lift"], pr * math.cos(a)),
                },
                "preview": preview(cfg, s["plane"], slot),
            }
        )
    return sorted(doors, key=lambda d: d["slot"])


# ---------------------------------------------------------------- the threshold


def sierpinski(depth: int) -> list[list[list[float]]]:
    """The triangles of a Sierpinski triangle inscribed in the unit circle, one level of detail
    per `depth`: 3 ** depth triangles, apex up."""
    tri = [[0.0, 1.0], [-math.sqrt(3) / 2, -0.5], [math.sqrt(3) / 2, -0.5]]
    tris = [tri]
    for _ in range(depth):
        nxt = []
        for t in tris:
            mid = lambda a, b: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]  # noqa: E731
            ab, bc, ca = mid(t[0], t[1]), mid(t[1], t[2]), mid(t[2], t[0])
            nxt += [[t[0], ab, ca], [ab, t[1], bc], [ca, bc, t[2]]]
        tris = nxt
    return [[[RA(x), RA(y)] for x, y in t] for t in tris]


def rails(t: dict) -> tuple[list[tuple[float, float, float]], float]:
    """The rails path: level along +Z in the vault, a quarter-circle turn down, then straight down
    onto the dais at the origin. Returns the polyline and the arc length where the descent begins."""
    h, straight, r, step = t["entry_height"], t["straight"], t["corner"], t["path_step"]
    pts: list[tuple[float, float, float]] = []
    n = max(1, round(straight / step))
    for i in range(n):
        pts.append((0.0, h, -r - straight + straight * i / n))
    m = max(2, round(r * math.pi / 2 / step))
    cy = h - r
    for i in range(m + 1):  # from (y, z) = (h, -r), heading +Z, to (h - r, 0), heading down
        phi = (math.pi / 2) * i / m
        pts.append((0.0, cy + r * math.cos(phi), -r + r * math.sin(phi)))
    descent_from = len(pts) - 1
    k = max(1, round((h - r) / step))
    for i in range(1, k + 1):
        pts.append((0.0, (h - r) * (1 - i / k), 0.0))
    pts[-1] = (0.0, 0.0, 0.0)
    s = 0.0
    for a, b in zip(pts[:descent_from], pts[1 : descent_from + 1]):
        s += math.dist(a, b)
    return pts, s


def build_threshold(cfg: dict) -> dict:
    t = cfg["threshold"]
    pts, descent_s = rails(t)
    total = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    n = t["rings"]
    ratio = (t["end_radius"] / t["start_radius"]) ** (1 / (n - 1))
    rings = []
    z0 = -t["corner"] - t["straight"]
    for k in range(n):  # evenly along the level tunnel, the last ring at its mouth
        scale = ratio**k
        rings.append(
            {
                "k": k,
                "scale": RA(scale),
                "radius": RA(t["start_radius"] * scale),
                "rotation": RA(math.radians(t["rotation_deg"]) * k),
                "pos": pt(0.0, t["entry_height"], z0 + t["straight"] * k / (n - 1)),
                "pitch": 0,
            }
        )
    segments = [
        {"kind": "drift", "s_from": 0, "s_to": R2(descent_s), "speed": t["drift_speed"], "vignette": t["vignette"]["drift"]},
        {"kind": "descent", "s_from": R2(descent_s), "s_to": R2(total), "speed": t["descent_speed"], "vignette": t["vignette"]["descent"]},
    ]
    seconds = sum((g["s_to"] - g["s_from"]) / g["speed"] for g in segments)
    return {
        "motif": {"kind": "sierpinski", "depth": t["motif_depth"], "triangles": sierpinski(t["motif_depth"])},
        "rings": rings,
        "path": [pt(*p) for p in pts],
        "segments": segments,
        "ease_s": t["ease_s"],
        "duration_s": R2(seconds),
    }


# ---------------------------------------------------------------- the vault


def build_vault(cfg: dict) -> dict:
    v, h = cfg["vault"], cfg["hall"]
    tiers = []
    y = h["wall_height"]
    rise = v["rise_per_tier"] * h["radius"]
    for i in range(v["tiers"]):
        radius = h["radius"] * v["ratio"] ** i
        tiers.append({"i": i, "radius": RA(radius), "y": R2(y), "sides": v["sides"], "rotation": RA(math.radians(v["rotation_deg"]) * i)})
        y += rise * v["ratio"] ** i
    return {"tiers": tiers, "ratio": v["ratio"], "limit_y": R2(h["wall_height"] + rise / (1 - v["ratio"]))}


# ---------------------------------------------------------------- the whole cathedral


def build(cfg: dict) -> dict:
    doors = build_doors(cfg)
    arcs = []
    for arc in sorted(cfg["arcs"], key=lambda a: a["id"]):
        members = sorted((p for p in cfg["planes"] if p["arc"] == arc["id"]), key=lambda p: (p["order"], p["id"]))
        arcs.append({"id": arc["id"], "name": arc["name"], "placement": arc["placement"], "centre_deg": arc["centre_deg"], "planes": [p["id"] for p in members]})
    h = cfg["hall"]
    return {
        "schema_version": CATHEDRAL_SCHEMA_VERSION,
        "conventions": CONVENTIONS,
        "arcs": arcs,
        "hall": {"radius": h["radius"], "wall_height": h["wall_height"], "door": dict(h["door"]), "slots": round(360 / cfg["slot_step_deg"])},
        "arrival": {"pos": [0, 0, 0], "yaw": 0, "dais_radius": cfg["arrival"]["dais_radius"]},
        "doors": doors,
        "threshold": build_threshold(cfg),
        "vault": build_vault(cfg),
    }


def run() -> None:
    cathedral = build(config()["cathedral"])
    write_stage("cathedral", cathedral)
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / "cathedral.json"
    path.write_text(json.dumps(cathedral, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    th = cathedral["threshold"]
    print(f"cathedral: {len(cathedral['doors'])} doors, {len(th['rings'])} threshold rings ({th['duration_s']} s), {len(cathedral['vault']['tiers'])} vault tiers -> data/cathedral.json ({path.stat().st_size / 1024:.0f} KB)")
