# Handoff: the number theory plane (vertical slice)

Branch: `plane/number-theory`, off `wip/phase3`'s history (`6901c58`). `main` is untouched and nothing
is merged. No pull request was opened. The brief is `docs/plane-number-theory.md` (it was not in the
checkout; I copied the attached brief there), the plan is `docs/superpowers/plans/2026-10-10-number-theory-plane.md`.

## What is built

The three moments, desktop and WebXR, entered from the header button "Number theory plane" or
`#/plane/number-theory`, left with Map or M.

- **The road.** 1 to 100 as columns 2 m apart along a gently curving road. A prime is one tall
  monolith, a composite a stack of prime blocks (one per prime factor, smallest at the bottom), 1 is
  a flat unlit seed stone. Look at a column (crosshair, or the mouse when it is free): its
  factorization appears ("12 = 2² · 3") and a thread of light arcs from each block to its prime's
  monolith.
- **The sieve plaza.** 2 to 100 in a 10 by 10 grid in reading order (1's cell holds the seed stone).
  Click a standing number (Enter or F also strike the one you look at): it glows gold and every
  multiple after it crumbles in sequence. A crumbled number cannot be struck. After 2, 3, 5, 7 the
  25 survivors take their prime's colour and the one-line note appears. Reset (button or R).
- **The overlook.** x = 100 to 10^6 on a logarithmic road, 60 m a decade. Seventeen 10 by 10 panels
  of lights stand across the road (you walk through them), one light per integer in reading order,
  lit only where the integer is prime, so the thinning is the number of lit lights (21 at 100, 7 at
  10^6). Three thick curves beside the road: π(x), x / ln x and their ratio (with a baseline at 1).
  The marker is a sign by the road at the sample nearest where you stand: x, π(x), x / ln x, ratio.
- **Travel.** Keys 1 2 3 or the buttons on the left take you to a stop: guided, eased in and out,
  nothing moves you unasked, no roll.
- **Headset.** Teleport to the floor you point at (trigger), 30-degree snap turn, trigger on a
  plaza column strikes it, A travels to the next stop (guided, vignette, the view is never turned),
  B leaves VR.

## How it is built (CLAUDE.md rule 9)

`pipeline/numtheory.py` is the arithmetic; `pipeline/plane_nt.py` is stage `plane` and writes
`data/plane-number-theory.json` (147 KB): every position, stack, hue, grid cell, strike table,
panel light, curve point, and even the cosmetic sizes (block gap, thread radius, label sizes). Layout
and colour numbers are in `pipeline/config.yaml` under `number_theory_plane`. The file has its own
version (`PLANE_SCHEMA_VERSION = 1`, in `pipeline/schema.py` and `core/schema.ts`), so the mine's
files stay at version 6. `core/sieve.ts` is the pure sieve state machine and the marker's lookup.
`app/plane/` draws and animates; it decides no geometry. No randomness anywhere in the plane.

## Tests

| Suite | Result |
|---|---|
| pytest | 88 pass (new: `test_numtheory.py` 15, `test_plane_nt.py` 38) |
| vitest | 63 pass (new: `core/tests/plane.test.ts` 18, `app/plane/plane.test.ts` 11) |
| typecheck, lint | clean |
| plane e2e (laptop) | 8 pass: `e2e/plane.spec.ts` |
| plane headset e2e | pass: `e2e/plane-xr.spec.ts` (emulated Quest 3) |
| `npm run check` | **fails on one existing test**, see below |
| `npm run e2e` | 24 pass, the same existing test fails on laptop and phone, and the `xr` project did not run (it depends on them); I ran it with `--no-deps`: plane-xr passes, `xr.spec.ts` passes alone and flaked once in a combined run |

**The failing test is not from this branch.** `e2e/mine.spec.ts:143` ("the map: critical path
bright… Enter on every landmark") takes 54 s alone here and passes; under the two parallel workers
(laptop and phone) it exceeds its 90 s timeout. It fails the same way on the untouched base commit
`6901c58` with the same command, so it is the sandbox's software GPU, not the plane. I did not edit
that test or its timeout. It will want a longer timeout or a serial run if CI is also slow.

Each correctness check uses independent code: factorizations against trial division (1 to 100000),
the sieve against a naive simulation in 300+ strike orders (and 1000 in TypeScript, plus composites
first, largest first), π(x) at 25, 168, 1229, 9592, 78498 and by direct counting to 10^4, x / ln x
with the natural log (a log10 slip would show), ratio = π / estimate.

## Budgets

Draw calls and triangles on screen (SwiftShader count; the same on a device): road 15 calls /
9.3k triangles, plaza 11 / 6.4k, overlook 12 / 6.4k. Payload 147 KB. **72 fps on a Quest 3 is not
measured**: the emulator cannot give it. The plane does little per frame (no per-node meshes; the
labels are one instanced mesh per kind; the sieve repaints only while something animates).

## Things the brief got wrong or left open (decisions I took)

1. **"64 is the tallest stack before 100" is wrong.** 96 = 2⁵ · 3 also has six prime factors, so 64
   and 96 tie. The road text and the tests say so.
2. **The ratio at 10^6 is 1.0845, shown as 1.084** (brief: "about 1.085").
3. **A log-scale road makes primes denser, not sparser** (primes per metre grow ten-fold a decade).
   So "points of light growing sparse" is shown as panels: the same 100 consecutive integers at 17
   places along the road, lit only at primes. All 78k primes are not drawn; the curves carry π(x).
4. **The ratio is not monotone at the start** (1.151 at 100, 1.161 at 1000, then falling). The note
   says "still slowly falling toward 1"; the test checks it falls from 10³ on.
5. **Sieve grid.** 99 numbers do not fill 10 by 10; the first cell is the seed stone, 1.
6. **Curves** use a linear height on a log x axis, so π(x) is a hockey stick and only the last
   decade separates the two curves. I added the ratio curve and its baseline so "settles toward 1"
   is visible along the whole road. Judge whether you prefer a log height scale.
7. **Plane arrival** is a header button and an address; how planes connect to each other and to the
   mine is still open. `plane` is also a stage in `python -m pipeline`.
8. **Existing code touched** (additive only): `index.html` (header button, `plane-hud`),
   `app/style.css` (plane rules appended), `app/main.ts` (create the plane, a loop branch, the
   address, and its key/pointer handlers stand down while the plane is active), `README.md`,
   `pipeline/README.md`, `pipeline/__main__.py`, `core/schema.ts`, `pipeline/schema.py`.
   The overview and the Inside view behave as before.

## For you to review

- **Every line of plane text is a draft** (`reviewed: false` in the file, a "draft" badge in the
  HUD): the five texts in `pipeline/config.yaml` (`number_theory_plane.texts`). Their numbers are
  computed from the data; the wording is mine. Setting `reviewed` is your call (nothing in the
  pipeline flips it yet, as with display forms, you edit and rebuild).
- **Screenshots** in `e2e/output/` (gitignored): `laptop-plane-1-arrive`, `-2-road`, `-3-focus`,
  `-4-plaza`, `-5-sieve-mid`, `-6-survivors`, `-7-overlook`, `-8-marker-end`, `xr-plane-xr-1-road`,
  `-2-travel`, `-3-plaza`. They are SwiftShader, gray box.
- **Open questions from the brief**: tall vs one-block monoliths (slice is tall: 4 block heights;
  judge in the headset), whether 25 hues stay readable (OKLab distance between any two is at least
  0.05, tested; small primes are the most saturated), whether 2 m spacing is right.

## Not done / next

- 72 fps on a Quest 3 (chrome://inspect over USB), and the walk-through with someone new to the
  ideas (acceptance items that need a device or a person).
- No polish by design: no rock textures, no audio, monolith "inner glow" is a glossy highlight only,
  threads are square tubes, labels are canvas text.
- Hand-tracking teleport and in-headset HUD text for the road caption are not done (the focus sign
  and marker sign are in the world; the captions are HTML).
- The Phase 3 follow-ups below are unchanged.

## Resume

```sh
cd truth-mines
git checkout plane/number-theory
pip install -r pipeline/requirements.txt && npm ci
python3 -m pipeline          # builds data/, including data/plane-number-theory.json
python3 -m pipeline plane    # just the plane (needs no set.mm)
npm run check                # see the note on mine.spec.ts:143 above
npm run e2e
npx playwright test e2e/plane.spec.ts e2e/plane-xr.spec.ts --project=laptop   # the plane alone
npx playwright test --project=xr --no-deps                                     # headset alone
```

---

# Earlier handoff: Phase 3, the Inside view

Branch: `wip/phase3`. `main` stays at Phase 2 (`ef62f41`). Phase 3 is not merged.
An independent review of Grok's Phase 3 work is in `REVIEW.md`: findings, fixes, and what is left.
A push of this branch does not start CI. The workflow runs on a push to `main`, on a
pull request, and on `workflow_dispatch`.

## Test state

| Suite | Result |
|---|---|
| `npm run check` | pass. Typecheck, lint, vitest 34, pytest 35, map e2e 14 |
| `npm run e2e` | 19 pass, including `e2e/xr.spec.ts`. Two consecutive full runs green, the second after a clean `npm run data` |

`npm run check` is the fast local gate. It skips the Inside view and the headset.
`npm run e2e` is the full Playwright suite, and CI runs that suite.

## Done in Phase 3

- **Scene descriptors, schema v6.** `pipeline/scene.py` and `pipeline/scene_fit.py` compute the Inside-view layout and write `data/scene.json` (4.1 MB raw, about 1.0 MB gzipped, over the 2 MB payload budget; see REVIEW.md). The file loads on the first Enter. `pipeline/schema.py` and `core/schema.ts` both read version 6, and so do `graph.json` and `meta.json`. v6 added `plaque.width` and the chamber's `dome`.
- **Halls are at most 15 m.** `chamber.max_radius` is 15. When the doorways do not fit on that circle, the pipeline groups them by the target landmark's subject into side galleries. A gallery rank is at most 20 m deep. A subject that needs more depth gets another rank of the same subject, and the doors sit on the outermost rank. `php` has radius 15, 50 doors, and 16 galleries. The farthest gallery wall is 64.3 m from the centre.
- **Chambers drawn together do not overlap.** The pipeline checks every star: hall disks, gallery wedges, and each tunnel at its full width and height, with 5 cm of rock to spare, except at the tunnel's own two doorways. (Before the review it checked only the tunnel's centre line, and 42 tunnel walls cut into halls or galleries.) After each change the build checks every star again. It stops after 50 passes and names the chambers if any still meet; a test covers that. This scene separates in 8 passes. The longest tunnel is `abstri>nnssre`, 443 m. `test_no_tunnel_wall_enters_a_hall_or_gallery_of_its_star` re-checks all of it without using `scene_fit.py`.
- **Renderer.** `app/inside/` turns descriptors into meshes. It does not choose radii, door angles, gallery sizes, tunnel lengths, dome heights, or plaque widths. A gallery mouth is walkable, so a door on the outer arc can be reached from the hall. The hall lamp reaches that outer door. The camera far plane is 1600 m, past the longest tunnel. Each doorway is an arch with the tunnel's own profile, and a reveal (jambs, the arch's underside, a floor strip) joins the curved wall to the tunnel, so there is no gap into the void (`app/inside/geometry.test.ts`). Plaques stand far enough in from the curved wall that both ends show.
- **Statement textures.** MathJax SVG, drawn once per statement and kept in an LRU of 32 (`app/inside/textureCache.ts`). Eviction disposes the texture. Entering a chamber again does not draw it again. Names in the side panel stay on KaTeX.
- **Desktop, Journey, WebXR.** As before: pointer lock and WASD, guided Journey from the axiom end of `criticalPath`, and a headset with teleport, a 30° snap turn, and a guided tunnel move. The Inside view is desktop and XR. The phone project still runs only `e2e/mine.spec.ts`, the surface map.
- **Headset test.** `xr.spec.ts` used to pass alone and fail in the full run. A fixed sleep fired while SwiftShader was still busy with the other WebGL tests, so the snap turn and the button press landed between frames. The `xr` project now runs after the laptop and phone projects. The test holds the stick, the trigger, and B until a frame reports the change. The guided move runs on frame time and the emulated headset draws about 5 fps, so the test travels the shortest tunnel out of `sqrt2irr` (read from `data/scene.json`). The laptop project skips `xr.spec.ts`; run the headset alone with `npx playwright test --project=xr --no-deps`.
- **Screenshots.** Retaken under SwiftShader. The folder is gitignored. `e2e/output/laptop-inside-1-chamber.png`, `laptop-inside-2-tunnel.png`, `laptop-inside-3-arrived.png`, `laptop-inside-4-journey-start.png`, `laptop-inside-5-journey-guided.png`, `xr-xr-1-chamber.png`, `xr-xr-2-travel.png`. The arrival shot is `nnssre` at depth 128, which still reads clearly. REVIEW.md describes each one.

## Left to do

1. **Trigger CI on this branch** (Actions → "Build, test and deploy" → Run workflow → `wip/phase3`). The deploy job only runs on `main`. CI has not run on Phase 3.
2. **Measure 72 fps on a real Quest 3.** The hall is 15 m, a gallery can reach about 64 m, and one tunnel is 443 m. In `sqrt2irr` the headset draws 22 calls and about 160k triangles.
3. **Decide on the open review findings** in REVIEW.md: pillars hiding their plaques, `scene.json` over the payload budget, one-subject galleries that read as rings, and the overlap checks that are still loose.
4. **Add in-headset Journey text and HUD.** The HUD is HTML, so a headset cannot show it.
5. Then merge `wip/phase3` into `main`.

## Still untested

- **72 fps.** There are no device measurements. The emulator cannot give them.
- **Hand-tracking teleport.** Only controllers are emulated.
- **Markers show only set.mm labels.** They have no statements.
- **CI has not run on Phase 3.**

## Resume

```sh
cd truth-mines
git checkout wip/phase3
pip install -r pipeline/requirements.txt && npm ci
python3 -m pipeline                 # builds data/, including data/scene.json
npm run check                       # typecheck, lint, unit, pipeline, map e2e
npm run e2e                         # full Playwright suite: map, Inside view, headset
```

Screenshots land in `e2e/output/`. The folder is gitignored.

## For you to review

- **The 154 theorem `display` forms** in `pipeline/landmarks.yaml`. They are all still `reviewed: false`.
- **Inside-view visuals**, from the screenshots named above.
- **REVIEW.md**, the independent review: what was fixed, and what is left for you.
