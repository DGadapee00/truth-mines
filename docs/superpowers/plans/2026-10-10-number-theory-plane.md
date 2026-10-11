# Number Theory Plane: Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Build the brief's three moments (road 1–100 with prime stacks and threads, sieve plaza, overlook) as a new plane: computed and tested in the pipeline, exported as `data/plane-number-theory.json`, rendered by the app on desktop and then in a WebXR headset.

**Architecture:** `pipeline/numtheory.py` holds the arithmetic (sieve, factorization, π). `pipeline/plane_nt.py` turns it into engine-neutral descriptors (positions, stacks, hues, sieve grid, strike tables, log-scale overlook, π(x) samples). `core/` parses the file and holds the pure sieve state machine. `app/plane/` only draws and animates descriptors (instanced meshes, canvas-text labels) and handles walking, focus, striking, stops and the headset. Same-rule twin of the Inside view: a controller with `scene`, `camera`, `active`, `update(dt)`.

**Tech Stack:** Python 3.11 + pytest, TypeScript strict + vitest, three.js 0.172, Playwright (+ IWER for the headset).

**Spec:** `docs/plane-number-theory.md` (the brief; copied in from the attachment, since the checkout had no such file) and `CLAUDE.md` (rules 4, 5, 6, 8, 9, 10).

## Global Constraints

- Branch `plane/number-theory` only. Never touch `main`; never merge; no PR unless asked.
- Rule 9: every position, stack, hue, grid cell, strike table, curve point and displayed number is computed in `pipeline/` and exported. The app decides no geometry.
- Rule 10: deterministic. No randomness at all in this plane (nothing needs it); same build, same bytes.
- Rule 4: instancing/batching; draw calls under 100 (target ≈ 20); triangles under 500k.
- Rule 6: no smooth locomotion. Walking is WASD on desktop only; the headset teleports and snap-turns 30°. Travel between stops follows a click/key/button, eases in and out, never rolls the horizon, and in a headset never turns the view.
- Existing overview and Inside view unchanged in behavior. Wiring changes are additive only (header button, `plane-hud` markup, one more branch in the animation loop, key handlers that stand down while the plane is active).
- Own schema constant `PLANE_SCHEMA_VERSION = 1` in `pipeline/schema.py` and `core/schema.ts`, so `graph.json`, `meta.json`, `scene.json` stay at version 6 untouched.
- Explanatory text (captions, the sieve note) is drafted in `pipeline/config.yaml` with `{placeholders}` filled from computed values, exported with `reviewed: false`, and flagged "draft" in the UI.
- Every number shown is computed: factorizations vs independent trial division; sieve leaves exactly 25 = primes ≤ 100 in any strike order; π(x) = 25, 168, 1229, 9592, 78498 at 10², 10³, 10⁴, 10⁵, 10⁶; estimate uses `math.log`; ratio = π/estimate.
- Gate: `npm run check` and `npm run e2e` pass; screenshots of each moment in `e2e/output/`; HANDOFF.md updated; branch pushed.

## Decisions the brief leaves open (taken here, flagged in HANDOFF.md)

1. **Sieve grid.** 2..100 is 99 numbers; the 10×10 grid is in reading order of 1..100 with the seed stone (1) in the first cell, unlit and not strikable. Plaza columns are plain gray stone until struck; primes are not revealed in advance. Survivors turn to their prime's hue at the end.
2. **Overlook thinning.** On a log-scale road the number of primes per metre *grows*, which would show the opposite of thinning. The log road therefore carries sample **windows**: 16 log-spaced positions (4 per decade, 100 → 10⁶), each showing the primes among the next 100 consecutive integers as constant-brightness points at their integer offsets. Gaps appear where composites fall, so the density per window falls (25 → ~7). The full π(x) is carried by the curves, not by 78k points.
3. **Curves and marker.** 241 log-spaced samples (60 per decade, exact decade points included). Each sample carries x, π(x), x/ln x, ratio and the road distance `s`. The marker is where the visitor stands along the overlook road, snapped to the nearest sample; the app does a lookup, not arithmetic.
4. **Ratio at 10⁶** is 78498/72382.41 = 1.0845 (three decimals: 1.084); the brief's "about 1.085" is loose. The display shows the computed value.
5. **Entry.** A "Number theory" button in the header and the address `#/plane/number-theory`. Leaving returns to the map.
6. **Stops.** Arrival at 1, the road, the plaza, the overlook. Keys `1`–`4` and HUD buttons travel (guided, eased); headset button A goes to the next stop.
7. **Labels** are canvas-drawn (digit atlas, one focus sign), not troika, so the pinned label font and its glyph check stay untouched. A test restricts label characters to digits, `=`, `·`, superscripts, space and fixed words.

## Review Focus

- Prime power 64 = 2⁶, 96 = 2⁵·3, 100 = 2²·5², and 1: stack, label ("1 has no prime factors") and threads right. (Task 2, 6)
- Striking a crumbled number, striking the same number twice, striking 1's cell, and reset mid-animation do nothing wrong. (Task 4, 7)
- Strike order does not matter, including striking composites first. (Task 3, 4)
- Marker at the very ends of the overlook road, and stepping off the road, clamps to the first/last sample. (Task 5, 8)
- Focus label on every column shows the same string the pipeline computed; no column loses its threads. (Task 2, 6)

---

### Task 0: Baseline, spec, plan

**Files:** Create `docs/plane-number-theory.md`, this plan.

- [ ] Run `python3 -m pipeline`, `npm run check` once to confirm a green baseline (record the counts: vitest 34, pytest 35, map e2e 14 expected).
- [ ] Commit: `docs: number theory plane brief and implementation plan`.

### Task 1: Arithmetic core

**Files:** Create `pipeline/numtheory.py`, `pipeline/tests/test_numtheory.py`.

**Interfaces — Produces:**
- `primes_up_to(n: int) -> list[int]` (sieve of Eratosthenes, bytearray)
- `factorize(n: int) -> list[int]` (primes with multiplicity, ascending; `[]` for 1; ValueError below 1)
- `pi_table(n: int) -> list[int]` (`t[x]` = number of primes ≤ x)
- `estimate(x: float) -> float` (`x / math.log(x)`)
- `superscript(n: int) -> str`, `factorization_label(n: int) -> str` ("12 = 2² · 3", "13 is prime", "1 has no prime factors")

- [ ] Tests: `factorize` equals an independent trial-division implementation written in the test for 1..100000 (product check as well); `primes_up_to(100)` has 25 members, equals `[n for n in 2..100 if no divisor ≤ isqrt]`; `pi_table(10**6)` at 100/1000/10⁴/10⁵/10⁶ equals 25/168/1229/9592/78498; `estimate(10**6)` ≈ 72382.41 (to 0.01); labels: `factorization_label(12) == "12 = 2² · 3"`, `(64) == "64 = 2⁶"`, `(100) == "100 = 2² · 5²"`, `(13) == "13 is prime"`, `(1) == "1 has no prime factors"`.
- [ ] Run, see them fail; implement; run, see them pass; commit `numtheory: sieve, factorization, π with independent checks`.

### Task 2: Road descriptors, hues, export, schema

**Files:** Create `pipeline/plane_nt.py`, `pipeline/tests/test_plane_nt.py`. Modify `pipeline/config.yaml` (new `number_theory_plane:` block), `pipeline/schema.py` (`PLANE_SCHEMA_VERSION = 1`), `pipeline/__main__.py` (stage `plane`, last), `.github` untouched.

**Interfaces — Produces:** `build(cfg: dict) -> dict` returning the whole plane; `run()` writes `build/plane-number-theory.json.gz` and `data/plane-number-theory.json`. Top-level keys: `schema_version`, `conventions`, `texts` (list of `{id, text, reviewed}`), `stops`, `ground`, `primes`, `road`, `plaza`, `overlook`.
`road`: `{spacing, seed: {pos, size}, columns: [{n, kind: "unit"|"prime"|"composite", pos, yaw, factors, label, parts: [{prime, y, h, form: "block"|"monolith"}], height, threads: [[x,y,z]…]}], threads: …}`. `primes`: 25 entries `{p, hue, color, saturation}`.
Road layout: columns 2 m apart by arc length along a centreline whose heading is `0.35·sin(2π s / 200)` rad, integrated in 0.05 m steps and rounded to the centimetre. Block 0.8 m cubes (width 0.8, height `block_h` 0.8); monolith width 0.7, height `monolith_blocks` (4) × block_h. Threads from each block centre to its prime's monolith centre as a 13-point arc whose apex rises with distance, upstream only (p < n or the same prime for repeated factors on the same column draws from the higher block).
Hues: prime index i gets hue `360·((7·i) mod 25)/25`; 2, 3, 5, 7 saturation 0.85, the rest from 0.55 falling to 0.35; lightness cycles 0.42/0.55/0.68 for the muted ones.

- [ ] Tests: 100 columns, n = 1..100; stack part count equals `len(factorize(n))` (trial division in the test), blocks bottom-to-top ascending prime, 64 has six parts and is the tallest block stack, `height` equals sum; prime columns have exactly one monolith part and zero blocks; 1 is the seed (no parts); each block's colour equals its prime's colour; every thread starts on a block of its column, ends at the monolith of that prime, and lengths are consistent; column spacing along the centreline is 2 m ± 1 cm; deterministic (two builds `==`, and json bytes equal); the 25 primes have pairwise colour distance above a threshold measured in OKLab (set from the real minimum with margin), and 2, 3, 5, 7 have strictly the highest saturation; label characters ⊂ allowed set; texts have placeholders filled (no `{`) and `reviewed` is false.
- [ ] Implement; wire the stage; `python3 -m pipeline plane`; commit `plane: road, stacks, threads and hues as descriptors`.

### Task 3: Sieve plaza descriptors

**Files:** Modify `pipeline/plane_nt.py`, `pipeline/tests/test_plane_nt.py`, `pipeline/config.yaml`.

**Produces:** `plaza`: `{centre, cell, grid: [{n, row, col, pos}] (99 cells, n=2..100, row=(n-1)//10, col=(n-1)%10), seed_cell: {row:0, col:0, pos}, column: {width, height, rubble_height}, multiples: {"p": [2p, 3p, … ≤ 100]} for every n in 2..100, crumble_step_s, survivors: [25 primes], sufficient_primes: [2,3,5,7], bound: 10, note_id}`.

- [ ] Tests (independent simulation in the test, not reading `multiples` as truth): `multiples[p]` equals `[k for k in range(2p, 101) if k % p == 0]`; simulate striking every standing number in 300 shuffled orders (seeded `random.Random` in the test) and in orders that strike composites first; each ends with standing == primes ≤ 100 (25, equals trial division); after striking 2, 3, 5, 7 in any of the 24 orders, striking any other standing number knocks nothing down; `bound` = isqrt(100) and every composite ≤ 100 has a prime factor ≤ bound (trial division); grid is 10×10 minus one with seed cell at (0,0), cells 2.4 m apart.
- [ ] Implement; commit `plane: sieve plaza grid, strike tables and survivors`.

### Task 4: Overlook descriptors

**Files:** Modify `pipeline/plane_nt.py`, `pipeline/tests/test_plane_nt.py`, `pipeline/config.yaml`.

**Produces:** `overlook`: `{scale: {x0: 100, x1: 1000000, s0, metres_per_decade: 60}, road: {points, half_width}, decades: [{x, label, pos}], windows: [{x0, span: 100, primes: [{p, pos}], count}] (16), curves: {pi: [[x,y,z]…], estimate: [[x,y,z]…]}, samples: [{x, pi, estimate, ratio, s}] (241), marker: {height}}`.

- [ ] Tests: π at 10²…10⁶ in `samples` equals 25, 168, 1229, 9592, 78498 (also from trial-division counting up to 10⁴); `estimate == x/math.log(x)` for every sample; `ratio == pi/estimate`; ratio at 10⁶ rounds to 1.084 (and the stored value is within 1e-6 of 78498/72382.41); ratio at decade points non-increasing from 10³ on; windows' primes equal trial division on [x0, x0+100); window prime counts non-increasing across decades (document: windows at 10⁶ hold 6–9); sample `s` strictly increasing with log x at exactly `metres_per_decade` per decade; curve points follow the samples; deterministic.
- [ ] Implement; commit `plane: overlook windows, log road and π(x) samples`.

### Task 5: Schema and pure logic in core/

**Files:** Modify `core/schema.ts` (`PLANE_SCHEMA_VERSION`, types, `parsePlane`). Create `core/sieve.ts`, `core/tests/sieve.test.ts`, `core/tests/plane.test.ts`.

**Produces:**
- `createSieve(plaza: Plaza)`: `{ standing(): number[]; isStanding(n): boolean; strike(n): number[] (crumbled in order; [] if n not standing or not on the grid); reset(): void }`
- `nearestSample(samples: Sample[], s: number): Sample` (clamps at both ends)
- `parsePlane(raw: unknown): PlaneFile` throwing `SchemaError`.

- [ ] Tests (vitest, data-driven from `data/plane-number-theory.json`, with trial division written in the test): `parsePlane` rejects a wrong schema version and missing keys; every column's factors multiply to n and are prime; sieve: all strike orders (1000 seeded shuffles) leave the 25 primes; strike on a crumbled number returns `[]` and changes nothing; strike twice is idempotent; reset restores 99; strike(1) and strike(101) return `[]`; `nearestSample` clamps below the first and above the last; payload under 2 MB.
- [ ] Implement; `npm run typecheck && npm run lint && npm test`; commit `core: plane schema, sieve state and sample lookup`.

### Task 6: The road on screen (desktop)

**Files:** Create `app/plane/build.ts` (descriptor → instanced meshes), `app/plane/labels.ts` (canvas digit atlas + focus sign), `app/plane/walk.ts` (+ `walk.test.ts`), `app/plane/plane.ts` (controller), `e2e/plane.spec.ts`. Modify `index.html` (header button `#btn-plane`, `#plane-hud`), `app/style.css` (additive `.plane-hud`, `body.plane`), `app/main.ts` (create controller, loop branch, hash `#/plane/number-theory`, stand down handlers while active).

**Produces:** `createPlane({renderer, base})` → `{scene, camera, get active(), enter(), exit(), update(dt), state, …test hooks}`; test hook `window.__mines.plane`. `Walk` keeps you on the descriptor's `ground` areas and out of column footprints.

Draw calls: ground (1), road blocks (1 InstancedMesh, per-instance colour), monoliths (1), seed (1), number labels (1 instanced quad with atlas), threads (1 LineSegments, `drawRange` set to the focused column's range), focus sign (1).
Focus: ray from the screen centre when the pointer is locked, from the pointer otherwise; a column's pick box from its descriptor; focus shows the sign above the column and lights its threads, and fills `#pl-label` in the HUD.

- [ ] Walk unit tests: stays inside ground; slides round a column footprint; position at a stop is inside ground.
- [ ] e2e: enter from the header; HUD names the moment; arrive at 1; teleport (test hook) to column 12 and focus it, label reads `12 = 2² · 3` and the thread range holds 3 segments' worth for 3 blocks; focus 64 shows `64 = 2⁶` with six threads; focus 13 shows `13 is prime`; draw calls < 100, triangles < 500k; no console errors; screenshots `plane-1-arrive.png`, `plane-2-road.png`, `plane-3-focus.png`.
- [ ] Implement; `npm run check` green; commit `plane: the road of integers, prime stacks, threads and focus`.

### Task 7: The sieve plaza

**Files:** Create `app/plane/plaza.ts`. Modify `app/plane/plane.ts`, `e2e/plane.spec.ts`.

Instanced plaza columns (1 call) and a second label mesh; strike by click (or Enter on the focused column); struck number glows gold; multiples crumble in the order of `multiples[p]` at `crumble_step_s` intervals (instance scale-y to `rubble_height` with a darker colour; label fades); `Reset` button restores; survivors glow in their prime's colour once nothing standing is left to strike; the sieve note shows (draft flag) in the HUD after 2, 3, 5, 7 have fallen.

- [ ] e2e: strike 2, 3, 5, 7 through the test hook and the real click path for one of them; wait for the animation; standing == 25 primes; striking 11 afterwards crumbles none; strike on a crumbled number is ignored; reset restores 99; a random strike order (seeded in the test) ends with the primes; screenshots `plane-4-plaza.png`, `plane-5-sieve-mid.png`, `plane-6-survivors.png`.
- [ ] Commit `plane: sieve plaza with strike, crumble, reset and survivors`.

### Task 8: The overlook

**Files:** Create `app/plane/overlook.ts`. Modify `app/plane/plane.ts`, `e2e/plane.spec.ts`.

Ground road (merged into the ground mesh), window primes as one `THREE.Points` (constant colour and size), π and x/ln x as two `THREE.Line`s, decade posts with canvas labels, the marker (one instanced post plus the HUD readout and an in-world sign: π(x), x/ln x, ratio to three decimals) at the nearest sample to where you stand.

- [ ] e2e: place at the end of the road: marker shows `78,498`, `72,382`, `1.084`; at the start `25`, `22`, … from samples; clamps beyond both ends; screenshot `plane-7-overlook.png`, `plane-8-marker-end.png`; draw calls < 100.
- [ ] Commit `plane: overlook with log road, prime windows, curves and marker`.

### Task 9: Stops and travel

**Files:** Modify `app/plane/plane.ts`, `index.html`, `e2e/plane.spec.ts`; add `app/plane/travel.ts` (+ `travel.test.ts`).

Guided eased move between stops (smoothstep over `clamp(dist/10, 1.5, 8)` s) on key `1`–`4` or HUD buttons; desktop turns toward the stop's facing; no roll; user input during a move is ignored except Escape.

- [ ] Unit: easing starts and ends at zero speed, monotone, ends exactly at the stop. e2e: key 3 reaches the plaza stop; pitch/roll stays 0; camera does not move without input.
- [ ] Commit `plane: stops with eased guided travel`.

### Task 10: WebXR

**Files:** Create `app/plane/xr.ts`, `e2e/plane-xr.spec.ts`. Modify `playwright.config.ts` (xr project also matches the new spec; laptop ignores it), `app/plane/plane.ts`, `index.html` (`Enter VR` in the plane HUD).

Controller ray: teleport to the aimed ground point inside the walkable area (target ring), thumbstick snap turn of 30°, trigger on a plaza column strikes it, A (button 4) travels to the next stop with the vignette and no view turn, B exits the session.

- [ ] e2e (IWER Quest 3, as `xr.spec.ts`): enter VR from the plane; snap turn is −30°; teleport lands within 0.5 m; trigger on a plaza column crumbles its multiples; A moves to the next stop with a vignette and the same yaw; screenshots `plane-xr-1-road.png`, `plane-xr-2-plaza.png`.
- [ ] Commit `plane: WebXR teleport, snap turn, strike and stop travel`.

### Task 11: Docs, gates, push

- [ ] README layout rows and pipeline README stage row; `CLAUDE.md` untouched; HANDOFF.md rewritten for this branch (what was built, decisions above, test state, what needs a person: review texts, judge monolith height in the headset, 72 fps on a Quest 3, the log-road thinning interpretation).
- [ ] `npm run data && npm run check && npm run e2e`; screenshots listed; `git push -u origin plane/number-theory`.

---

**Self-review.** Coverage: road (T2, T6), threads (T2, T6), plaza (T3, T7), overlook (T4, T8), correctness list (T1–T5), desktop walk and focus (T6), XR teleport and snap turn (T10), screenshots (T6–T10), pipeline-computed layout (T2–T4), reviewed:false text (T2). The 72 fps acceptance item is device-only and is reported as untested. Names: `createSieve`, `nearestSample`, `parsePlane`, `createPlane` are used identically across tasks.
