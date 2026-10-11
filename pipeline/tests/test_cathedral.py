"""The cathedral's descriptors (pipeline/cathedral.py).

Nothing here reads set.mm, so these run without a build. Every number the cathedral shows about
primes is checked against plain trial division; the layout is checked for the symmetry the
experience design promises, and for determinism (CLAUDE.md rules 9 and 10).
"""

import copy
import json
import math
import random

import pytest
from jsonschema import Draft202012Validator

from pipeline.cathedral import build
from pipeline.files import ROOT, config

CFG = config()["cathedral"]

ARCS = {
    "foundations": ["logic", "sets", "infinity"],
    "discrete": ["number-theory", "combinatorics", "graph-theory"],
    "structure": ["algebra-symmetry", "linear-algebra", "complex-numbers"],
    "space-change": ["geometry", "topology", "calculus-analysis"],
}
CENTRE = {"foundations": 0, "discrete": 90, "structure": -90, "space-change": 180}


@pytest.fixture(scope="module")
def cathedral():
    return build(CFG)


def trial_division(n: int) -> list[int]:
    out, d = [], 2
    while d * d <= n:
        while n % d == 0:
            out.append(d)
            n //= d
        d += 1
    if n > 1:
        out.append(n)
    return out


def heading(yaw: float) -> tuple[float, float]:
    return math.sin(yaw), math.cos(yaw)


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False)


def test_twelve_doors_one_per_plane(cathedral):
    planes = [d["plane"] for d in cathedral["doors"]]
    assert len(planes) == 12
    assert sorted(planes) == sorted(p for ps in ARCS.values() for p in ps)
    assert len(set(planes)) == 12


def test_arcs_hold_the_planes_the_experience_design_names(cathedral):
    assert {a["id"]: a["planes"] for a in cathedral["arcs"]} == ARCS
    assert {a["id"]: a["placement"] for a in cathedral["arcs"]} == {
        "foundations": "far-wall",
        "discrete": "left",
        "structure": "right",
        "space-change": "entrance",
    }
    for d in cathedral["doors"]:
        assert d["plane"] in ARCS[d["arc"]]


def test_doors_stand_30_degrees_apart_from_the_far_wall(cathedral):
    doors = sorted(cathedral["doors"], key=lambda d: d["slot"])
    assert [d["slot"] for d in doors] == list(range(12))
    for d in doors:
        assert -180 < d["bearing_deg"] <= 180
        assert (d["bearing_deg"] / 30) % 12 == d["slot"]
        b = math.radians(d["bearing_deg"])
        r = cathedral["hall"]["radius"]
        assert d["pos"][0] == pytest.approx(r * math.sin(b), abs=0.011)
        assert d["pos"][1] == 0
        assert d["pos"][2] == pytest.approx(r * math.cos(b), abs=0.011)
    # each arc is centred where the experience design puts it: the far wall dead ahead of the
    # visitor, the discrete arc to the left (+X), structure to the right, space and change behind
    for arc, planes in ARCS.items():
        bearings = sorted(((d["bearing_deg"] - CENTRE[arc] + 180) % 360) - 180 for d in cathedral["doors"] if d["arc"] == arc)
        assert bearings == [-30, 0, 30], arc
        assert len(planes) == 3


def test_first_plane_of_an_arc_is_leftmost_as_seen_from_the_middle(cathedral):
    by_plane = {d["plane"]: d for d in cathedral["doors"]}
    for arc, planes in ARCS.items():
        offsets = [((by_plane[p]["bearing_deg"] - CENTRE[arc] + 180) % 360) - 180 for p in planes]
        assert offsets == [30, 0, -30], arc


def test_hall_is_symmetric(cathedral):
    pts = {(round(d["pos"][0], 1), round(d["pos"][2], 1)): d for d in cathedral["doors"]}

    def partner(x: float, z: float):
        for (px, pz), d in pts.items():
            if abs(px - x) < 0.05 and abs(pz - z) < 0.05:
                return d
        return None

    for d in cathedral["doors"]:
        x, _, z = d["pos"]
        mirror = partner(-x, z)
        assert mirror is not None, d["plane"]
        # a mirror image swaps the left and right arcs and keeps the far wall and entrance
        swap = {"discrete": "structure", "structure": "discrete"}
        assert mirror["arc"] == swap.get(d["arc"], d["arc"])
        turned = partner(z, -x)  # a quarter turn about +Y
        assert turned is not None, d["plane"]
        assert turned["slot"] == (d["slot"] + 3) % 12


def test_doors_face_the_centre(cathedral):
    r = cathedral["hall"]["radius"]
    for d in cathedral["doors"]:
        hx, hz = heading(d["yaw"])
        assert d["pos"][0] + hx * r == pytest.approx(0, abs=0.02)
        assert d["pos"][2] + hz * r == pytest.approx(0, abs=0.02)
        assert -math.pi < d["yaw"] <= math.pi


def test_pedestal_stands_in_front_of_its_door(cathedral):
    h = cathedral["hall"]
    for d in cathedral["doors"]:
        p = d["pedestal"]["pos"]
        assert math.hypot(p[0], p[2]) == pytest.approx(h["radius"] - CFG["hall"]["pedestal"]["inset"], abs=0.02)
        assert math.atan2(p[0], p[2]) == pytest.approx(math.atan2(d["pos"][0], d["pos"][2]), abs=0.001)


def test_each_door_has_a_place_to_stand_in_front_of_its_pedestal_facing_the_door(cathedral):
    inset = CFG["hall"]["pedestal"]["inset"]
    stand = CFG["hall"]["stand"]
    for d in cathedral["doors"]:
        x, _, z = d["stand"]["pos"]
        # on the same bearing as the door, `stand` metres nearer the middle than the pedestal
        assert math.hypot(x, z) == pytest.approx(cathedral["hall"]["radius"] - inset - stand, abs=0.02)
        assert math.atan2(x, z) == pytest.approx(math.atan2(d["pos"][0], d["pos"][2]), abs=0.001)
        # and faces the door: heading(yaw) points outward, at the door
        hx, hz = heading(d["stand"]["yaw"])
        assert x + hx * (math.hypot(d["pos"][0], d["pos"][2]) - math.hypot(x, z)) == pytest.approx(d["pos"][0], abs=0.02)
        assert z + hz * (math.hypot(d["pos"][0], d["pos"][2]) - math.hypot(x, z)) == pytest.approx(d["pos"][2], abs=0.02)


def test_arrival_is_at_the_hall_centre_facing_the_far_wall(cathedral):
    a = cathedral["arrival"]
    assert a["pos"] == [0, 0, 0]
    assert a["yaw"] == 0
    assert a["dais_radius"] == CFG["arrival"]["dais_radius"]


def test_visitor_lands_facing_foundations_with_space_and_change_behind(cathedral):
    hx, hz = heading(cathedral["arrival"]["yaw"])
    for arc in cathedral["arcs"]:
        bx, bz = math.sin(math.radians(arc["centre_deg"])), math.cos(math.radians(arc["centre_deg"]))
        dot = hx * bx + hz * bz
        if arc["id"] == "foundations":
            assert dot == pytest.approx(1)
        if arc["id"] == "space-change":
            assert dot == pytest.approx(-1)


def arc_lengths(path):
    out = [0.0]
    for a, b in zip(path, path[1:]):
        out.append(out[-1] + math.dist(a, b))
    return out


def test_threshold_lasts_20_to_30_seconds(cathedral):
    t = cathedral["threshold"]
    arc = arc_lengths(t["path"])
    seconds = sum((seg["s_to"] - seg["s_from"]) / seg["speed"] for seg in t["segments"])
    assert t["duration_s"] == pytest.approx(seconds, abs=0.02)
    assert 20 <= t["duration_s"] <= 30
    assert arc[-1] == pytest.approx(t["segments"][-1]["s_to"], abs=0.05)


def test_threshold_segments_cover_the_path_without_gaps(cathedral):
    t = cathedral["threshold"]
    segs = t["segments"]
    assert [s["kind"] for s in segs] == ["drift", "descent"]
    assert segs[0]["s_from"] == 0
    for a, b in zip(segs, segs[1:]):
        assert b["s_from"] == a["s_to"]


def test_threshold_path_ends_at_the_arrival_dais(cathedral):
    path = cathedral["threshold"]["path"]
    assert path[-1] == cathedral["arrival"]["pos"]


def test_threshold_ends_in_the_vault_and_the_visitor_descends_onto_the_dais(cathedral):
    t = cathedral["threshold"]
    path, hall = t["path"], cathedral["hall"]
    assert path[0][0] == 0 and path[0][1] == CFG["threshold"]["entry_height"]
    assert path[0][1] > hall["wall_height"]  # it starts up in the vault, not in the hall
    assert path[0][2] < -hall["radius"]  # behind the entrance wall, outside the ring of doors
    assert cathedral["vault"]["tiers"][0]["y"] <= path[0][1] <= cathedral["vault"]["tiers"][1]["y"]
    arc = arc_lengths(path)
    descent = next(s for s in t["segments"] if s["kind"] == "descent")
    below = [p for p, s in zip(path, arc) if s >= descent["s_from"] - 1e-6]
    assert len(below) >= 3
    assert all(p[0] == 0 and p[2] == 0 for p in below)  # straight down onto the dais
    assert all(b[1] < a[1] for a, b in zip(below, below[1:]))


def test_vertical_part_is_slow_and_short(cathedral):
    t = cathedral["threshold"]
    drift, descent = t["segments"]
    length = descent["s_to"] - descent["s_from"]
    assert descent["speed"] <= 1.3 and descent["speed"] < drift["speed"]
    assert length <= 16
    assert length / descent["speed"] <= 12


def test_threshold_never_moves_back_or_up(cathedral):
    path = cathedral["threshold"]["path"]
    for a, b in zip(path, path[1:]):
        assert b[2] >= a[2] - 1e-9 and b[1] <= a[1] + 1e-9


def test_threshold_passes_over_the_wall_with_room_to_spare(cathedral):
    hall = cathedral["hall"]
    for p in cathedral["threshold"]["path"]:
        if math.hypot(p[0], p[2]) >= hall["radius"] - 0.01:
            assert p[1] >= hall["wall_height"] + 1  # even the feet clear the wall


def test_no_ring_of_the_tunnel_touches_the_wall(cathedral):
    """The rings are circles in a plane across the tunnel. Sample each one and check no point of it
    lies inside the wall: the solid between the hall radius and the radius plus the wall thickness,
    up to the wall's height, with 10 cm to spare."""
    hall = cathedral["hall"]
    lo, hi, top = hall["radius"] - 0.1, hall["radius"] + hall["wall_thickness"] + 0.1, hall["wall_height"] + 0.1
    for ring in cathedral["threshold"]["rings"]:
        for i in range(720):
            a = 2 * math.pi * i / 720
            x, y, z = ring["pos"][0] + ring["radius"] * math.cos(a), ring["pos"][1] + ring["radius"] * math.sin(a), ring["pos"][2]
            assert not (lo <= math.hypot(x, z) <= hi and y <= top), (ring["k"], x, y, z)


def test_every_guided_segment_has_a_vignette_and_the_descent_a_stronger_one(cathedral):
    t = cathedral["threshold"]
    drift, descent = t["segments"]
    assert 0 < drift["vignette"] < descent["vignette"] <= 1
    assert t["ease_s"] > 0


def test_threshold_rings_shrink_by_a_constant_ratio(cathedral):
    t = CFG["threshold"]
    rings = cathedral["threshold"]["rings"]
    assert len(rings) == t["rings"]
    assert rings[0]["radius"] == pytest.approx(t["start_radius"], abs=1e-4)
    assert rings[-1]["radius"] == pytest.approx(t["end_radius"], abs=1e-4)
    ratio = (t["end_radius"] / t["start_radius"]) ** (1 / (t["rings"] - 1))
    for a, b in zip(rings, rings[1:]):
        assert b["radius"] / a["radius"] == pytest.approx(ratio, rel=1e-4)
        assert b["scale"] / a["scale"] == pytest.approx(ratio, rel=1e-4)
        assert b["rotation"] - a["rotation"] == pytest.approx(math.radians(t["rotation_deg"]), abs=1e-4)


def test_threshold_motif_is_a_sierpinski_triangle(cathedral):
    m = cathedral["threshold"]["motif"]
    assert m["kind"] == "sierpinski"
    assert len(m["triangles"]) == 3 ** m["depth"]
    area = lambda t: abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2  # noqa: E731
    whole = 3 * math.sqrt(3) / 4  # a triangle inscribed in the unit circle
    assert sum(area(t) for t in m["triangles"]) == pytest.approx(whole * (3 / 4) ** m["depth"], rel=1e-3)


def test_rings_line_the_tunnel_and_the_last_one_is_its_mouth(cathedral):
    t = cathedral["threshold"]
    path = t["path"]
    drift_end = t["segments"][0]["s_from"] + CFG["threshold"]["straight"]
    arc = arc_lengths(path)
    eye = t["eye_height"]
    assert eye == CFG["threshold"]["eye_height"]
    for ring in t["rings"]:
        # centred at eye level over the path, which is where the feet go
        assert min(math.dist(ring["pos"], [p[0], p[1] + eye, p[2]]) for p in path) < 1.0
        assert ring["pitch"] == 0  # the tunnel is level; the descent has no rings
    last = t["rings"][-1]
    i = min(range(len(path)), key=lambda j: math.dist([path[j][0], path[j][1] + eye, path[j][2]], last["pos"]))
    assert arc[i] == pytest.approx(drift_end, abs=1.0)


def test_vault_tiers_shrink_by_a_constant_ratio_and_rise(cathedral):
    v = CFG["vault"]
    tiers = cathedral["vault"]["tiers"]
    assert len(tiers) == v["tiers"]
    assert tiers[0]["radius"] == pytest.approx(cathedral["hall"]["radius"], abs=0.01)
    for a, b in zip(tiers, tiers[1:]):
        assert b["radius"] / a["radius"] == pytest.approx(v["ratio"], rel=1e-3)
        assert b["y"] > a["y"]
        assert b["sides"] == v["sides"]
    assert tiers[0]["y"] == cathedral["hall"]["wall_height"]


def test_prime_stack_preview_matches_trial_division(cathedral):
    door = next(d for d in cathedral["doors"] if d["plane"] == "number-theory")
    assert door["preview"]["id"] == "prime-stacks"
    towers = door["preview"]["params"]["towers"]
    assert [t["n"] for t in towers] == sorted(CFG["previews"]["prime-stacks"]["numbers"])
    block = CFG["previews"]["prime-stacks"]["block"]
    for t in towers:
        assert [b["prime"] for b in t["blocks"]] == trial_division(t["n"])  # smallest at the bottom
        assert [b["y"] for b in t["blocks"]] == [round(i * block, 2) for i in range(len(t["blocks"]))]
        assert math.prod(b["prime"] for b in t["blocks"]) == t["n"]


def test_every_door_names_a_preview(cathedral):
    ids = {d["plane"]: d["preview"]["id"] for d in cathedral["doors"]}
    assert ids["number-theory"] == "prime-stacks"
    assert ids["topology"] == "torus-cup"
    assert ids["calculus-analysis"] == "limit-curve"
    curve = next(d for d in cathedral["doors"] if d["plane"] == "calculus-analysis")["preview"]["params"]["points"]
    assert all(y < 1 for _, y in curve) and curve[-1][1] > curve[0][1]  # creeps toward 1, never reaches it
    assert set(ids.values()) <= {"prime-stacks", "limit-curve", "torus-cup", "ring-motif"}


def test_build_is_byte_identical_and_order_independent():
    a = canonical(build(CFG))
    assert canonical(build(CFG)) == a
    shuffled = copy.deepcopy(CFG)
    random.Random(3).shuffle(shuffled["planes"])
    random.Random(4).shuffle(shuffled["arcs"])
    shuffled["previews"]["prime-stacks"]["numbers"].reverse()
    assert canonical(build(shuffled)) == a


def test_two_planes_in_one_slot_fail_the_build():
    bad = copy.deepcopy(CFG)
    bad["planes"][1]["order"] = bad["planes"][0]["order"]
    with pytest.raises(SystemExit, match="same slot"):
        build(bad)


def test_an_arc_without_three_planes_fails_the_build():
    bad = copy.deepcopy(CFG)
    bad["planes"][0]["arc"] = "discrete"
    with pytest.raises(SystemExit, match="three"):
        build(bad)


def test_output_validates_against_schema(cathedral):
    schema = json.loads((ROOT / "docs" / "schemas" / "cathedral.schema.json").read_text(encoding="utf8"))
    Draft202012Validator.check_schema(schema)
    errors = list(Draft202012Validator(schema).iter_errors(json.loads(json.dumps(cathedral))))
    assert not errors, errors[:3]
