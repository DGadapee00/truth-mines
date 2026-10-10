"""Stage 8, scene: the Inside view as engine-neutral scene descriptors (data/scene.json).

Every piece of procedural layout is decided here, so the app (three.js today, perhaps Unreal later)
only draws what it is given and two engines draw the identical mine. Randomness is seeded from a
SHA-256 of the node or tunnel id, never from Python's hash, so the same data always gives the same
geometry.

Conventions (also written into the file):
  metres; right-handed; +Y up. Each chamber has its own frame: origin at the centre of its floor.
  yaw is an angle about +Y; the direction of yaw θ is (sin θ, 0, cos θ), so θ = 0 faces +Z.
  A chamber's absolute floor height is floor_y = -depth * metres_per_depth.

Chamber: a circular hall of radius at most `chamber.max_radius`. The statement wall is centred at
yaw π (on the -Z side), facing +Z. The doorways up (to dependencies) follow it round one way, the
doorways down (to dependents) after them; each doorway's arc fits its tunnel's width. When the
doorways do not fit, they move into wedges off the hall, grouped by the target's subject. A wedge
is at most `gallery.max_length` deep; a subject that needs more is several wedges, one beyond the
last, with the doorways on the outermost. One pillar per dependency stands in front of the doorway
to that dependency: the theorem visibly rests on its supports.

Tunnels are then lengthened, and straightened if a bend is what collides, until no two chambers
drawn together overlap and no tunnel centre line enters a chamber except at its own doorway. A
tunnel belongs to two stars, so every change is checked against every star. The loop is capped.

Tunnel: from the upper chamber's doorway down to the lower chamber's, as a polyline in the UPPER
chamber's frame. It drops exactly (depth difference) * metres_per_depth, at no more than
max_grade, with level floor at each end. `lower_in_upper` places the lower chamber's frame in the
upper's. Width, ornament and the entrance plaques come from feeding_lemmas; the markers come from
`chain`, each at the point of the tunnel whose height is that lemma's own depth.
"""

from __future__ import annotations

import hashlib
import math
import random

from .files import DATA, config, read_stage, write_stage
from .schema import SCHEMA_VERSION

R2 = lambda v: round(v, 2)  # noqa: E731  (centimetre precision is plenty for lengths)
RA = lambda v: round(v, 5)  # noqa: E731  (angles: 1e-5 rad is 0.5 mm at 50 m)


def rng_for(key: str) -> random.Random:
    return random.Random(int.from_bytes(hashlib.sha256(key.encode("utf8")).digest()[:8], "big"))


def heading(yaw: float) -> tuple[float, float]:
    """The (x, z) direction of a yaw."""
    return math.sin(yaw), math.cos(yaw)


def rotate(x: float, z: float, yaw: float) -> tuple[float, float]:
    """Turn (x, z) by `yaw` about +Y, so that +Z goes to heading(yaw)."""
    c, s = math.cos(yaw), math.sin(yaw)
    return x * c + z * s, -x * s + z * c


def wrap(a: float) -> float:
    return a % (2 * math.pi)


# A tunnel belongs to two stars, so each lengthening is checked against every star.
# Fifty passes is enough when each pass moves every tunnel that is still in the way.
SEPARATION_PASSES = 50


# ---------------------------------------------------------------- per-tunnel quantities


def tunnel_width(feeding: int, t: dict) -> float:
    w = t["min_width"] + t["width_per_decade"] * math.log10(1 + feeding)
    return min(t["max_width"], max(t["min_width"], w))


def ornament_level(feeding: int, t: dict) -> int:
    return sum(1 for th in t["ornament"] if feeding >= th)


def strata(depth: int, max_depth: int, cfg: dict, subject: str) -> dict:
    f = depth / max(1, max_depth)
    li, fo = cfg["light"], cfg["fog"]
    light = li["surface"] * (li["deepest"] / li["surface"]) ** f
    fog = fo["surface"] + (fo["deepest"] - fo["surface"]) * f
    base = cfg["rock"].get(subject, cfg["rock"]["other"]).lstrip("#")
    k = 1 - (1 - cfg["rock_darkening"]) * f
    rgb = [min(255, round(int(base[i : i + 2], 16) * k)) for i in (0, 2, 4)]
    return {"light": R2(light), "fog": R2(fog), "rock": "#{:02x}{:02x}{:02x}".format(*rgb)}


# ---------------------------------------------------------------- chambers


def chamber(node: dict, ups: list[tuple[str, float, str]], downs: list[tuple[str, float, str]], cfg: dict, max_depth: int) -> dict:
    """ups/downs: (target id, doorway width, target subject), ups first around the wall."""
    c = cfg["chamber"]
    gap = cfg["portal"]["gap"]
    rng = rng_for(f"chamber:{node['id']}")
    need = c["statement_arc"] + sum(w + gap for _, w, _ in ups + downs)
    # The radius draw is consumed even when the hall is clamped, so the height draw stays put.
    natural = max(c["min_radius"] + rng.random() * c["radius_spread"], need / (2 * math.pi) * 1.08)
    radius = min(natural, c["max_radius"])
    height = c["base_height"] + rng.random() * c["height_spread"] + 0.04 * radius
    if node["kind"] == "axiom":
        height *= c["axiom_height_scale"]
    height = max(height, cfg["portal"]["height"] + 2.0)

    stmt_arc = c["statement_arc"] / radius
    overflow = natural > c["max_radius"] + 1e-9
    if overflow:
        doors = [{"dir": "up", "target": t, "width": w, "subject": s} for t, w, s in ups]
        doors += [{"dir": "down", "target": t, "width": w, "subject": s} for t, w, s in downs]
        from .scene_fit import layout_galleries

        portals, pillars, galleries = layout_galleries(node["id"], radius, height, doors, cfg)
    else:
        slots = [("up", t, w) for t, w, _ in ups] + [("down", t, w) for t, w, _ in downs]
        used = sum((w + gap) / radius for _, _, w in slots)
        extra = ((2 * math.pi - stmt_arc) - used) / max(1, len(slots))
        cursor = math.pi + stmt_arc / 2
        portals, pillars = [], []
        ring = max(cfg["pillar"]["min_ring"], cfg["pillar"]["ring"] * radius)
        pr = cfg["pillar"]
        for direction, target, w in slots:
            span = (w + gap) / radius + extra
            yaw = wrap(cursor + span / 2)
            cursor += span
            hx, hz = heading(yaw)
            # The plaque sits on the wall above the doorway's lintel, facing into the chamber, so
            # the pillar standing in front of an up doorway never hides it.
            portals.append(
                {
                    "dir": direction,
                    "target": target,
                    "yaw": RA(yaw),
                    "pos": [R2(radius * hx), 0.0, R2(radius * hz)],
                    "width": R2(w),
                    "height": cfg["portal"]["height"],
                    "plaque": {"pos": [R2((radius - 0.12) * hx), R2(cfg["portal"]["height"] + 0.55), R2((radius - 0.12) * hz)], "yaw": RA(wrap(yaw + math.pi))},
                }
            )
            if direction == "up":
                prng = rng_for(f"pillar:{node['id']}>{target}")
                pillars.append(
                    {
                        "target": target,
                        "pos": [R2(ring * hx), 0.0, R2(ring * hz)],
                        "radius": R2(pr["min_radius"] + prng.random() * (pr["max_radius"] - pr["min_radius"])),
                        "height": R2(height),
                    }
                )
        galleries = []

    sw = cfg["statement_wall"]
    width = min(sw["width"], 2 * (radius - 0.25) * math.sin(stmt_arc / 2) * 0.95)
    # Stand the slab where its edges meet the curved wall, a hand's breadth in front of it.
    back = math.sqrt(radius**2 - (width / 2) ** 2) - 0.2
    return {
        "id": node["id"],
        "kind": node["kind"],
        "depth": node["depth"],
        "floor_y": R2(-node["depth"] * cfg["metres_per_depth"]),
        "radius": R2(radius),
        "height": R2(height),
        "statement": {"pos": [0.0, R2(sw["lift"] + sw["height"] / 2), R2(-back)], "yaw": 0.0, "size": [R2(width), sw["height"]]},
        "spawn": {"pos": [0.0, 0.0, R2(radius * 0.35)], "yaw": RA(math.pi)},
        "portals": portals,
        "pillars": pillars,
        "galleries": galleries,
        **strata(node["depth"], max_depth, cfg, node["subject"]),
    }


# ---------------------------------------------------------------- tunnels


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    return tuple(u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * d for a, b, c, d in zip(p0, p1, p2, p3))


def tunnel(upper: dict, lower: dict, up_portal: dict, low_portal: dict, chain: list[str], feeding: int, depth_of: dict[str, int], cfg: dict, max_depth: int, subj: tuple[str, str], extra_run: float = 0.0, straight: bool = False) -> dict:
    tid = f"{lower['id']}>{upper['id']}"
    rng = rng_for(f"tunnel:{tid}")
    mpd = cfg["metres_per_depth"]
    drop = (lower["depth"] - upper["depth"]) * mpd
    flat = cfg["flat_ends"]
    grade = math.tan(math.radians(cfg["max_grade_deg"]))
    # Run draw, then turn draw. `straight` zeroes the turn afterwards, so the draws stay aligned.
    run = max(cfg["min_run"], drop / grade + 2 * flat) * (1 + 0.2 * rng.random()) + extra_run
    turn = (2 * rng.random() - 1) * math.radians(cfg["max_turn_deg"])
    if straight:
        turn = 0.0

    # The floor's centre line in the tunnel's own frame: x across, z along, starting at the doorway.
    p0, p1 = (0.0, 0.0), (0.0, run / 3)
    p3 = (run * math.sin(turn / 2), run * math.cos(turn / 2))
    p2 = (p3[0] - run / 3 * math.sin(turn), p3[1] - run / 3 * math.cos(turn))
    dense = [bezier(p0, p1, p2, p3, i / 400) for i in range(401)]
    arc = [0.0]
    for a, b in zip(dense, dense[1:]):
        arc.append(arc[-1] + math.dist(a, b))
    length = arc[-1]
    ramp = length - 2 * flat

    def at(s: float) -> tuple[float, float, float, float]:
        """(x, y, z, yaw) at arc length s, in the UPPER chamber's frame."""
        s = min(max(s, 0.0), length)
        i = max(1, next((k for k, v in enumerate(arc) if v >= s), len(arc) - 1))
        f = (s - arc[i - 1]) / max(1e-9, arc[i] - arc[i - 1])
        x = dense[i - 1][0] + f * (dense[i][0] - dense[i - 1][0])
        z = dense[i - 1][1] + f * (dense[i][1] - dense[i - 1][1])
        dx, dz = dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]
        y = -drop * min(1.0, max(0.0, (s - flat) / ramp))
        wx, wz = rotate(x, z, up_portal["yaw"])
        return wx + up_portal["pos"][0], y, wz + up_portal["pos"][2], wrap(math.atan2(dx, dz) + up_portal["yaw"])

    # Markers: up to `max` lemmas sampled evenly from the chain, each where the floor is at its depth.
    m = cfg["markers"]["max"]
    picks = chain if len(chain) <= m else [chain[round(i * (len(chain) - 1) / (m - 1))] for i in range(m)]
    mark_s = [flat + ramp * ((depth_of[lemma] - upper["depth"]) * mpd / drop if drop else 0.5) for lemma in picks]

    # Points every path_step or less, plus the two corners where the floor starts and stops
    # sloping and a point under each marker, so the straight segments between points are exactly
    # the floor and every marker stands on it.
    n = max(2, math.ceil(length / cfg["path_step"]))
    stations = sorted({round(length * k / n, 6) for k in range(n + 1)} | {round(flat, 6), round(length - flat, 6)} | {round(v, 6) for v in mark_s})
    path = [at(s) for s in stations]

    end = path[-1]
    end_yaw = wrap(up_portal["yaw"] + turn)
    # Place the lower chamber so its doorway is the tunnel's end, facing back up the tunnel.
    # The doorway is not always on the hall circle (gallery doors sit further out).
    psi = wrap(end_yaw + math.pi - low_portal["yaw"])
    rx, rz = rotate(low_portal["pos"][0], low_portal["pos"][2], psi)
    origin = (end[0] - rx, -drop, end[2] - rz)

    tc = cfg["tunnel"]
    width = up_portal["width"]
    level = ornament_level(feeding, tc)

    markers = []
    for k, (lemma, s) in enumerate(zip(picks, mark_s)):
        x, yy, z, yaw = at(round(s, 6))
        side = 1 if k % 2 == 0 else -1
        lx, lz = rotate(side * (width / 2 - 0.45), 0.0, yaw)
        markers.append({"id": lemma, "depth": depth_of[lemma], "s": R2(s), "at": [R2(x), R2(yy), R2(z)], "pos": [R2(x + lx), R2(yy), R2(z + lz)], "side": side})

    top = strata(upper["depth"], max_depth, cfg, subj[0])
    bottom = strata(lower["depth"], max_depth, cfg, subj[1])
    return {
        "id": tid,
        "upper": upper["id"],
        "lower": lower["id"],
        "upper_portal": up_portal["index"],
        "lower_portal": low_portal["index"],
        "drop": R2(drop),
        "length": R2(length),
        "width": R2(width),
        "height": R2(cfg["portal"]["height"] + 0.15 * level),
        "feeding_lemmas": feeding,
        "chain_length": len(chain),
        "ornament": {"level": level, "rib_spacing": tc["rib_spacing"][level]},
        "path": [[R2(x), R2(y), R2(z)] for x, y, z, _ in path],
        "lower_in_upper": {"pos": [R2(v) for v in origin], "yaw": RA(psi)},
        "markers": markers,
        "light": [top["light"], bottom["light"]],
        "fog": [top["fog"], bottom["fog"]],
        "rock": [top["rock"], bottom["rock"]],
    }


# ---------------------------------------------------------------- the whole scene


def build(nodes: list[dict], cfg: dict, depth_of: dict[str, int]) -> dict:
    """nodes: [{id, kind, depth, subject, deps, feeding_lemmas, chain}] for the landmarks."""
    by = {n["id"]: n for n in nodes}
    max_depth = max(n["depth"] for n in nodes)
    users: dict[str, list[tuple[str, int]]] = {n["id"]: [] for n in nodes}
    feeding: dict[tuple[str, str], int] = {}
    chains: dict[tuple[str, str], list[str]] = {}
    for n in nodes:
        for k, d in enumerate(n["deps"]):
            users[d].append((n["id"], k))
            feeding[(n["id"], d)] = n["feeding_lemmas"][k]
            chains[(n["id"], d)] = n["chain"][k]
    tc = cfg["tunnel"]
    chambers: dict[str, dict] = {}
    for n in sorted(nodes, key=lambda x: x["id"]):
        ups = sorted(n["deps"], key=lambda d: (-by[d]["depth"], d))
        downs = sorted((u for u, _ in users[n["id"]]), key=lambda u: (by[u]["depth"], u))
        ch = chamber(
            n,
            [(d, tunnel_width(feeding[(n["id"], d)], tc), by[d]["subject"]) for d in ups],
            [(u, tunnel_width(feeding[(u, n["id"])], tc), by[u]["subject"]) for u in downs],
            cfg,
            max_depth,
        )
        for i, p in enumerate(ch["portals"]):
            p["index"] = i
            lower, upper = (n["id"], p["target"]) if p["dir"] == "up" else (p["target"], n["id"])
            p["tunnel"] = f"{lower}>{upper}"
        chambers[n["id"]] = ch

    from .scene_fit import LayoutError, collect_violations, failure_names, separation_plan

    def make_tunnel(lower_id: str, upper_id: str, extra: dict) -> dict:
        low_c, up_c = chambers[lower_id], chambers[upper_id]
        up_p = next(p for p in up_c["portals"] if p["dir"] == "down" and p["target"] == lower_id)
        low_p = next(p for p in low_c["portals"] if p["dir"] == "up" and p["target"] == upper_id)
        return tunnel(
            up_c,
            low_c,
            up_p,
            low_p,
            chains[(lower_id, upper_id)],
            feeding[(lower_id, upper_id)],
            depth_of,
            cfg,
            max_depth,
            (by[upper_id]["subject"], by[lower_id]["subject"]),
            extra.get("extra_run", 0.0),
            extra.get("straight", False),
        )

    extras: dict[str, dict] = {}
    tunnels: list[dict] = []
    index: dict[str, int] = {}
    for n in sorted(nodes, key=lambda x: x["id"]):
        for d in n["deps"]:
            built = make_tunnel(n["id"], d, {})
            index[built["id"]] = len(tunnels)
            tunnels.append(built)

    def scene_of() -> dict:
        return {
            "schema_version": SCHEMA_VERSION,
            "conventions": {
                "units": "metres",
                "up": "+Y",
                "handedness": "right",
                "yaw": "angle about +Y; heading(yaw) = (sin yaw, 0, cos yaw), so yaw 0 faces +Z",
                "chamber_frame": "origin at the centre of the chamber floor; absolute floor height is floor_y",
                "tunnel_frame": "path, markers and lower_in_upper are in the upper chamber's frame",
                "statement_wall": "centred at pos, facing heading(yaw), size [width, height]",
                "portal": "a doorway in the chamber wall at pos; yaw points out of the chamber, down the tunnel",
                "gallery": "a wedge of one subject, from inner_radius to outer_radius between angles a0 and a1 (a1 may exceed 2π); portal_indices are the doorways on that outer arc",
                "ribs": "placed every ornament.rib_spacing metres of path length, measured from the upper doorway",
                "strata": "light and fog apply at a chamber; along a tunnel they run linearly with height between [top, bottom]",
            },
            "metres_per_depth": cfg["metres_per_depth"],
            "chambers": [chambers[k] for k in sorted(chambers)],
            "tunnels": tunnels,
        }

    # Each pass lengthens every tunnel that is currently in the way, then checks every star.
    # Farther chambers are locked first, so a nearer one is walked past a chamber that stays put.
    # A bend comes out on its own pass: the extra metres are measured along that straightened line.
    for i in range(SEPARATION_PASSES):
        violations = collect_violations(scene_of())
        if not violations:
            if i:
                print(f"scene: separated chambers in {i} passes")
            return scene_of()
        plan = separation_plan(scene_of())
        print(f"scene: pass {i + 1}, {len(violations)} problems, {len(plan)} tunnels to move", flush=True)
        if not plan:
            break
        moved = False
        for tid in sorted(plan):
            slot = extras.setdefault(tid, {"extra_run": 0.0, "straight": False})
            step = plan[tid]
            changed = False
            if step["straight"] and not slot["straight"]:
                slot["straight"] = True
                changed = True
            if step["extra"] > 0:
                slot["extra_run"] += step["extra"]
                changed = True
            if not changed:
                continue
            moved = True
            lower_id, upper_id = tid.split(">", 1)
            tunnels[index[tid]] = make_tunnel(lower_id, upper_id, slot)
        if not moved:
            break
    violations = collect_violations(scene_of())
    if not violations:
        return scene_of()
    sample = "; ".join(
        f"{v['kind']} {v['home']}/{v['other']} via {v['tunnel']} (rate {v['rate']:.2f}, need {v['need']:.0f} m)"
        for v in violations[:6]
    )
    err = LayoutError(f"layout did not separate ({len(violations)}): {sample}; chambers: {failure_names(violations)}")
    err.violations = violations
    err.scene = scene_of()
    raise err


def run() -> None:
    import json

    cfg = config()["inside"]
    lms = read_stage("curate")["landmarks"]
    col = read_stage("collapse")
    dep = read_stage("depth")
    ex = read_stage("extract")["statements"]
    nodes = [
        {
            "id": lm["label"],
            "kind": ex[lm["label"]]["kind"],
            "depth": dep["depth"][lm["label"]],
            "subject": lm["subject"],
            "deps": col[lm["label"]]["deps"],
            "feeding_lemmas": col[lm["label"]]["feeding_lemmas"],
            "chain": col[lm["label"]]["chain"],
        }
        for lm in lms
    ]
    scene = build(nodes, cfg, dep["all"])
    write_stage("scene", scene)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "scene.json").write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    size = (DATA / "scene.json").stat().st_size
    longest = max(scene["tunnels"], key=lambda t: t["length"])
    print(f"scene: {len(scene['chambers'])} chambers, {len(scene['tunnels'])} tunnels, {sum(len(t['markers']) for t in scene['tunnels'])} markers -> data/scene.json ({size / 1024:.0f} KB)")
    print(f"scene: longest tunnel {longest['id']} is {longest['length']} m")
