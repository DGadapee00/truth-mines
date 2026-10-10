"""Gallery packing and the overlap check for pipeline/scene.py.

`build` is the only caller. Nothing here runs in the app: the app receives the finished descriptors.
"""

from __future__ import annotations

import math

from .scene import heading, rotate

CLEARANCE = 0.05
DOOR_TRIM = 1.5


class LayoutError(RuntimeError):
    """Chambers drawn together still overlap, or a tunnel still enters one, after the cap."""


def layout_galleries(node_id: str, radius: float, height: float, doors: list[dict], cfg: dict) -> tuple[list, list, list]:
    """Pack `doors` into subject wedges around a hall of `radius`.

    A wedge's radial length never exceeds `gallery.max_length`. One ring of wedges is only
    `max_length` metres of extra wall, which is not enough arc for the widest hubs, so a subject
    that needs more is several wedges of that subject, one beyond the last, doors on the outermost.
    """
    if not doors:
        return [], [], []
    gap = cfg["portal"]["gap"]
    gcfg = cfg["gallery"]
    stmt = cfg["chamber"]["statement_arc"] / radius
    free = 2 * math.pi - stmt
    min_ang = gcfg["mouth"] / radius
    # A hand's breadth of wall between wedges, so neighbouring meshes do not share a face.
    seam = 0.2 / radius
    by: dict[str, list[dict]] = {}
    for door in doors:
        by.setdefault(door["subject"], []).append(door)
    chunks: list[list[dict]] = [by[s] for s in sorted(by)]

    def span(chunk: list[dict]) -> float:
        return sum(d["width"] + gap for d in chunk)

    n = len(chunks)
    room = free - seam * max(0, n - 1)
    if room < n * min_ang - 1e-6:
        raise LayoutError(f"{node_id}: gallery mouths do not fit on the hall")
    spans = [span(c) for c in chunks]
    total = sum(spans) or 1.0
    spare = room - n * min_ang
    angs = [min_ang + spare * s / total for s in spans]

    from .scene import R2, RA, plaque, rng_for, wrap

    pr = cfg["pillar"]
    ph = cfg["portal"]["height"]
    max_len = gcfg["max_length"]
    min_len = gcfg["min_length"]
    cursor = math.pi + stmt / 2
    portals: list[dict] = []
    pillars: list[dict] = []
    galleries: list[dict] = []
    for i, (chunk, ang) in enumerate(zip(chunks, angs)):
        a0 = cursor
        a1 = cursor + ang
        centre = (a0 + a1) / 2
        radial = max(min_len, span(chunk) / ang - radius)
        ranks = max(1, math.ceil(radial / max_len - 1e-9))
        piece = radial / ranks
        outer_final = radius + radial
        if span(chunk) > ang * outer_final + 1e-3:
            raise LayoutError(f"{node_id}: subject {chunk[0]['subject']} does not fit in {max_len} m galleries")
        hx, hz = heading(centre)
        r_cursor = radius
        for rank in range(ranks):
            inner = r_cursor
            outer = inner + piece
            r_cursor = outer
            indices: list[int] = []
            if rank == ranks - 1:
                used = sum((d["width"] + gap) / outer for d in chunk)
                slack = max(0.0, ang - used) / len(chunk)
                door_cursor = a0
                for door in chunk:
                    slot = (door["width"] + gap) / outer + slack
                    yaw = door_cursor + slot / 2
                    door_cursor += slot
                    px, pz = heading(yaw)
                    indices.append(len(portals))
                    portals.append(
                        {
                            "dir": door["dir"],
                            "target": door["target"],
                            "yaw": RA(wrap(yaw)),
                            "pos": [R2(outer * px), 0.0, R2(outer * pz)],
                            "width": R2(door["width"]),
                            "height": ph,
                            "plaque": plaque(yaw, outer, slot / 2, door["width"], cfg),
                        }
                    )
                    if door["dir"] == "up":
                        prng = rng_for(f"pillar:{node_id}>{door['target']}")
                        inset = gcfg["pillar_setback"]
                        pillars.append(
                            {
                                "target": door["target"],
                                "pos": [R2((outer - inset) * px), 0.0, R2((outer - inset) * pz)],
                                "radius": R2(pr["min_radius"] + prng.random() * (pr["max_radius"] - pr["min_radius"])),
                                "height": R2(height),
                            }
                        )
            galleries.append(
                {
                    "subject": chunk[0]["subject"],
                    "yaw": RA(wrap(centre)),
                    "pos": [R2(inner * hx), 0.0, R2(inner * hz)],
                    "width": R2(ang * inner),
                    "length": R2(piece),
                    "height": R2(height),
                    "inner_radius": R2(inner),
                    "outer_radius": R2(outer),
                    "a0": RA(a0),
                    "a1": RA(a1),
                    "portal_indices": indices,
                }
            )
        cursor = a1 + (seam if i < n - 1 else 0.0)
    return portals, pillars, galleries


# ---------------------------------------------------------------- overlap and tunnel clearance


def _invert_pose(pose: dict) -> dict:
    x, z = rotate(pose["pos"][0], pose["pos"][2], -pose["yaw"])
    return {"pos": [-x, -pose["pos"][1], -z], "yaw": -pose["yaw"]}


def _volume(chamber: dict, pose: dict, tunnel_id: str | None, exit_yaw: float) -> dict:
    # A wedge is an annular sector around the chamber origin, not a four-corner quad.
    # A quad across a wedge wider than π covers the doorway beside it.
    sectors = [
        {"a0": g["a0"], "a1": g["a1"], "r0": g["inner_radius"], "r1": g["outer_radius"]}
        for g in chamber["galleries"]
        if g["a1"] > g["a0"] and g["outer_radius"] > g["inner_radius"]
    ]
    return {
        "id": chamber["id"],
        "tunnel": tunnel_id,
        "exit_yaw": exit_yaw,
        "yaw": pose["yaw"],
        "cx": pose["pos"][0],
        "cz": pose["pos"][2],
        "r": chamber["radius"],
        "y0": pose["pos"][1],
        "y1": pose["pos"][1] + chamber["height"],
        "sectors": sectors,
        "bound": max([chamber["radius"], *[g["outer_radius"] for g in chamber["galleries"]]], default=chamber["radius"]),
    }


def _star(home: dict, chambers: dict[str, dict], tunnels: dict[str, dict]) -> list[dict]:
    ident = {"pos": [0.0, 0.0, 0.0], "yaw": 0.0}
    vols = [_volume(home, ident, None, 0.0)]
    for portal in home["portals"]:
        tunnel = tunnels[portal["tunnel"]]
        far = chambers[portal["target"]]
        pose = tunnel["lower_in_upper"] if portal["dir"] == "down" else _invert_pose(tunnel["lower_in_upper"])
        vols.append(_volume(far, pose, tunnel["id"], portal["yaw"]))
    return vols


def _in_span(ang: float, a0: float, a1: float) -> bool:
    y = ang
    while y < a0 - 1e-8:
        y += 2 * math.pi
    while y >= a0 + 2 * math.pi - 1e-8:
        y -= 2 * math.pi
    return a0 - 1e-8 <= y <= a1 + 1e-8


def _polar(vol: dict, x: float, z: float) -> tuple[float, float]:
    lx, lz = rotate(x - vol["cx"], z - vol["cz"], -vol["yaw"])
    return math.hypot(lx, lz), math.atan2(lx, lz)


def _shrink_sector(s: dict, margin: float) -> dict | None:
    r1 = s["r1"] - margin
    r0 = s["r0"] + margin
    inset = margin / max(r1, 1e-6)
    a0, a1 = s["a0"] + inset, s["a1"] - inset
    if r1 <= r0 + 1e-6 or a1 <= a0 + 1e-6:
        return None
    return {"a0": a0, "a1": a1, "r0": r0, "r1": r1}


def _point_in_sector(x: float, z: float, vol: dict, s: dict) -> bool:
    rad, ang = _polar(vol, x, z)
    return s["r0"] - 1e-8 <= rad <= s["r1"] + 1e-8 and _in_span(ang, s["a0"], s["a1"])


def _dist_point_sector(x: float, z: float, vol: dict, s: dict) -> float:
    lx, lz = rotate(x - vol["cx"], z - vol["cz"], -vol["yaw"])
    rad = math.hypot(lx, lz)
    ang = math.atan2(lx, lz)
    mid = (s["a0"] + s["a1"]) / 2
    while ang < mid - math.pi:
        ang += 2 * math.pi
    while ang > mid + math.pi:
        ang -= 2 * math.pi
    if s["a0"] <= ang <= s["a1"]:
        if rad < s["r0"]:
            return s["r0"] - rad
        if rad > s["r1"]:
            return rad - s["r1"]
        return 0.0
    edge = s["a0"] if ang < s["a0"] else s["a1"]
    clamped = min(s["r1"], max(s["r0"], rad))
    return math.hypot(lx - clamped * math.sin(edge), lz - clamped * math.cos(edge))


def _seg_circle(ax: float, az: float, bx: float, bz: float, radius: float) -> list[tuple[float, float]]:
    dx, dz = bx - ax, bz - az
    aa = dx * dx + dz * dz
    if aa < 1e-12:
        return []
    bb = 2 * (ax * dx + az * dz)
    cc = ax * ax + az * az - radius * radius
    disc = bb * bb - 4 * aa * cc
    if disc < 0:
        return []
    root = math.sqrt(disc)
    out = []
    for t in ((-bb - root) / (2 * aa), (-bb + root) / (2 * aa)):
        if -1e-8 <= t <= 1 + 1e-8:
            t = min(1.0, max(0.0, t))
            out.append((ax + t * dx, az + t * dz))
    return out


def _seg_hits_sector(ax: float, az: float, bx: float, bz: float, vol: dict, s: dict) -> bool:
    if _point_in_sector(ax, az, vol, s) or _point_in_sector(bx, bz, vol, s):
        return True
    lax, laz = rotate(ax - vol["cx"], az - vol["cz"], -vol["yaw"])
    lbx, lbz = rotate(bx - vol["cx"], bz - vol["cz"], -vol["yaw"])
    for ang in (s["a0"], s["a1"]):
        wall = (
            (s["r0"] * math.sin(ang), s["r0"] * math.cos(ang)),
            (s["r1"] * math.sin(ang), s["r1"] * math.cos(ang)),
        )
        if _segs_cross((lax, laz), (lbx, lbz), wall[0], wall[1]):
            return True
    for radius in (s["r0"], s["r1"]):
        for hx, hz in _seg_circle(lax, laz, lbx, lbz, radius):
            if _in_span(math.atan2(hx, hz), s["a0"], s["a1"]):
                return True
    return False


def _seg_seg_dist(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], d: tuple[float, float]) -> float:
    if _segs_cross(a, b, c, d):
        return 0.0
    return min(
        _dist_point_seg(a[0], a[1], c[0], c[1], d[0], d[1]),
        _dist_point_seg(b[0], b[1], c[0], c[1], d[0], d[1]),
        _dist_point_seg(c[0], c[1], a[0], a[1], b[0], b[1]),
        _dist_point_seg(d[0], d[1], a[0], a[1], b[0], b[1]),
    )


def _seg_sector_gap(ax: float, az: float, bx: float, bz: float, vol: dict, s: dict) -> float:
    """Shortest distance from the segment a-b to the sector `s` of `vol`, 0 if they meet.

    The nearest point of the sector lies on its boundary: a radial wall or an arc. On an arc it is
    either at the arc's end (on a radial wall), at the angle of a segment end, or at the angle of the
    segment point nearest the centre.
    """
    if _seg_hits_sector(ax, az, bx, bz, vol, s):
        return 0.0
    la = rotate(ax - vol["cx"], az - vol["cz"], -vol["yaw"])
    lb = rotate(bx - vol["cx"], bz - vol["cz"], -vol["yaw"])
    best = math.inf
    for ang in (s["a0"], s["a1"]):
        wall = ((s["r0"] * math.sin(ang), s["r0"] * math.cos(ang)), (s["r1"] * math.sin(ang), s["r1"] * math.cos(ang)))
        best = min(best, _seg_seg_dist(la, lb, wall[0], wall[1]))
    dx, dz = lb[0] - la[0], lb[1] - la[1]
    den = dx * dx + dz * dz
    t = 0.0 if den < 1e-12 else max(0.0, min(1.0, -(la[0] * dx + la[1] * dz) / den))
    for px, pz in (la, lb, (la[0] + t * dx, la[1] + t * dz)):
        if _in_span(math.atan2(px, pz), s["a0"], s["a1"]):
            rad = math.hypot(px, pz)
            best = min(best, abs(rad - s["r0"]), abs(rad - s["r1"]))
    return best


def _world_corner(vol: dict, ang: float, rad: float) -> tuple[float, float]:
    lx, lz = rad * math.sin(ang), rad * math.cos(ang)
    wx, wz = rotate(lx, lz, vol["yaw"])
    return vol["cx"] + wx, vol["cz"] + wz


def _radial_edge(vol: dict, ang: float, r0: float, r1: float) -> tuple[tuple[float, float], tuple[float, float]]:
    return _world_corner(vol, ang, r0), _world_corner(vol, ang, r1)


def _circle_hits(c0x: float, c0z: float, r0: float, c1x: float, c1z: float, r1: float) -> list[tuple[float, float]]:
    dx, dz = c1x - c0x, c1z - c0z
    dist = math.hypot(dx, dz)
    if dist < 1e-9 or dist > r0 + r1 + 1e-8 or dist < abs(r0 - r1) - 1e-8:
        return []
    h = (r0 * r0 - r1 * r1 + dist * dist) / (2 * dist)
    perp = math.sqrt(max(0.0, r0 * r0 - h * h))
    hx, hz = c0x + h * dx / dist, c0z + h * dz / dist
    if perp < 1e-8:
        return [(hx, hz)]
    ox, oz = -dz / dist * perp, dx / dist * perp
    return [(hx + ox, hz + oz), (hx - ox, hz - oz)]


def _on_arc(x: float, z: float, vol: dict, s: dict, radius: float) -> bool:
    rad, ang = _polar(vol, x, z)
    return abs(rad - radius) < 1e-4 and _in_span(ang, s["a0"], s["a1"])


def _sectors_overlap(va: dict, sa: dict, vb: dict, sb: dict) -> bool:
    a, b = _shrink_sector(sa, CLEARANCE / 2), _shrink_sector(sb, CLEARANCE / 2)
    if a is None or b is None:
        return False
    for src, svol, dsec, dvol in ((a, va, b, vb), (b, vb, a, va)):
        for ang in (src["a0"], src["a1"]):
            for rad in (src["r0"], src["r1"]):
                x, z = _world_corner(svol, ang, rad)
                if _point_in_sector(x, z, dvol, dsec):
                    return True
    edges_a = [_radial_edge(va, ang, a["r0"], a["r1"]) for ang in (a["a0"], a["a1"])]
    edges_b = [_radial_edge(vb, ang, b["r0"], b["r1"]) for ang in (b["a0"], b["a1"])]
    for ea in edges_a:
        for eb in edges_b:
            if _segs_cross(ea[0], ea[1], eb[0], eb[1]):
                return True
    return _sectors_boundaries(va, a, vb, b)


def _sectors_boundaries(va: dict, a: dict, vb: dict, b: dict) -> bool:
    """Radial walls against arcs, and arc against arc. `a` and `b` are already shrunk."""
    for src, svol, dsec, dvol in ((a, va, b, vb), (b, vb, a, va)):
        for ang in (src["a0"], src["a1"]):
            p0 = _world_corner(svol, ang, src["r0"])
            p1 = _world_corner(svol, ang, src["r1"])
            lx0, lz0 = rotate(p0[0] - dvol["cx"], p0[1] - dvol["cz"], -dvol["yaw"])
            lx1, lz1 = rotate(p1[0] - dvol["cx"], p1[1] - dvol["cz"], -dvol["yaw"])
            for radius in (dsec["r0"], dsec["r1"]):
                for hx, hz in _seg_circle(lx0, lz0, lx1, lz1, radius):
                    if _in_span(math.atan2(hx, hz), dsec["a0"], dsec["a1"]):
                        return True
    for ra in (a["r0"], a["r1"]):
        for rb in (b["r0"], b["r1"]):
            for hx, hz in _circle_hits(va["cx"], va["cz"], ra, vb["cx"], vb["cz"], rb):
                if _on_arc(hx, hz, va, a, ra) and _on_arc(hx, hz, vb, b, rb):
                    return True
    return False


def _dist_point_seg(px: float, pz: float, ax: float, az: float, bx: float, bz: float) -> float:
    abx, abz = bx - ax, bz - az
    den = abx * abx + abz * abz
    t = 0.0 if den < 1e-12 else max(0.0, min(1.0, ((px - ax) * abx + (pz - az) * abz) / den))
    return math.hypot(ax + t * abx - px, az + t * abz - pz)


def _segs_cross(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float], d: tuple[float, float]) -> bool:
    def cross(p, q, r) -> float:
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    d1 = cross(a, b, c)
    d2 = cross(a, b, d)
    d3 = cross(c, d, a)
    d4 = cross(c, d, b)
    return (d1 > 0) != (d2 > 0) and (d3 > 0) != (d4 > 0)


def _y_overlap(a: dict, b: dict) -> bool:
    return a["y1"] > b["y0"] + CLEARANCE and b["y1"] > a["y0"] + CLEARANCE


def _volumes_overlap(a: dict, b: dict) -> bool:
    if not _y_overlap(a, b):
        return False
    dist = math.hypot(a["cx"] - b["cx"], a["cz"] - b["cz"])
    # Galleries stick out past the hall. If even those bounding radii miss, nothing else can meet.
    if dist >= a["bound"] + b["bound"] - CLEARANCE:
        return False
    if dist < a["r"] + b["r"] - CLEARANCE:
        return True
    limit_a, limit_b = a["r"] - CLEARANCE, b["r"] - CLEARANCE
    if any(_dist_point_sector(a["cx"], a["cz"], b, s) < limit_a for s in b["sectors"]):
        return True
    if any(_dist_point_sector(b["cx"], b["cz"], a, s) < limit_b for s in a["sectors"]):
        return True
    return any(_sectors_overlap(a, sa, b, sb) for sa in a["sectors"] for sb in b["sectors"])


def _choose_tunnel(a: dict, b: dict) -> tuple[float, str, float]:
    dist = math.hypot(a["cx"] - b["cx"], a["cz"] - b["cz"])
    need = max(2.0, a["bound"] + b["bound"] + CLEARANCE - dist)
    options = []
    for vol, other in ((a, b), (b, a)):
        if not vol["tunnel"]:
            continue
        dx, dz = vol["cx"] - other["cx"], vol["cz"] - other["cz"]
        length = math.hypot(dx, dz) or 1.0
        hx, hz = heading(vol["exit_yaw"])
        rate = (hx * dx + hz * dz) / length
        options.append((rate, vol["tunnel"]))
    if not options:
        raise LayoutError(f"overlapping chambers {a['id']} and {b['id']} have no tunnel to move")
    options.sort(key=lambda item: (-item[0], item[1]))
    rate, tunnel_id = options[0]
    return rate, tunnel_id, need


def _clip_y(a: list[float], b: list[float], y0: float, y1: float) -> tuple[list[float], list[float]] | None:
    if max(a[1], b[1]) < y0 or min(a[1], b[1]) > y1:
        return None

    def at(t: float) -> list[float]:
        return [a[i] + t * (b[i] - a[i]) for i in range(3)]

    t0, t1 = 0.0, 1.0
    dy = b[1] - a[1]
    if abs(dy) > 1e-9:
        ta, tb = (y0 - a[1]) / dy, (y1 - a[1]) / dy
        lo, hi = min(ta, tb), max(ta, tb)
        t0, t1 = max(t0, lo), min(t1, hi)
    if t1 < t0 - 1e-9:
        return None
    return at(t0), at(t1)


def _path_hits(path: list[list[float]], vol: dict, pad: float = 0.0, rise: float = 0.0) -> bool:
    """Whether a tunnel along `path` enters `vol`.

    `pad` is the tunnel's half-width and `rise` its height, so the walls and the vault count,
    not only the centre line of the floor. The walls must stay CLEARANCE outside the chamber.
    """
    for a, b in zip(path, path[1:]):
        clipped = _clip_y(a, b, vol["y0"] - 1e-3 - rise, vol["y1"])
        if clipped is None:
            continue
        p, q = clipped
        reach = math.hypot(p[0] - q[0], p[2] - q[2]) + vol["bound"] + pad
        if math.hypot((p[0] + q[0]) / 2 - vol["cx"], (p[2] + q[2]) / 2 - vol["cz"]) > reach:
            continue
        # The walls keep CLEARANCE of rock between the tunnel and the chamber.
        if _dist_point_seg(vol["cx"], vol["cz"], p[0], p[2], q[0], q[2]) < vol["r"] + pad + CLEARANCE:
            return True
        for sector in vol["sectors"]:
            if _seg_sector_gap(p[0], p[2], q[0], q[2], vol, sector) < pad + CLEARANCE:
                return True
    return False


def _tunnel_hits(portal: dict, tunnel: dict, vol: dict, home_id: str) -> bool:
    """Whether the tunnel through `portal` of `home_id` enters `vol`, away from its own two doorways.

    At its own doorways a tunnel meets its chamber by design. The trim there is the doorway
    allowance plus the half-width, so the tunnel's walls clear the chamber's wall before the check starts.
    """
    pad = tunnel.get("width", 0.0) / 2
    start = DOOR_TRIM + (pad if vol["id"] == home_id and vol["tunnel"] is None else 0.0)
    end = DOOR_TRIM + (pad if vol["tunnel"] == tunnel["id"] else 0.0)
    path = _trim(_outward_path(portal, tunnel), start, end=end)
    return len(path) >= 2 and _path_hits(path, vol, pad, tunnel.get("height", 0.0))


def _trim(path: list[list[float]], trim: float, end: float | None = None) -> list[list[float]]:
    end_trim = trim if end is None else end
    if len(path) < 2:
        return []
    acc = [0.0]
    for a, b in zip(path, path[1:]):
        acc.append(acc[-1] + math.dist(a, b))
    total = acc[-1]
    if total <= trim + end_trim + 1e-6:
        return []
    lo, hi = trim, total - end_trim
    out: list[list[float]] = []
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        s0, s1 = acc[i], acc[i + 1]
        if s1 < lo or s0 > hi:
            continue

        def at(s: float, a: list[float] = a, b: list[float] = b, s0: float = s0, s1: float = s1) -> list[float]:
            t = 0.0 if s1 == s0 else (s - s0) / (s1 - s0)
            t = max(0.0, min(1.0, t))
            return [a[k] + t * (b[k] - a[k]) for k in range(3)]

        if not out:
            out.append(at(max(s0, lo)))
        out.append(at(min(s1, hi)))
    return out


def _path_in_home(portal: dict, tunnel: dict) -> list[list[float]]:
    path = tunnel["path"]
    if portal["dir"] == "down":
        return path
    pose = _invert_pose(tunnel["lower_in_upper"])
    out = []
    for point in path:
        x, z = rotate(point[0], point[2], pose["yaw"])
        out.append([pose["pos"][0] + x, pose["pos"][1] + point[1], pose["pos"][2] + z])
    return out


# Lengthening past this does not separate the pair: the doorway faces the wrong way.
# build stops rather than walking the tunnel out by this much on every pass.
SHIFT_LIMIT = 1200.0


def _moved(vol: dict, dist: float) -> dict:
    """Copy `vol` translated by `dist` metres along its exit yaw. The shape moves with the centre."""
    hx, hz = heading(vol["exit_yaw"])
    dx, dz = hx * dist, hz * dist
    return {**vol, "cx": vol["cx"] + dx, "cz": vol["cz"] + dz}


def _shift_until_clear(vol: dict, hits) -> float | None:
    """Smallest move along the exit yaw that makes `hits` false, or None if SHIFT_LIMIT cannot."""
    if not hits(vol):
        return 0.0
    lo, hi = 0.0, 1.0
    while hi < SHIFT_LIMIT and hits(_moved(vol, hi)):
        lo = hi
        hi = min(SHIFT_LIMIT, hi * 2)
    if hits(_moved(vol, hi)):
        return None
    for _ in range(14):
        mid = (lo + hi) / 2
        if hits(_moved(vol, mid)):
            lo = mid
        else:
            hi = mid
    return hi


def _nearly_straight(path: list[list[float]]) -> bool:
    if len(path) < 3:
        return True
    a, b = path[0], path[-1]
    return all(_dist_point_seg(p[0], p[2], a[0], a[2], b[0], b[2]) < 0.08 for p in path)


def _outward_path(portal: dict, tunnel: dict) -> list[list[float]]:
    """Centre line in the home frame, starting at the home doorway and ending at the far one."""
    path = _path_in_home(portal, tunnel)
    return list(reversed(path)) if portal["dir"] == "up" else path


def _extended_path(portal: dict, tunnel: dict) -> list[list[float]]:
    """The outward centre line, then a straight run on past the far door.

    Lengthening moves the far chamber along this line, so a chamber beside the line has to
    clear the whole run, not only where the path happens to stop this pass.
    """
    path = _outward_path(portal, tunnel)
    if len(path) < 2:
        return path
    a, b = path[-2], path[-1]
    span = math.dist(a, b) or 1.0
    scale = SHIFT_LIMIT / span
    end = [b[0] + (b[0] - a[0]) * scale, b[1], b[2] + (b[2] - a[2]) * scale]
    return _trim(path + [end], DOOR_TRIM, end=0.0)


def collect_violations(scene: dict) -> list[dict]:
    """Overlaps and tunnel intrusions, one row per problem, in a stable order."""
    chambers = {c["id"]: c for c in scene["chambers"]}
    tunnels = {t["id"]: t for t in scene["tunnels"]}
    found: list[dict] = []
    for home in scene["chambers"]:
        vols = _star(home, chambers, tunnels)
        for i, a in enumerate(vols):
            for b in vols[i + 1 :]:
                if not _volumes_overlap(a, b):
                    continue
                rate, tunnel_id, need = _choose_tunnel(a, b)
                others = [x["id"] for x in (a, b) if x["id"] != home["id"]]
                found.append(
                    {
                        "kind": "overlap",
                        "home": home["id"],
                        "other": others[0],
                        "also": others[1:],
                        "tunnel": tunnel_id,
                        "rate": rate,
                        "need": need,
                    }
                )
        for portal in home["portals"]:
            tunnel = tunnels[portal["tunnel"]]
            for vol in vols:
                if not _tunnel_hits(portal, tunnel, vol, home["id"]):
                    continue
                found.append(
                    {
                        "kind": "path",
                        "home": home["id"],
                        "other": vol["id"],
                        "also": [],
                        "tunnel": tunnel["id"],
                        "rate": 1.0,
                        "need": 4.0,
                    }
                )
    found.sort(key=lambda v: (v["kind"], v["home"], v["other"], tuple(v["also"]), v["tunnel"]))
    return found


def separation_plan(scene: dict) -> dict[str, dict]:
    """How far to lengthen each tunnel, and which bends to take out.

    Per home, farther chambers are locked first and nearer ones are walked out past them,
    so two chambers cannot chase each other. A bend is removed before any length is added:
    the extra metres are measured along the straightened doorway.
    """
    chambers = {c["id"]: c for c in scene["chambers"]}
    tunnels = {t["id"]: t for t in scene["tunnels"]}
    crooked: set[str] = set()
    for home in scene["chambers"]:
        vols = _star(home, chambers, tunnels)
        for portal in home["portals"]:
            tunnel = tunnels[portal["tunnel"]]
            if _nearly_straight(tunnel["path"]):
                continue
            far = next(v for v in vols[1:] if v["tunnel"] == tunnel["id"])
            hits = any(_tunnel_hits(portal, tunnel, v, home["id"]) for v in vols)
            crowded = any(_volumes_overlap(far, v) for v in vols if v is not far)
            if hits or crowded:
                crooked.add(tunnel["id"])
    if crooked:
        return {tid: {"extra": 0.0, "straight": True} for tid in sorted(crooked)}

    extra: dict[str, float] = {}
    for home in scene["chambers"]:
        vols = _star(home, chambers, tunnels)
        home_vol, neighbours = vols[0], vols[1:]
        if not neighbours:
            continue
        shift = [0.0] * len(neighbours)

        def at(i: int, shift: list[float] = shift, neighbours: list[dict] = neighbours) -> dict:
            return neighbours[i] if shift[i] == 0.0 else _moved(neighbours[i], shift[i])

        long = [(tunnels[portal["tunnel"]], _extended_path(portal, tunnels[portal["tunnel"]])) for portal in home["portals"]]
        for tunnel, path in long:
            if len(path) < 2:
                continue
            pad, rise = tunnel.get("width", 0.0) / 2, tunnel.get("height", 0.0)
            for j, vol in enumerate(neighbours):
                if vol["tunnel"] == tunnel["id"]:
                    continue
                placed = at(j)
                if not _path_hits(path, placed, pad, rise):
                    continue
                add = _shift_until_clear(placed, lambda m, path=path, pad=pad, rise=rise: _path_hits(path, m, pad, rise))
                if add is None:
                    print(f"scene: {vol['id']} stays on the centre line from {home['id']}", flush=True)
                elif add:
                    # A few centimetres past the contact, so rounding the tunnel back to centimetres stays clear.
                    shift[j] += add + 0.05

        locked = [home_vol]
        order = sorted(range(len(neighbours)), key=lambda i: -math.hypot(at(i)["cx"], at(i)["cz"]))
        for i in order:
            placed = at(i)

            def blocked(m: dict, locked: list[dict] = locked) -> bool:
                return any(_volumes_overlap(m, other) for other in locked)

            add = _shift_until_clear(placed, blocked)
            if add is None:
                print(f"scene: {placed['id']} stays against a nearer chamber of {home['id']}", flush=True)
            elif add:
                # A few centimetres past the contact, so rounding the tunnel back to centimetres stays clear.
                shift[i] += add + 0.05
            locked.append(at(i))

        for i, vol in enumerate(neighbours):
            if shift[i] > 1e-4 and vol["tunnel"]:
                extra[vol["tunnel"]] = max(extra.get(vol["tunnel"], 0.0), shift[i])
    return {tid: {"extra": extra[tid], "straight": True} for tid in sorted(extra)}


def failure_names(violations: list[dict]) -> str:
    names: set[str] = set()
    for v in violations:
        names.add(v["home"])
        names.add(v["other"])
        names.update(v["also"])
    return ", ".join(sorted(names))
