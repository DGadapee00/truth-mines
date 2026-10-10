"""Stage 9, plane: the number theory plane as engine-neutral descriptors
(data/plane-number-theory.json).

Three moments, each computed here and only drawn by the app (CLAUDE.md rule 9):

  road     the integers 1..100 as columns along a gently curving road; a prime is one tall
           monolith, a composite a stack of prime blocks (one per prime factor, smallest at the
           bottom), with a thread of light from each block to its prime's monolith.
  plaza    2..100 in a 10 by 10 grid (1's cell holds the seed stone); for every number, the
           multiples that crumble when it is struck; the survivors.
  overlook x = 100 to 10^6 on a logarithmic road: windows of 100 consecutive integers showing
           which are prime, and 241 samples of pi(x), x / ln x and their ratio.

Conventions as for scene.json: metres, +Y up, yaw about +Y, heading(yaw) = (sin yaw, 0, cos yaw).
Nothing here is random, so the same build always gives the same bytes. The arithmetic itself is
pipeline/numtheory.py, tested against trial division.
"""

from __future__ import annotations

import colorsys
import json
import math

from .files import DATA, config, write_stage
from .numtheory import estimate, factorization_label, factorize, pi_table, primes_up_to, superscript
from .schema import PLANE_SCHEMA_VERSION

R2 = lambda v: round(v, 2)  # noqa: E731  (centimetres)
RA = lambda v: round(v, 5)  # noqa: E731

CONVENTIONS = {
    "units": "metres; +Y is up; right-handed",
    "yaw": "angle about +Y; heading(yaw) = (sin yaw, 0, cos yaw), so yaw 0 faces +Z",
    "left": "left of heading(yaw) is (cos yaw, 0, -sin yaw)",
    "world": "one frame for the whole plane: column 1 stands at the origin and the road starts toward +Z",
}


def heading(yaw: float) -> tuple[float, float]:
    return math.sin(yaw), math.cos(yaw)


def left(yaw: float) -> tuple[float, float]:
    return math.cos(yaw), -math.sin(yaw)


def pt(x: float, y: float, z: float) -> list[float]:
    return [R2(x), R2(y), R2(z)]


# ---------------------------------------------------------------- the road


class Centreline:
    """The road's centre line, integrated from its heading h(s) = A sin(2 pi s / P)."""

    def __init__(self, road: dict, length: float):
        self.amp, self.period, self.step = road["curve_amplitude"], road["curve_period"], road["step"]
        n = round(length / self.step)
        self.x = [0.0]
        self.z = [0.0]
        for i in range(n):
            h = self.yaw((i + 0.5) * self.step)
            self.x.append(self.x[-1] + math.sin(h) * self.step)
            self.z.append(self.z[-1] + math.cos(h) * self.step)

    def yaw(self, s: float) -> float:
        return self.amp * math.sin(2 * math.pi * s / self.period)

    def at(self, s: float) -> tuple[float, float, float]:
        """(x, z, yaw) at arc length s. Behind the start the road runs straight back."""
        if s <= 0:
            y0 = self.yaw(0)
            return s * math.sin(y0), s * math.cos(y0), y0
        i = round(s / self.step)
        return self.x[i], self.z[i], self.yaw(s)


def hue_table(cfg: dict, primes: list[int]) -> list[dict]:
    """Each prime's colour. The first few (the ones that fill the stacks) are the most saturated.

    Hues are spread evenly round the wheel and dealt out with a stride coprime to the count, so
    consecutive primes land far apart; the muted primes also cycle through three lightnesses.
    """
    h = cfg["hues"]
    k = len(primes)
    assert math.gcd(h["step"], k) == 1, "hue stride must be coprime to the number of primes"
    out = []
    muted = k - h["strong_primes"]
    for i, p in enumerate(primes):
        hue = ((h["step"] * i) % k) / k
        if i < h["strong_primes"]:
            sat, light = h["strong_saturation"], h["strong_lightness"]
        else:
            j = i - h["strong_primes"]
            a, b = h["muted_saturation"]
            sat = a + (b - a) * j / max(1, muted - 1)
            light = h["muted_lightness"][j % len(h["muted_lightness"])]
        r, g, bl = colorsys.hls_to_rgb(hue, light, sat)
        out.append({"p": p, "hue": round(hue * 360, 2), "saturation": round(sat, 3), "lightness": round(light, 3), "color": "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(bl * 255))})
    return out


def thread(road: dict, a: tuple[float, float, float], b: tuple[float, float, float]) -> list[list[float]]:
    """A quadratic arc from a to b, lifted in proportion to its length."""
    dist = math.dist(a, b)
    lift = min(road["thread_lift_max"], road["thread_lift"] + road["thread_lift_per_metre"] * dist)
    c = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2 * lift, (a[2] + b[2]) / 2)
    n = road["thread_points"]
    out = []
    for i in range(n):
        t = i / (n - 1)
        u = 1 - t
        out.append(pt(*(u * u * a[k] + 2 * u * t * c[k] + t * t * b[k] for k in range(3))))
    return out


def build_road(cfg: dict, cl: Centreline, primes: list[int]) -> dict:
    r = cfg["road"]
    limit = cfg["limit"]
    pos, yaw = {}, {}
    for n in range(1, limit + 1):
        x, z, y = cl.at((n - 1) * r["spacing"])
        pos[n], yaw[n] = (x, z), y
    block, mono_h = r["block"], r["monolith_blocks"] * r["block"]
    columns = []
    for n in range(1, limit + 1):
        fs = factorize(n)
        x, z = pos[n]
        if n == 1:
            kind, parts = "unit", []
        elif len(fs) == 1:
            kind, parts = "prime", [{"prime": n, "y": 0.0, "h": R2(mono_h), "form": "monolith"}]
        else:
            kind = "composite"
            parts = [{"prime": p, "y": R2(i * block), "h": R2(block), "form": "block"} for i, p in enumerate(fs)]
        threads = []
        seen: dict[int, int] = {}
        if kind == "composite":
            for i, p in enumerate(fs):
                dup = seen.get(p, 0)
                seen[p] = dup + 1
                src = (x, (i + 0.5) * block, z)
                px, pz = pos[p]
                dst = (px, mono_h - 0.15 - 0.25 * dup, pz)
                threads.append(thread(r, src, dst))
        columns.append(
            {
                "n": n,
                "kind": kind,
                "pos": pt(x, 0, z),
                "yaw": RA(yaw[n]),
                "factors": fs,
                "label": factorization_label(n),
                "parts": parts,
                "height": R2(len(parts) * block) if kind == "composite" else (R2(mono_h) if kind == "prime" else r["seed"]["height"]),
                "radius": r["footprint"],
                "threads": threads,
            }
        )
    sx, sz, sy = cl.at(0)
    return {
        "spacing": r["spacing"],
        "block": {"size": block},
        "monolith": {"width": r["monolith_width"], "height": R2(mono_h)},
        "seed": {"pos": pt(sx, 0, sz), "size": [r["seed"]["width"], r["seed"]["height"]]},
        "columns": columns,
    }


# ---------------------------------------------------------------- the plaza


def build_plaza(cfg: dict, centre: tuple[float, float], yaw: float) -> dict:
    p = cfg["plaza"]
    limit = cfg["limit"]
    cell = p["cell"]
    cols = 10

    def at(row: int, col: int) -> list[float]:
        # Row 0 is the far row and column 0 the left, so the grid reads like a page.
        lx = (4.5 - col) * cell
        lz = (4.5 - row) * cell
        c, s = math.cos(yaw), math.sin(yaw)
        return pt(centre[0] + lx * c + lz * s, 0, centre[1] - lx * s + lz * c)

    grid = [{"n": n, "row": (n - 1) // cols, "col": (n - 1) % cols, "pos": at((n - 1) // cols, (n - 1) % cols)} for n in range(2, limit + 1)]
    small = primes_up_to(math.isqrt(limit))
    return {
        "centre": pt(centre[0], 0, centre[1]),
        "yaw": RA(yaw),
        "cell": cell,
        "seed_cell": {"row": 0, "col": 0, "pos": at(0, 0)},
        "grid": grid,
        "column": p["column"],
        "footprint": p["footprint"],
        "stone": p["stone"],
        "glow": p["glow"],
        "crumble_step_s": p["crumble_step_s"],
        "multiples": {str(n): list(range(2 * n, limit + 1, n)) for n in range(2, limit + 1)},
        "survivors": primes_up_to(limit),
        "bound": math.isqrt(limit),
        "sufficient_primes": small,
    }


# ---------------------------------------------------------------- the overlook


def build_overlook(cfg: dict, origin: tuple[float, float], yaw: float) -> dict:
    o = cfg["overlook"]
    x0, x1 = cfg["limit"], o["x_end"]
    decades = round(math.log10(x1 / x0))
    mpd = o["metres_per_decade"]
    hx, hz = heading(yaw)
    lx, lz = left(yaw)
    table = pi_table(x1)
    pi_max = table[x1]

    def road_at(s: float, y: float = 0.0, lateral: float = 0.0) -> list[float]:
        return pt(origin[0] + hx * s + lx * lateral, y, origin[1] + hz * s + lz * lateral)

    samples = []
    for j in range(decades * o["samples_per_decade"] + 1):
        x = round(10 ** (math.log10(x0) + j / o["samples_per_decade"]))
        s = mpd * j / o["samples_per_decade"]
        pi, est = table[x], estimate(x)
        samples.append(
            {
                "x": x,
                "pi": pi,
                "estimate": round(est, 3),
                "ratio": round(pi / est, 6),
                "s": R2(s),
                "at": road_at(s),
                "pi_at": road_at(s, o["curve_base"] + o["curve_height"] * pi / pi_max, o["curve_offset"]),
                "est_at": road_at(s, o["curve_base"] + o["curve_height"] * est / pi_max, o["curve_offset"]),
            }
        )

    windows = []
    for j in range(decades * o["windows_per_decade"] + 1):
        w0 = round(10 ** (math.log10(x0) + j / o["windows_per_decade"]))
        s0 = mpd * j / o["windows_per_decade"]
        span = o["window_span"]
        ps = [p for p in primes_up_to(w0 + span - 1) if p >= w0]
        windows.append(
            {
                "x0": w0,
                "span": span,
                "label": f"{w0:,}–{w0 + span - 1:,}",
                "count": len(ps),
                "label_at": road_at(s0, o["point_height"] + 1.2),
                "primes": [{"p": p, "pos": road_at(s0 + (p - w0) / span * o["window_metres"], o["point_height"])} for p in ps],
            }
        )

    return {
        "scale": {"x0": x0, "x1": x1, "decades": decades, "metres_per_decade": mpd, "origin": pt(origin[0], 0, origin[1]), "yaw": RA(yaw)},
        "road": {"length": R2(decades * mpd + o["tail"]), "half_width": cfg["road"]["half_width"]},
        "decades": [{"x": x0 * 10**k, "label": f"10{superscript(2 + k)}", "pos": road_at(mpd * k)} for k in range(decades + 1)],
        "windows": windows,
        "samples": samples,
        "marker": {"height": o["marker_height"]},
        "curve": {"offset": o["curve_offset"], "base": o["curve_base"], "height": o["curve_height"]},
    }


# ---------------------------------------------------------------- texts


def commas(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def fill_texts(cfg: dict, plaza: dict, overlook: dict) -> list[dict]:
    limit = cfg["limit"]
    most = max(len(factorize(n)) for n in range(2, limit + 1))
    tallest = [n for n in range(2, limit + 1) if len(factorize(n)) == most]
    end = overlook["samples"][-1]
    values = {
        "first": 1,
        "limit": limit,
        "tallest_blocks": most,
        "tallest_list": commas([factorization_label(n) for n in tallest]),
        "small_primes": commas([str(p) for p in plaza["sufficient_primes"]]),
        "bound": plaza["bound"],
        "survivors": len(plaza["survivors"]),
        "x_max": f"{end['x']:,}",
        "pi_max": f"{end['pi']:,}",
        "est_max": f"{round(end['estimate']):,}",
        "ratio_max": f"{end['ratio']:.3f}",
        "window_span": cfg["overlook"]["window_span"],
    }
    # Drafts: a person approves each line before it ships (CLAUDE.md rule 7's spirit).
    return [{"id": t["id"], "text": t["text"].format(**values), "reviewed": False} for t in cfg["texts"]]


# ---------------------------------------------------------------- the whole plane


def build(cfg: dict) -> dict:
    limit = cfg["limit"]
    r, pz = cfg["road"], cfg["plaza"]
    length = (limit - 1) * r["spacing"]
    cl = Centreline(r, length)
    primes = primes_up_to(limit)
    road = build_road(cfg, cl, primes)

    ex, ez, eyaw = cl.at(length)
    hx, hz = heading(eyaw)
    half = 5 * pz["cell"] + pz["margin"]
    near = pz["approach"]
    centre = (ex + hx * (near + half), ez + hz * (near + half))
    far = near + 2 * half
    origin = (ex + hx * (far + cfg["overlook"]["gap"]), ez + hz * (far + cfg["overlook"]["gap"]))
    plaza = build_plaza(cfg, centre, eyaw)
    overlook = build_overlook(cfg, origin, eyaw)

    spine = [pt(cl.at(float(k))[0], 0, cl.at(float(k))[1]) for k in range(-round(r["lead_in"]), round(length) + 1)]
    spine += [
        pt(ex + hx * near, 0, ez + hz * near),
        pt(centre[0], 0, centre[1]),
        pt(ex + hx * far, 0, ez + hz * far),
        pt(origin[0], 0, origin[1]),
        pt(origin[0] + hx * overlook["road"]["length"], 0, origin[1] + hz * overlook["road"]["length"]),
    ]
    sx, sz, _ = cl.at(-3.0)
    stops = [
        {"id": "road", "name": "The road", "pos": pt(sx, 0, sz), "yaw": RA(cl.yaw(0)), "pitch": 0.04},
        {"id": "plaza", "name": "The sieve plaza", "pos": pt(ex + hx * (near + 1.5), 0, ez + hz * (near + 1.5)), "yaw": RA(eyaw), "pitch": -0.2},
        {"id": "overlook", "name": "The overlook", "pos": pt(origin[0], 0, origin[1]), "yaw": RA(eyaw), "pitch": 0.12},
    ]
    return {
        "schema_version": PLANE_SCHEMA_VERSION,
        "plane": "number-theory",
        "conventions": CONVENTIONS,
        "texts": fill_texts(cfg, plaza, overlook),
        "stops": stops,
        "ground": {
            "spine": spine,
            "half_width": r["half_width"],
            "square": {"centre": pt(centre[0], 0, centre[1]), "yaw": RA(eyaw), "half": R2(half)},
        },
        "primes": hue_table(cfg, primes),
        "road": road,
        "plaza": plaza,
        "overlook": overlook,
    }


def run() -> None:
    cfg = config()["number_theory_plane"]
    plane = build(cfg)
    write_stage("plane-number-theory", plane)
    DATA.mkdir(parents=True, exist_ok=True)
    path = DATA / "plane-number-theory.json"
    path.write_text(json.dumps(plane, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    ov = plane["overlook"]
    threads = sum(len(c["threads"]) for c in plane["road"]["columns"])
    print(f"plane: {len(plane['road']['columns'])} columns, {threads} threads, {len(plane['plaza']['grid'])} plaza cells, {len(ov['windows'])} windows, {len(ov['samples'])} samples -> data/plane-number-theory.json ({path.stat().st_size / 1024:.0f} KB)")
