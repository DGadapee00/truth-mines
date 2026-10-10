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
            assert abs(math.hypot(pl["pos"][0], pl["pos"][2]) - (wall - 0.12)) < 2 * CM
            assert angle_gap(math.atan2(pl["pos"][0], pl["pos"][2]), p["yaw"]) < 1e-3
            assert p["height"] < pl["pos"][1] < c["height"]
            assert angle_gap(pl["yaw"], p["yaw"] + math.pi) < 1e-4
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
            # In front of its doorway, with room between the pillar and that wall.
            assert math.hypot(p["pos"][0], p["pos"][2]) + p["radius"] < math.hypot(opening["pos"][0], opening["pos"][2]) - 0.5
            assert cfg["pillar"]["min_radius"] - CM <= p["radius"] <= cfg["pillar"]["max_radius"] + CM
            assert p["height"] == c["height"]
        for i, p in enumerate(c["pillars"]):
            for q in c["pillars"][:i]:
                assert math.dist(p["pos"], q["pos"]) >= p["radius"] + q["radius"] + 0.5, (c["id"], p["target"], q["target"])
        if not c["galleries"]:
            assert _ups_first([p["dir"] for p in c["portals"]])
        assert c["floor_y"] == pytest.approx(-c["depth"] * cfg["metres_per_depth"], abs=CM)
    assert split, "a hub should need more than one wedge for one subject"


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
