"""The Inside view's scene descriptors (pipeline/scene.py), checked against the graph and against
the geometry they promise. Every descriptor kind is covered: chambers, statement walls, doorways
and plaques, pillars, tunnel paths, the placement of the lower chamber, markers, width and
ornament, and strata.

Runs on pipeline/build/ (`python -m pipeline` first). In CI a missing build is a failure.
"""

import math
import os

import pytest

from pipeline.files import config, read_stage, stage_file
from pipeline.scene import build, heading, ornament_level, rotate, tunnel_width
from pipeline.scene_fit import collect_violations

BUILT = all(stage_file(s).exists() for s in ("curate", "collapse", "depth", "scene"))
pytestmark = pytest.mark.skipif(not BUILT and not os.environ.get("CI"), reason="run `python -m pipeline` first")

CM = 0.015  # lengths are rounded to the centimetre, so a distance can be off by up to 0.7 cm per axis


@pytest.fixture(scope="module")
def world():
    cfg = config()["inside"]
    scene = read_stage("scene")
    col = read_stage("collapse")
    dep = read_stage("depth")
    lms = read_stage("curate")["landmarks"]
    return cfg, scene, col, dep, lms


def angle_gap(a: float, b: float) -> float:
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


def seg_dist(p, a, b):
    ab = [b[i] - a[i] for i in range(3)]
    ap = [p[i] - a[i] for i in range(3)]
    t = max(0.0, min(1.0, sum(x * y for x, y in zip(ab, ap)) / max(1e-12, sum(x * x for x in ab))))
    return math.dist(p, [a[i] + t * ab[i] for i in range(3)])


def test_one_chamber_per_landmark_and_one_tunnel_per_edge(world):
    _, scene, col, _, lms = world
    assert sorted(c["id"] for c in scene["chambers"]) == sorted(lm["label"] for lm in lms)
    edges = sorted(f"{b}>{a}" for b, t in col.items() for a in t["deps"])
    assert sorted(t["id"] for t in scene["tunnels"]) == edges
    ch = {c["id"]: c for c in scene["chambers"]}
    for t in scene["tunnels"]:
        up = ch[t["upper"]]["portals"][t["upper_portal"]]
        low = ch[t["lower"]]["portals"][t["lower_portal"]]
        assert (up["dir"], up["target"], up["tunnel"]) == ("down", t["lower"], t["id"])
        assert (low["dir"], low["target"], low["tunnel"]) == ("up", t["upper"], t["id"])


def _ups_first(dirs: list[str]) -> bool:
    return dirs == sorted(dirs, key=lambda d: d != "up")


def _lift(a: float, a0: float) -> float:
    y = a
    while y < a0 - 1e-6:
        y += 2 * math.pi
    while y >= a0 + 2 * math.pi - 1e-6:
        y -= 2 * math.pi
    return y


def _plaque_ends(pl: dict) -> tuple[tuple[float, float], tuple[float, float]]:
    """(x, z) of the plaque's two ends. It faces heading(yaw), so it runs across that."""
    hx, hz = heading(pl["yaw"])
    half = pl["width"] / 2
    x, z = pl["pos"][0], pl["pos"][2]
    return (x + hz * half, z - hx * half), (x - hz * half, z + hx * half)


def _crosses(a, b, c, d) -> bool:
    def side(p, q, r) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    return (side(a, b, c) > 0) != (side(a, b, d) > 0) and (side(c, d, a) > 0) != (side(c, d, b) > 0)


def test_chambers_fit_their_doorways_statement_and_pillars(world):
    cfg, scene, col, _, lms = world
    assert collect_violations(scene) == []
    subject = {lm["label"]: lm["subject"] for lm in lms}
    stmt = cfg["chamber"]["statement_arc"]
    split = False
    for c in scene["chambers"]:
        r = c["radius"]
        assert cfg["chamber"]["min_radius"] - CM <= r <= cfg["chamber"]["max_radius"] + CM
        assert c["height"] >= cfg["portal"]["height"] + 2 - CM
        assert c["dome"] == pytest.approx(c["height"] * cfg["chamber"]["dome_rise"], abs=CM) and c["dome"] > c["height"]
        owned: dict[int, dict] = {}
        for g in c["galleries"]:
            assert cfg["gallery"]["min_length"] - CM <= g["length"] <= cfg["gallery"]["max_length"] + CM
            assert g["outer_radius"] == pytest.approx(g["inner_radius"] + g["length"], abs=CM)
            assert g["inner_radius"] >= r - CM
            half = stmt / (2 * r)
            assert g["a0"] >= math.pi + half - 1e-3
            assert g["a1"] <= 2 * math.pi + (math.pi - half) + 1e-2
            for i in g["portal_indices"]:
                assert i not in owned, (c["id"], i)
                owned[i] = g
                assert subject[c["portals"][i]["target"]] == g["subject"]
        if any(sum(1 for g in c["galleries"] if g["subject"] == s) >= 2 for s in {g["subject"] for g in c["galleries"]}):
            split = True
        if c["galleries"]:
            assert sorted(owned) == list(range(len(c["portals"])))
            sectors = sorted({(g["a0"], g["a1"]) for g in c["galleries"]})
            for (a0, a1), (b0, _b1) in zip(sectors, sectors[1:]):
                assert a1 <= b0 + 1e-4, c["id"]
        else:
            assert c["galleries"] == []
        for i, p in enumerate(c["portals"]):
            wall = math.hypot(p["pos"][0], p["pos"][2])
            if i in owned:
                assert wall == pytest.approx(owned[i]["outer_radius"], abs=CM)
                yaw = _lift(p["yaw"], owned[i]["a0"])
                assert owned[i]["a0"] - 1e-3 <= yaw <= owned[i]["a1"] + 1e-3
            else:
                assert abs(wall - r) < CM
            pl = p["plaque"]
            # A flat sign in front of a curved wall: centred on the doorway, at most a metre in from
            # the wall, and both its ends in front of that wall, never behind it.
            rho = math.hypot(pl["pos"][0], pl["pos"][2])
            assert wall - 1.0 <= rho <= wall - 0.12 + CM, (c["id"], p["target"])
            assert angle_gap(math.atan2(pl["pos"][0], pl["pos"][2]), p["yaw"]) < 1e-3
            assert p["height"] < pl["pos"][1] < c["height"]
            assert angle_gap(pl["yaw"], p["yaw"] + math.pi) < 1e-4
            assert 2.0 <= pl["width"] <= max(3.2, p["width"] + 1.6) + CM, (c["id"], p["target"])
            for end in _plaque_ends(pl):
                assert math.hypot(*end) <= wall - 0.1, (c["id"], p["target"])
                if i in owned:
                    g = owned[i]
                    assert g["a0"] <= _lift(math.atan2(*end), g["a0"]) <= g["a1"], (c["id"], p["target"])
        # No two signs meet.
        signs = [_plaque_ends(p["plaque"]) for p in c["portals"]]
        for k, (s0, s1) in enumerate(signs):
            for t0, t1 in signs[:k]:
                assert not _crosses(s0, s1, t0, t1), c["id"]
                assert min(math.dist(s0, t0), math.dist(s0, t1), math.dist(s1, t0), math.dist(s1, t1)) > 0.05, c["id"]
        # Ring doorways, and the statement wall, keep clear of each other. Gallery doorways sit
        # further out; they are checked against their own wedge above.
        ring = [p for i, p in enumerate(c["portals"]) if i not in owned]
        arcs = [(math.pi, stmt / 2 / r)] + [(p["yaw"], (p["width"] / 2) / r) for p in ring]
        for i in range(len(arcs)):
            for j in range(i):
                assert angle_gap(arcs[i][0], arcs[j][0]) + 1e-4 >= arcs[i][1] + arcs[j][1], (c["id"], i, j)
        for g in c["galleries"]:
            doors = [c["portals"][i] for i in g["portal_indices"]]
            assert _ups_first([p["dir"] for p in doors])
            for i, p in enumerate(doors):
                pr = math.hypot(p["pos"][0], p["pos"][2])
                for q in doors[:i]:
                    assert angle_gap(p["yaw"], q["yaw"]) + 1e-4 >= (p["width"] / 2 + q["width"] / 2) / pr, (c["id"], p["target"], q["target"])
        sw = c["statement"]
        assert sw["pos"][2] < 0 and abs(sw["pos"][2]) < r and sw["yaw"] == 0
        assert sw["size"][0] <= 2 * r
        for sx in (-1, 1):
            assert math.hypot(sx * sw["size"][0] / 2, sw["pos"][2]) < r - 0.1, c["id"]
        assert sorted(p["target"] for p in c["pillars"]) == sorted(col[c["id"]]["deps"])
        door = {p["target"]: p for p in c["portals"] if p["dir"] == "up"}
        for p in c["pillars"]:
            a = math.atan2(p["pos"][0], p["pos"][2])
            opening = door[p["target"]]
            assert angle_gap(a, opening["yaw"]) < 1e-2
            # In front of its doorway, a metre clear of that wall (as before galleries: r - 1).
            assert math.hypot(p["pos"][0], p["pos"][2]) + p["radius"] < math.hypot(opening["pos"][0], opening["pos"][2]) - 1
            assert cfg["pillar"]["min_radius"] - CM <= p["radius"] <= cfg["pillar"]["max_radius"] + CM
            assert p["height"] == c["height"]
        for i, p in enumerate(c["pillars"]):
            for q in c["pillars"][:i]:
                assert math.dist(p["pos"], q["pos"]) >= p["radius"] + q["radius"] + 0.5, (c["id"], p["target"], q["target"])
        if not c["galleries"]:
            assert _ups_first([p["dir"] for p in c["portals"]])
        assert c["floor_y"] == pytest.approx(-c["depth"] * cfg["metres_per_depth"], abs=CM)
    assert split, "a hub should need more than one wedge for one subject"


def _place(pose: dict, p: list[float]) -> list[float]:
    x, z = rotate(p[0], p[2], pose["yaw"])
    return [pose["pos"][0] + x, pose["pos"][1] + p[1], pose["pos"][2] + z]


def _unplace(pose: dict) -> dict:
    x, z = rotate(-pose["pos"][0], -pose["pos"][2], -pose["yaw"])
    return {"pos": [x, -pose["pos"][1], z], "yaw": -pose["yaw"]}


def test_no_tunnel_wall_enters_a_hall_or_gallery_of_its_star(world):
    """Independent of pipeline/scene_fit.py: the tunnel's two walls, at its full width, sampled every
    half metre, from floor to vault, stay out of every hall and gallery drawn with it, except within
    the doorway allowance (1.5 m plus the half-width) at the tunnel's own two ends. The pipeline
    keeps 5 cm of rock; rounding to the centimetre can take back at most 2 cm of it."""
    _, scene, _, _, _ = world
    ch = {c["id"]: c for c in scene["chambers"]}
    tu = {t["id"]: t for t in scene["tunnels"]}
    margin = -0.02
    ident = {"pos": [0.0, 0.0, 0.0], "yaw": 0.0}

    def inside(c: dict, pose: dict, p: list[float], rise: float) -> bool:
        x, z = rotate(p[0] - pose["pos"][0], p[2] - pose["pos"][2], -pose["yaw"])
        y = p[1] - pose["pos"][1]
        if y + rise < 0.01 or y > c["dome"]:
            return False
        r = math.hypot(x, z)
        # The hall's ceiling rises from `height` at the wall to `dome` at the centre.
        if r < c["radius"] - margin and y < c["height"] + (c["dome"] - c["height"]) * (1 - r / c["radius"]):
            return True
        if y > c["height"]:
            return False
        a = math.atan2(x, z)
        for g in c["galleries"]:
            inset = margin / max(r, 1.0)
            if g["inner_radius"] + margin < r < g["outer_radius"] - margin and g["a0"] + inset < _lift(a, g["a0"]) < g["a1"] - inset:
                return True
        return False

    wrong = set()
    for home in scene["chambers"]:
        star = [(home, ident, None)]
        for portal in home["portals"]:
            t = tu[portal["tunnel"]]
            pose = t["lower_in_upper"] if portal["dir"] == "down" else _unplace(t["lower_in_upper"])
            star.append((ch[portal["target"]], pose, t["id"]))
        reach = [max([c["radius"], *(g["outer_radius"] for g in c["galleries"])]) for c, _, _ in star]
        for portal in home["portals"]:
            t = tu[portal["tunnel"]]
            path = [list(p) for p in t["path"]]
            if portal["dir"] == "up":
                path = [_place(_unplace(t["lower_in_upper"]), p) for p in reversed(path)]
            half = t["width"] / 2
            walked = [0.0]
            for a, b in zip(path, path[1:]):
                walked.append(walked[-1] + math.dist(a, b))
            total = walked[-1]
            for i, (a, b) in enumerate(zip(path, path[1:])):
                run = math.hypot(b[0] - a[0], b[2] - a[2]) or 1.0
                ax, az = -(b[2] - a[2]) / run, (b[0] - a[0]) / run
                for (c, pose, tid), far in zip(star, reach):
                    # Too far from this chamber to matter.
                    if math.hypot(a[0] - pose["pos"][0], a[2] - pose["pos"][2]) > far + half + run + 1:
                        continue
                    own_start = tid is None
                    own_end = tid == t["id"]
                    n = max(1, math.ceil(math.dist(a, b) / 0.5))
                    for k in range(n + 1):
                        f = k / n
                        s = walked[i] + f * (walked[i + 1] - walked[i])
                        if (own_start and s < 1.5 + half) or (own_end and total - s < 1.5 + half):
                            continue
                        p = [a[j] + f * (b[j] - a[j]) for j in range(3)]
                        for side in (-1, 1):
                            if inside(c, pose, [p[0] + side * half * ax, p[1], p[2] + side * half * az], t["height"]):
                                wrong.add((home["id"], t["id"], c["id"]))
    assert not wrong, sorted(wrong)


def test_tunnels_run_door_to_door_and_drop_exactly_the_depth_difference(world):
    cfg, scene, _, _, _ = world
    ch = {c["id"]: c for c in scene["chambers"]}
    grade = math.tan(math.radians(cfg["max_grade_deg"]))
    for t in scene["tunnels"]:
        up, low = ch[t["upper"]], ch[t["lower"]]
        path = t["path"]
        door = up["portals"][t["upper_portal"]]
        assert math.dist(path[0], door["pos"]) < CM, t["id"]
        # Drop: exactly the depth difference.
        drop = (low["depth"] - up["depth"]) * cfg["metres_per_depth"]
        assert t["drop"] == pytest.approx(drop, abs=CM)
        assert path[-1][1] == pytest.approx(-drop, abs=CM)
        assert low["floor_y"] - up["floor_y"] == pytest.approx(-drop, abs=2 * CM)
        # The lower chamber, placed by lower_in_upper, has its doorway at the tunnel's end,
        # facing back up the tunnel.
        pose = t["lower_in_upper"]
        ldoor = low["portals"][t["lower_portal"]]
        x, z = rotate(ldoor["pos"][0], ldoor["pos"][2], pose["yaw"])
        placed = [pose["pos"][0] + x, pose["pos"][1], pose["pos"][2] + z]
        assert math.dist(placed, path[-1]) < 3 * CM, t["id"]
        a, b = path[-2], path[-1]
        arrive = math.atan2(b[0] - a[0], b[2] - a[2])
        assert angle_gap(arrive, ldoor["yaw"] + pose["yaw"] + math.pi) < math.radians(3), t["id"]
        # Walkable: short segments, never steeper than max_grade, level at both ends.
        for p, q in zip(path, path[1:]):
            run = math.hypot(q[0] - p[0], q[2] - p[2])
            assert run <= cfg["path_step"] + CM
            assert abs(q[1] - p[1]) <= grade * run + CM, t["id"]
        flat = cfg["flat_ends"]
        walked = 0.0
        for p, q in zip(path, path[1:]):
            walked += math.hypot(q[0] - p[0], q[2] - p[2])
            if walked <= flat - CM:
                assert q[1] == pytest.approx(0, abs=CM)


def test_markers_come_from_the_chain_and_sit_at_their_own_depth(world):
    cfg, scene, col, dep, _ = world
    chains = {f"{b}>{a}": c for b, t in col.items() for a, c in zip(t["deps"], t["chain"])}
    depth_all = dep["all"]
    ch = {c["id"]: c for c in scene["chambers"]}
    m = cfg["markers"]["max"]
    for t in scene["tunnels"]:
        chain = chains[t["id"]]
        ids = [k["id"] for k in t["markers"]]
        assert len(ids) <= m
        if len(chain) <= m:
            assert ids == chain
        else:
            it = iter(chain)
            assert all(i in it for i in ids), "markers are not an ordered sample of the chain"
            assert ids[0] == chain[0] and ids[-1] == chain[-1]
        top = ch[t["upper"]]["depth"]
        prev = -1.0
        for k in t["markers"]:
            assert k["depth"] == depth_all[k["id"]]
            assert k["at"][1] == pytest.approx(-(k["depth"] - top) * cfg["metres_per_depth"], abs=CM)
            assert min(seg_dist(k["at"], a, b) for a, b in zip(t["path"], t["path"][1:])) < 2 * CM
            off = math.hypot(k["pos"][0] - k["at"][0], k["pos"][2] - k["at"][2])
            assert off == pytest.approx(t["width"] / 2 - 0.45, abs=2 * CM)
            assert k["s"] > prev
            prev = k["s"]
        assert t["chain_length"] == len(chain)


def test_width_ornament_and_plaques_come_from_feeding_lemmas(world):
    cfg, scene, col, _, _ = world
    feeding = {f"{b}>{a}": f for b, t in col.items() for a, f in zip(t["deps"], t["feeding_lemmas"])}
    tc = cfg["tunnel"]
    ch = {c["id"]: c for c in scene["chambers"]}
    for t in scene["tunnels"]:
        f = feeding[t["id"]]
        assert t["feeding_lemmas"] == f
        assert t["width"] == pytest.approx(tunnel_width(f, tc), abs=CM)
        level = sum(1 for th in tc["ornament"] if f >= th)
        assert t["ornament"] == {"level": level, "rib_spacing": tc["rib_spacing"][level]}
        assert ornament_level(f, tc) == level
        # Both doorways are as wide as the tunnel, and each has a plaque.
        for c, i in ((ch[t["upper"]], t["upper_portal"]), (ch[t["lower"]], t["lower_portal"])):
            assert c["portals"][i]["width"] == pytest.approx(t["width"], abs=CM)
            assert "plaque" in c["portals"][i]


def test_strata_darken_and_dim_with_depth(world):
    cfg, scene, _, _, lms = world
    subject = {lm["label"]: lm["subject"] for lm in lms}
    lum = lambda hx: sum(int(hx[i : i + 2], 16) for i in (1, 3, 5))  # noqa: E731
    cs = sorted(scene["chambers"], key=lambda c: c["depth"])
    for a, b in zip(cs, cs[1:]):
        assert 0 < b["light"] <= a["light"] + 1e-9
        assert b["fog"] >= a["fog"] - 1e-9
    assert cs[-1]["light"] < cs[0]["light"]
    # Rock colour: the subject's own colour at the surface, darker the deeper it lies.
    for c in cs:
        if c["depth"] == 0:
            assert c["rock"] == cfg["rock"][subject[c["id"]]]
    by: dict[str, list] = {}
    for c in cs:
        by.setdefault(subject[c["id"]], []).append(c)
    for group in by.values():
        for a, b in zip(group, group[1:]):
            assert lum(b["rock"]) <= lum(a["rock"]) + 3
    for t in scene["tunnels"]:
        assert t["light"][1] <= t["light"][0] + 1e-9


def test_geometry_is_deterministic_and_independent_of_input_order(world):
    cfg, scene, col, dep, lms = world
    ex_kind = {c["id"]: c["kind"] for c in scene["chambers"]}
    nodes = [
        {
            "id": lm["label"],
            "kind": ex_kind[lm["label"]],
            "depth": dep["depth"][lm["label"]],
            "subject": lm["subject"],
            "deps": col[lm["label"]]["deps"],
            "feeding_lemmas": col[lm["label"]]["feeding_lemmas"],
            "chain": col[lm["label"]]["chain"],
        }
        for lm in lms
    ]
    shuffled = nodes[::-1]
    a = build(nodes, cfg, dep["all"])
    b = build(shuffled, cfg, dep["all"])
    assert a == b
    assert a["chambers"] == scene["chambers"] and a["tunnels"] == scene["tunnels"]


def test_heading_and_rotate_follow_the_written_conventions():
    # yaw 0 faces +Z; rotating +Z by yaw gives heading(yaw).
    assert heading(0) == pytest.approx((0, 1))
    for yaw in (0.3, 1.7, -2.2):
        assert rotate(0, 1, yaw) == pytest.approx(heading(yaw))
