# Handoff: Phase 3 (the Inside view), stopped mid-phase

Branch: `wip/phase3`. `main` stays at Phase 2 (`ef62f41`). Phase 3 is not ready for review: one
e2e test is flaky (below) and nothing in Phase 3 has run in CI yet.

## Test state at the stop

| Suite | Result |
|---|---|
| `pytest pipeline/tests` | 26 / 26 pass (8 new in `test_scene.py`) |
| `vitest` (core) | 25 / 25 pass |
| `tsc --noEmit`, lint | pass |
| Playwright, full run | 17 pass, 1 fail: `[laptop] e2e/xr.spec.ts` |
| Playwright, `xr.spec.ts` alone | passed twice |

## Done in Phase 3

- **Scene descriptors, schema v4.** `pipeline/scene.py` computes all Inside-view layout and writes
  `data/scene.json` (about 3.85 MB raw, 0.94 MB gzipped). The `inside:` section of
  `pipeline/config.yaml` holds every parameter. `core/schema.ts` has the matching types and
  `parseScene`. The pipeline and core move together at v4.
- **Chambers.** A round hall per landmark. The statement slab sits on the wall at yaw π. Doorways
  up come first, then doorways down. A pillar stands in front of each doorway, and a plaque sits
  above each lintel. Spawn is at (0, 0, 0.35R), facing the statement.
- **Tunnels.** The drop equals the depth difference × `metres_per_depth` (0.25 m). The grade is at
  most 20° and each turn at most 20°. Both ends are level. Markers come from `chain`, each at its
  own lemma depth. Width, ornament and the entrance plaque come from `feeding_lemmas`.
  `lower_in_upper` gives the far chamber's pose.
- **Strata.** Light, fog and rock colour change with depth.
- **Pipeline tests** (`pipeline/tests/test_scene.py`) cover every descriptor: coverage, chamber
  fit, path drop, grade and level ends, marker placement, the feeding-driven fields, strata,
  determinism (including input order), and conventions.
- **Renderer** (`app/inside/`). It turns descriptors into meshes and computes no layout. Locality:
  only the current chamber, its tunnels and their far chambers are drawn. The budget is 9–10 draw
  calls and about 50k triangles. Labels use rank locality (the 14 nearest).
- **Desktop.** WASD/arrows and pointer lock. Walls and pillars collide. Walking through a doorway
  enters its tunnel, and reaching the far end arrives in the next chamber.
- **Journey.** It follows `criticalPath` from an axiom to the chosen node. "Next" makes a guided,
  eased move. The panel has an **Enter** button and a **Journey here** button.
- **WebXR.** Enter VR, teleport on the floor, a 30° snap turn, and pointing at a doorway for a
  guided tunnel move with a vignette. The view never turns during a guided move. A goes to the
  next Journey step and B exits.
- **Docs.** `CLAUDE.md` rules 9 (engine independence), 10 (deterministic geometry from node id) and
  11 (local subgraph only), plus "The Inside view" section. The README has "Two ways to look" and
  layout rows for `pipeline/scene.py` and `app/inside/`.

## Left to do

1. **Make `e2e/xr.spec.ts` stable** in the full run (see Broken). Then run CI on the branch.
2. **Re-take the Inside screenshots.** The surface-chamber light and the plaque position changed
   after the last screenshots, so the current images are out of date.
3. **Measure 72 fps on a real Quest 3**, in the hub chambers (`php`, R ≈ 46 m) and in a long tunnel.
4. **Add in-headset Journey text and HUD.** The HUD is HTML today, so the headset can't show it.
5. **Phone and touch support for the Inside view.** Playwright's phone project only runs
   `mine.spec.ts`, and nobody has tried the Inside view on touch.
6. **Phase 3 review**, then merge `wip/phase3` into `main`.

## Broken or untested

- **`xr.spec.ts` is flaky.** It fails in the full Playwright run and passes on its own. The cause
  is not diagnosed. Suspects: SwiftShader load from the earlier specs (timing in the guided-move
  wait), and the IWER device state carrying over between tests.
- **72 fps is unverified.** There are no device measurements.
- **Hand-tracking teleport is untested.** Only controllers are emulated.
- **Neighbour chambers may overlap.** In star mode, two far chambers placed by their tunnel poses
  can intersect. They are hidden behind walls in a tunnel but may show through doorways in the
  chamber.
- **Textures use MathJax, not KaTeX.** The statement and name textures are drawn with MathJax SVG
  into a canvas (`app/render/canvasMath.ts`), because KaTeX has no SVG output. This deviates from
  the spec on purpose and needs your sign-off.
- **Markers show only set.mm labels.** They have no statements.
- **CI has not run on Phase 3.**

## Resume

```sh
cd truth-mines
git checkout wip/phase3
pip install -r pipeline/requirements.txt && npm ci
python3 -m pipeline                 # builds data/, including data/scene.json
npm run check                       # pytest, typecheck, lint, vitest
npx vite --port 5176 --strictPort & # dev server for e2e
npx playwright test                 # full e2e (about 7 min under SwiftShader)
npx playwright test --project=laptop e2e/xr.spec.ts   # the flaky one, alone
```

Screenshots land in `e2e/output/` (`laptop-inside-*.png`, `laptop-xr-*.png`). The folder is
gitignored.

Avoid `pkill -f` with a pattern that also matches your own shell command: it kills the shell.

## For you to review

- **The 154 theorem `display` forms** in `pipeline/landmarks.yaml`. They are all still
  `reviewed: false`.
- **Inside-view visuals**, once the screenshots are re-taken (Left to do, item 2).
- **Hub hall size.** `php` has 50 doorways and gets R ≈ 46 m. Is that too big to walk?
- **Size of `scene.json`**, 0.94 MB gzipped. It loads only when you first enter.
- **The MathJax-for-textures deviation** (above).
