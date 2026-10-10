"""Gallery packing and the rule that chambers drawn together do not overlap.

These build a few nodes in memory. They do not need pipeline/build or data/scene.json.
"""

import math

import pytest

from pipeline.files import config
from pipeline.scene import build
from pipeline.scene_fit import collect_violations


CM = 0.02


def node(id: str, depth: int, subject: str, deps: list[str], feeding: list[int], kind: str = "theorem") -> dict:
    return {
        "id": id,
        "kind": kind,
        "depth": depth,
        "subject": subject,
        "deps": deps,
        "feeding_lemmas": feeding,
        "chain": [[id, d] for d in deps],
    }


def depth_of(nodes: list[dict]) -> dict[str, int]:
    out = {n["id"]: n["depth"] for n in nodes}
    for n in nodes:
        for chain in n["chain"]:
            for lemma in chain:
                out.setdefault(lemma, n["depth"])
    return out


def test_an_overlapping_pair_is_reported_and_a_clear_pair_is_not():
    def scene(gap: float) -> dict:
        return {
            "chambers": [
                {"id": "home", "radius": 8, "height": 6, "galleries": [], "portals": [{"dir": "down", "target": "far", "yaw": 0.0, "tunnel": "far>home", "pos": [0, 0, 8]}]},
                {"id": "far", "radius": 8, "height": 6, "galleries": [], "portals": []},
            ],
            # The path stops on the near side of `far` (its doorway), not on the far side of the cylinder.
            "tunnels": [{"id": "far>home", "path": [[0, 0, 8], [0, 0, gap - 8]], "lower_in_upper": {"pos": [0, 0, gap], "yaw": 0.0}}],
        }

    # Centres 10 m apart, radii 8 and 8: the cylinders interpenetrate.
    hit = collect_violations(scene(10))
    assert hit and hit[0]["kind"] == "overlap"
    assert {hit[0]["home"], hit[0]["other"], *hit[0]["also"]} >= {"home", "far"}
    # Centres 30 m apart: the cylinders clear, and the trimmed path stays outside both halls.
    assert collect_violations(scene(30)) == []


def test_a_wedge_wider_than_half_a_turn_does_not_swallow_the_next_door():
    # A single quad across a wedge wider than π covers the doorway beside it.
    # The sector has to be the wedge itself: a ray just past its end stays clear.
    yaw = 3.7
    door = [32 * math.sin(yaw), 0.0, 32 * math.cos(yaw)]
    far_point = [80 * math.sin(yaw), 0.0, 80 * math.cos(yaw)]
    near = [24 * math.sin(yaw), 0.0, 24 * math.cos(yaw)]
    scene = {
        "chambers": [
            {
                "id": "home",
                "radius": 15,
                "height": 6,
                "galleries": [{"inner_radius": 15, "outer_radius": 32, "a0": 0.0, "a1": 3.5}],
                "portals": [{"dir": "down", "target": "far", "yaw": yaw, "tunnel": "far>home", "pos": door}],
            },
            {"id": "far", "radius": 4, "height": 6, "galleries": [], "portals": []},
        ],
        "tunnels": [
            {
                "id": "far>home",
                "path": [door, near, far_point],
                "lower_in_upper": {"pos": [90 * math.sin(yaw), -1, 90 * math.cos(yaw)], "yaw": 0.0},
            }
        ],
    }
    assert collect_violations(scene) == []


def test_a_tunnel_through_a_hall_is_reported():
    scene = {
        "chambers": [
            {
                "id": "home",
                "radius": 8,
                "height": 6,
                "galleries": [],
                "portals": [{"dir": "down", "target": "far", "yaw": 0.0, "tunnel": "far>home", "pos": [0, 0, 8]}],
            },
            {"id": "far", "radius": 4, "height": 6, "galleries": [], "portals": []},
        ],
        "tunnels": [
            {
                "id": "far>home",
                # From the doorway, back through the middle of the hall, then out the far side.
                "path": [[0, 0, 8], [0, 0, 0], [0, 0, -30]],
                "lower_in_upper": {"pos": [0, -1, -40], "yaw": 0.0},
            }
        ],
    }
    kinds = {v["kind"] for v in collect_violations(scene)}
    assert "path" in kinds


def test_a_small_hall_has_no_galleries_and_same_depth_neighbours_are_separated():
    cfg = config()["inside"]
    hub = node("hub", 10, "logic", [], [], kind="axiom")
    children = [node(f"c{i:02d}", 10, "logic", ["hub"], [1]) for i in range(12)]
    nodes = [hub, *children]
    scene = build(nodes, cfg, depth_of(nodes))
    assert collect_violations(scene) == []
    hall = next(c for c in scene["chambers"] if c["id"] == "hub")
    assert hall["galleries"] == []
    assert cfg["chamber"]["min_radius"] - CM <= hall["radius"] <= cfg["chamber"]["max_radius"]
    again = build(list(reversed(nodes)), cfg, depth_of(nodes))
    assert again == scene


def test_a_crowded_hub_splits_a_subject_into_wedges_no_longer_than_the_cap():
    cfg = config()["inside"]
    # Width-5 doors (feeding 1e5). Thirty of them need more outer arc than one 20 m wedge has.
    hub = node("hub", 4, "sets", [], [])
    children = [node(f"c{i:02d}", 4 + (i + 1) * 80, "sets", ["hub"], [100_000]) for i in range(30)]
    scene = build([hub, *children], cfg, depth_of([hub, *children]))
    assert collect_violations(scene) == []
    hall = next(c for c in scene["chambers"] if c["id"] == "hub")
    assert hall["radius"] == pytest.approx(cfg["chamber"]["max_radius"], abs=CM)
    galleries = hall["galleries"]
    assert galleries
    assert all(g["subject"] == "sets" for g in galleries)
    assert all(g["length"] <= cfg["gallery"]["max_length"] + CM for g in galleries)
    assert len(galleries) >= 2
    # Ranks of one sector share angles and meet end to end. Doors sit on the outermost only.
    sectors: dict[tuple[float, float], list] = {}
    for g in galleries:
        sectors.setdefault((g["a0"], g["a1"]), []).append(g)
    covered: list[int] = []
    for group in sectors.values():
        group.sort(key=lambda g: g["inner_radius"])
        assert group[0]["inner_radius"] == pytest.approx(hall["radius"], abs=CM)
        for a, b in zip(group, group[1:]):
            assert b["inner_radius"] == pytest.approx(a["outer_radius"], abs=CM)
            assert a["portal_indices"] == []
        covered.extend(group[-1]["portal_indices"])
        assert group[-1]["portal_indices"]
    assert sorted(covered) == list(range(len(hall["portals"])))
    for p in hall["portals"]:
        assert math.hypot(p["pos"][0], p["pos"][2]) > hall["radius"] + 1
