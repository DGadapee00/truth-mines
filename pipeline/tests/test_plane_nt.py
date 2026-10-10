"""The number theory plane's descriptors (pipeline/plane_nt.py).

Every number the plane shows is checked here against independent code: trial division, a naive
sieve simulation, and direct counting. Nothing reads set.mm, so these run without a build.
"""

import colorsys
import json
import math
import random

import pytest

from pipeline.files import config
from pipeline.numtheory import factorization_label
from pipeline.plane_nt import build

CFG = config()["number_theory_plane"]


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


def is_prime(n: int) -> bool:
    return n >= 2 and all(n % d for d in range(2, math.isqrt(n) + 1))


@pytest.fixture(scope="module")
def plane():
    return build(CFG)


@pytest.fixture(scope="module")
def cols(plane):
    return {c["n"]: c for c in plane["road"]["columns"]}


# ---------------------------------------------------------------- the road


def test_one_column_per_integer_from_1_to_100(plane):
    assert [c["n"] for c in plane["road"]["columns"]] == list(range(1, 101))


def test_kinds(cols):
    assert cols[1]["kind"] == "unit"
    for n in range(2, 101):
        assert cols[n]["kind"] == ("prime" if is_prime(n) else "composite"), n


def test_factors_match_trial_division(cols):
    for n in range(1, 101):
        assert cols[n]["factors"] == trial_division(n), n


def test_a_stack_has_one_block_per_prime_factor_smallest_at_the_bottom(cols):
    block_h = CFG["road"]["block"]
    for n in range(2, 101):
        c = cols[n]
        if c["kind"] != "composite":
            continue
        fs = trial_division(n)
        assert [p["prime"] for p in c["parts"]] == fs, n
        assert all(p["form"] == "block" for p in c["parts"])
        assert [p["y"] for p in c["parts"]] == pytest.approx([i * block_h for i in range(len(fs))])
        assert all(p["h"] == pytest.approx(block_h) for p in c["parts"])
        assert c["height"] == pytest.approx(len(fs) * block_h)


def test_the_tallest_stacks_up_to_100_have_six_blocks_and_are_64_and_96(cols):
    # The brief says 64 alone is tallest; 96 = 2 * 2 * 2 * 2 * 2 * 3 also has six prime factors.
    most = max(len(trial_division(n)) for n in range(2, 101))
    assert most == 6
    tallest = [n for n in range(2, 101) if len(trial_division(n)) == most]
    assert tallest == [64, 96]
    for n in tallest:
        assert len(cols[n]["parts"]) == 6
    heights = sorted(c["height"] for c in cols.values())
    assert heights[-1] == heights[-2] > heights[-3]


def test_a_prime_is_one_unbroken_monolith(cols):
    r = CFG["road"]
    for n in range(2, 101):
        if not is_prime(n):
            continue
        parts = cols[n]["parts"]
        assert len(parts) == 1 and parts[0]["form"] == "monolith" and parts[0]["prime"] == n
        assert parts[0]["h"] == pytest.approx(r["monolith_blocks"] * r["block"])
        assert cols[n]["height"] == pytest.approx(parts[0]["h"])
        assert cols[n]["threads"] == []


def test_the_unit_is_a_flat_seed_with_no_factors(plane, cols):
    seed = plane["road"]["seed"]
    assert seed["size"] == [CFG["road"]["seed"]["width"], CFG["road"]["seed"]["height"]]
    assert cols[1]["parts"] == [] and cols[1]["factors"] == [] and cols[1]["threads"] == []
    assert cols[1]["label"] == "1 has no prime factors"
    assert cols[1]["pos"] == seed["pos"]


def test_labels_are_the_factorization(cols):
    for n in range(1, 101):
        assert cols[n]["label"] == factorization_label(n)
    assert cols[12]["label"] == "12 = 2² · 3"
    assert cols[64]["label"] == "64 = 2⁶"
    assert cols[100]["label"] == "100 = 2² · 5²"
    assert cols[97]["label"] == "97 is prime"


def test_label_characters_are_few_and_fixed(cols):
    allowed = set("0123456789 =·⁰¹²³⁴⁵⁶⁷⁸⁹") | set("has no prime factors is")
    for c in cols.values():
        assert set(c["label"]) <= allowed, c["label"]


def test_columns_are_two_metres_apart_along_a_gently_curving_road(plane, cols):
    pts = plane["ground"]["spine"]
    # The spine is the road's centre line at 1 m; each column lies on it, 2 m of arc from the last.
    for n in range(1, 100):
        a, b = cols[n]["pos"], cols[n + 1]["pos"]
        # Chord is a hair shorter than the arc, and the curve is gentle.
        d = math.dist(a, b)
        assert 1.97 < d <= 2.0 + 0.011, n
    yaws = [c["yaw"] for c in plane["road"]["columns"]]
    assert max(abs(y) for y in yaws) <= CFG["road"]["curve_amplitude"] + 1e-3
    assert max(abs(b - a) for a, b in zip(yaws, yaws[1:])) < 0.1  # no sharp turns
    assert pts[0][1] == 0


def test_block_colours_match_their_primes_monolith(plane, cols):
    colour = {p["p"]: p["color"] for p in plane["primes"]}
    assert sorted(colour) == [n for n in range(2, 101) if is_prime(n)]
    for c in cols.values():
        for part in c["parts"]:
            assert part["prime"] in colour


def test_threads_run_from_each_block_to_its_primes_monolith(plane, cols):
    r = CFG["road"]
    for n in range(2, 101):
        c = cols[n]
        if c["kind"] != "composite":
            continue
        assert len(c["threads"]) == len(c["factors"]), n
        for part, thread in zip(c["parts"], c["threads"]):
            assert len(thread) == r["thread_points"]
            p = part["prime"]
            start, end = thread[0], thread[-1]
            # starts on the block (its column's x/z, at the block's height)
            assert math.hypot(start[0] - c["pos"][0], start[2] - c["pos"][2]) < 0.01
            assert part["y"] <= start[1] <= part["y"] + part["h"] + 1e-6
            # ends on the monolith of that prime
            mono = cols[p]
            assert math.hypot(end[0] - mono["pos"][0], end[2] - mono["pos"][2]) < 0.01
            assert 0 < end[1] <= mono["height"] + 1e-6
            assert p <= n  # upstream


def test_hues_distinct_and_small_primes_most_saturated(plane):
    primes = plane["primes"]
    assert [p["p"] for p in primes][:5] == [2, 3, 5, 7, 11]
    rgb = []
    for p in primes:
        h = p["color"].lstrip("#")
        rgb.append(tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)))

    def oklab(c):
        lin = [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c]
        r, g, b = lin
        l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
        m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
        s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
        return (
            0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
            1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
            0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
        )

    labs = [oklab(c) for c in rgb]
    worst = min(math.dist(labs[i], labs[j]) for i in range(25) for j in range(i))
    assert worst > 0.05, worst
    sat = {p["p"]: colorsys.rgb_to_hls(*c)[2] for p, c in zip(primes, rgb)}
    strong = [sat[p] for p in (2, 3, 5, 7)]
    assert min(strong) > max(v for p, v in sat.items() if p > 7)


def test_texts_are_drafts_with_every_placeholder_filled(plane):
    ids = [t["id"] for t in plane["texts"]]
    assert ids == ["arrive", "road", "plaza", "sieve_note", "overlook"]
    for t in plane["texts"]:
        assert t["reviewed"] is False
        assert "{" not in t["text"] and "}" not in t["text"], t["text"]
    by = {t["id"]: t["text"] for t in plane["texts"]}
    assert "64 = 2⁶ and 96 = 2⁵ · 3" in by["road"] and "6 blocks" in by["road"]


def test_build_is_deterministic(plane):
    again = build(CFG)
    assert json.dumps(again, sort_keys=True) == json.dumps(plane, sort_keys=True)
    assert plane["schema_version"] == 1
    assert "heading(yaw)" in " ".join(plane["conventions"].values())


def test_stops_lie_on_walkable_ground(plane):
    assert [s["id"] for s in plane["stops"]] == ["road", "plaza", "overlook"]
    for s in plane["stops"]:
        assert s["pos"][1] == 0
        assert on_ground(plane, s["pos"]), s["id"]


def on_ground(plane, pos) -> bool:
    g = plane["ground"]
    x, z = pos[0], pos[2]
    spine = g["spine"]
    for a, b in zip(spine, spine[1:]):
        abx, abz = b[0] - a[0], b[2] - a[2]
        t = max(0.0, min(1.0, ((x - a[0]) * abx + (z - a[2]) * abz) / max(1e-12, abx * abx + abz * abz)))
        if math.hypot(x - (a[0] + t * abx), z - (a[2] + t * abz)) <= g["half_width"]:
            return True
    sq = g["square"]
    dx, dz = x - sq["centre"][0], z - sq["centre"][2]
    c, s = math.cos(sq["yaw"]), math.sin(sq["yaw"])
    return abs(dx * c - dz * s) <= sq["half"] and abs(dx * s + dz * c) <= sq["half"]


# ---------------------------------------------------------------- the sieve plaza


def strike(standing: set[int], n: int) -> list[int]:
    """The sieve rule, written out independently of the exported tables: striking a standing
    number crumbles every standing multiple of it after itself."""
    if n not in standing:
        return []
    fell = [k for k in range(2 * n, 101, n) if k in standing]
    standing.difference_update(fell)
    return fell


def play(order: list[int]) -> set[int]:
    """Strike numbers in this order (skipping any that have crumbled), then strike whatever still
    stands, so the visitor has tried every number that was left."""
    standing = set(range(2, 101))
    for n in order:
        strike(standing, n)
    struck = set(order)
    while any(k not in struck for k in standing):
        k = min(k for k in standing if k not in struck)
        struck.add(k)
        strike(standing, k)
    return standing


def test_the_grid_is_ten_by_ten_in_reading_order_with_the_seed_in_the_first_cell(plane):
    pl = plane["plaza"]
    assert [c["n"] for c in pl["grid"]] == list(range(2, 101))
    for c in pl["grid"]:
        assert (c["row"], c["col"]) == ((c["n"] - 1) // 10, (c["n"] - 1) % 10)
    assert pl["seed_cell"]["row"] == 0 and pl["seed_cell"]["col"] == 0
    cells = {(c["row"], c["col"]) for c in pl["grid"]} | {(0, 0)}
    assert cells == {(r, c) for r in range(10) for c in range(10)}
    by = {c["n"]: c["pos"] for c in pl["grid"]}
    cell = pl["cell"]
    assert math.dist(by[2], by[3]) == pytest.approx(cell, abs=0.02)  # along a row
    assert math.dist(by[2], by[12]) == pytest.approx(cell, abs=0.02)  # down a column
    # Reading order from the visitor's side: 2 is left of 3, and row 0 is farther than row 1.
    yaw = pl["yaw"]
    fwd = (math.sin(yaw), math.cos(yaw))
    lft = (math.cos(yaw), -math.sin(yaw))
    d = lambda a, b, v: (b[0] - a[0]) * v[0] + (b[2] - a[2]) * v[1]  # noqa: E731
    assert d(by[3], by[2], lft) > 0
    assert d(by[12], by[2], fwd) > 0


def test_multiples_are_the_numbers_after_n_that_n_divides(plane):
    m = plane["plaza"]["multiples"]
    assert sorted(m, key=int) == [str(n) for n in range(2, 101)]
    for n in range(2, 101):
        assert m[str(n)] == [k for k in range(n + 1, 101) if k % n == 0], n
    assert m["2"][:3] == [4, 6, 8] and m["50"] == [100] and m["51"] == []


def test_exported_tables_play_the_same_as_the_independent_rule(plane):
    m = plane["plaza"]["multiples"]
    rng = random.Random(2026)
    for _ in range(50):
        standing = set(range(2, 101))
        order = rng.sample(range(2, 101), 99)
        for n in order:
            if n in standing:
                fell = [k for k in m[str(n)] if k in standing]
                assert fell == strike(set(standing), n)
                standing.difference_update(fell)


def test_the_sieve_leaves_the_25_primes_whatever_the_order(plane):
    primes = {n for n in range(2, 101) if is_prime(n)}
    assert len(primes) == 25 and plane["plaza"]["survivors"] == sorted(primes)
    rng = random.Random(7)
    for _ in range(300):
        order = rng.sample(range(2, 101), rng.randint(0, 99))
        assert play(order) == primes
    assert play(list(range(100, 1, -1))) == primes  # largest first
    assert play([k for k in range(2, 101) if not is_prime(k)]) == primes  # composites first
    assert play(sorted(primes)) == primes  # primes first, ascending


def test_after_2_3_5_7_nothing_else_falls(plane):
    import itertools

    primes = {n for n in range(2, 101) if is_prime(n)}
    assert plane["plaza"]["sufficient_primes"] == [2, 3, 5, 7]
    for order in itertools.permutations([2, 3, 5, 7]):
        standing = set(range(2, 101))
        for n in order:
            strike(standing, n)
        assert standing == primes
        assert all(strike(standing, k) == [] for k in sorted(standing))


def test_every_composite_up_to_100_has_a_prime_factor_no_larger_than_10(plane):
    assert plane["plaza"]["bound"] == 10 == math.isqrt(100)
    for n in range(2, 101):
        if not is_prime(n):
            assert min(trial_division(n)) <= 10, n
            assert min(trial_division(n)) <= 7  # so 2, 3, 5 and 7 suffice
    # And 11 is the first prime that cannot be the smallest factor of a composite below 100.
    assert all(min(trial_division(n)) < 11 for n in range(2, 101) if not is_prime(n))


def test_the_sieve_note_is_a_computed_draft(plane):
    note = {t["id"]: t for t in plane["texts"]}["sieve_note"]
    assert note["reviewed"] is False
    assert "2, 3, 5 and 7" in note["text"] and "10" in note["text"] and "25" in note["text"]


# ---------------------------------------------------------------- the overlook

KNOWN_PI = {10**2: 25, 10**3: 168, 10**4: 1229, 10**5: 9592, 10**6: 78498}


def test_pi_at_the_decades_is_known(plane):
    by = {s["x"]: s for s in plane["overlook"]["samples"]}
    for x, pi in KNOWN_PI.items():
        assert by[x]["pi"] == pi, x


def test_pi_up_to_10000_by_counting(plane):
    count = {}
    c = 0
    for n in range(10_001):
        c += is_prime(n)
        count[n] = c
    for s in plane["overlook"]["samples"]:
        if s["x"] <= 10_000:
            assert s["pi"] == count[s["x"]], s["x"]


def test_estimate_is_x_over_the_natural_log_and_ratio_is_pi_over_estimate(plane):
    for s in plane["overlook"]["samples"]:
        assert s["estimate"] == pytest.approx(s["x"] / math.log(s["x"]), abs=1e-3)
        assert s["ratio"] == pytest.approx(s["pi"] / (s["x"] / math.log(s["x"])), abs=1e-6)


def test_at_a_million_there_are_78498_primes_against_about_72382(plane):
    end = plane["overlook"]["samples"][-1]
    assert (end["x"], end["pi"]) == (10**6, 78498)
    assert round(end["estimate"]) == 72382
    assert end["ratio"] == pytest.approx(78498 / 72382.4, abs=1e-5)
    assert f"{end['ratio']:.3f}" == "1.084"  # the brief rounds this to 1.085
    text = {t["id"]: t["text"] for t in plane["texts"]}["overlook"]
    assert "78,498" in text and "72,382" in text and "1.084" in text and "1,000,000" in text


def test_the_ratio_falls_toward_one_from_a_thousand_on(plane):
    by = {s["x"]: s["ratio"] for s in plane["overlook"]["samples"]}
    ratios = [by[10**k] for k in range(3, 7)]
    assert ratios == sorted(ratios, reverse=True)
    assert all(r > 1 for r in ratios)


def test_samples_are_log_spaced_sixty_metres_a_decade(plane):
    ov = plane["overlook"]
    samples = ov["samples"]
    assert len(samples) == 241
    assert [s["x"] for s in samples] == sorted({s["x"] for s in samples})
    mpd = ov["scale"]["metres_per_decade"]
    for k in range(5):
        assert samples[60 * k]["s"] == pytest.approx(k * mpd)
    for s in samples:
        assert s["x"] == round(10 ** (2 + s["s"] / mpd))


def test_each_window_shows_the_primes_among_100_consecutive_integers(plane):
    wins = plane["overlook"]["windows"]
    assert len(wins) == 17
    assert wins[0]["x0"] == 100 and wins[4]["x0"] == 1000 and wins[-1]["x0"] == 10**6
    for w in wins:
        want = [n for n in range(w["x0"], w["x0"] + w["span"]) if is_prime(n)]
        assert [p["p"] for p in w["primes"]] == want, w["x0"]
        assert w["count"] == len(want)
    assert wins[0]["count"] == 21  # 101 .. 199
    assert wins[-1]["count"] < wins[0]["count"] / 2  # they thin out


def test_primes_appear_at_constant_brightness_only_height_and_place_vary(plane):
    for w in plane["overlook"]["windows"]:
        for p in w["primes"]:
            assert set(p) == {"p", "pos"}  # no per-point brightness to encode anything else


def test_overlook_geometry_stays_on_the_axis_and_curves_stand_to_the_left(plane):
    ov = plane["overlook"]
    ox, _, oz = ov["scale"]["origin"]
    yaw = ov["scale"]["yaw"]
    fwd = (math.sin(yaw), math.cos(yaw))
    lft = (math.cos(yaw), -math.sin(yaw))
    last = None
    for s in ov["samples"]:
        dx, dz = s["at"][0] - ox, s["at"][2] - oz
        assert dx * fwd[0] + dz * fwd[1] == pytest.approx(s["s"], abs=0.02)
        for key in ("pi_at", "est_at"):
            ex, ey, ez = s[key]
            assert (ex - s["at"][0]) * lft[0] + (ez - s["at"][2]) * lft[1] == pytest.approx(ov["curve"]["offset"], abs=0.02)
        # The curve's height is proportional to the value it draws.
        assert s["pi_at"][1] == pytest.approx(ov["curve"]["base"] + ov["curve"]["height"] * s["pi"] / 78498, abs=0.01)
        last = s
    assert last["pi_at"][1] > last["est_at"][1]


def test_build_writes_identical_bytes_twice(plane):
    a = json.dumps(build(CFG), separators=(",", ":"))
    b = json.dumps(build(CFG), separators=(",", ":"))
    assert a == b
    assert len(a) < 1_000_000  # well inside the 2 MB payload budget
