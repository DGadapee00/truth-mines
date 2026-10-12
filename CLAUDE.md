# Truth Mines: notes for Claude

A walkable 3D map of mathematics built from Metamath's set.mm: Python pipeline → `data/` →
TypeScript + three.js app, desktop first, WebXR on a Meta Quest 3 next. Read `README.md` for the
layout and `pipeline/README.md` for the data.

## Rules

1. `core/` never imports three.js, troika or anything from `app/`. ESLint enforces it.
2. Never hand-edit files in `data/`; change the pipeline and rebuild (`npm run data`).
3. Never hand-author graph edges or depths. Curation lives in `pipeline/landmarks.yaml` (which
   landmarks, their names) and `pipeline/config.yaml` (subjects, layout, LaTeX overrides) only.
4. New object types use instancing or batching; no per-node meshes or per-label draw calls.
5. Respect the budgets below; report the frame-rate impact of any rendering change.
6. Never add smooth locomotion, or any camera motion the user did not start. Travel to a node
   follows a click, a search or a key, eases in and out, and never rolls the horizon.
7. Notes in `content/` may be drafted by Claude but stay `reviewed: false` until a person approves
   them; the pipeline exports only reviewed notes, so the app never shows an unreviewed one.
8. Every feature lands with desktop support and a test.
9. Engine independence: all procedural layout of the Inside view (chamber dimensions, statement
   wall placement, doorways and plaques, pillar positions, gallery wedges, tunnel paths, marker positions,
   strata light, fog and rock colour) is computed in the pipeline (pipeline/scene.py) and
   exported as scene descriptors in data/scene.json. The app only renders those descriptors and
   decides no geometry of its own, so a second engine (Unreal) can render the identical mine.
   Every descriptor is covered by pipeline tests (pipeline/tests/test_scene.py); pipeline/schema.py
   and core/schema.ts move together.
10. Chamber and tunnel geometry is deterministic from node id: randomness is seeded from a
    SHA-256 of the id (never Python's hash), and output does not depend on input order.
11. The Inside view renders only the local subgraph: the current chamber, its tunnels and the
    chambers one hop away (inside a tunnel, only that tunnel's far chamber). Never the whole graph.

## Display forms

A landmark may carry a hand-written readable statement (`display` in landmarks.yaml). Write it
from set.mm's actual statement (`python -m pipeline show LABEL`), never from memory of the
textbook version: set.mm's form can be narrower (`ivth` is the increasing case) or differently
quantified. Drafts by Claude are `reviewed: false`; the panel flags them and the formal form
stays one click away. Only a person sets `reviewed: true`.

## Naming landmarks

Before adding or renaming a landmark, run `python -m pipeline show LABEL` and read set.mm's own
description. Math in a name goes between $ signs (KaTeX on the page, converted to plain text for
the 3D labels by pipeline/names.py, which fails on anything it cannot convert). Name what the
statement actually says: `lttri` is "'less than' is transitive", not
trichotomy; `ivth` is the increasing case only. The label font must cover every character in a
name, or export fails (DejaVu Sans has no 𝒫, for example).

## Budgets (Quest 3)

| Budget | Target |
| --- | --- |
| Frame rate | 72 fps sustained |
| Draw calls | under 100 per frame (the mine itself uses about 8) |
| Triangles | under 500k on screen |
| Initial load | under 5 s on Wi-Fi |
| Data payload | under 2 MB (graph.json is about 150 KB) |
| Selection | highlight within one frame |

The e2e tests check draw calls and triangles on the map and inside a chamber (a chamber with 17
neighbours draws in about 10 calls); data.test.ts checks the payload size. Frame rate on a real
Quest 3 must be measured on the device (chrome://inspect over USB); the emulator cannot.

## The Inside view

- Descriptors: data/scene.json, conventions written into it (metres, +Y up, yaw about +Y with
  heading(yaw) = (sin yaw, 0, cos yaw)). Tunnels drop exactly (depth difference) x 0.25 m; markers
  come from `chain` and stand where the floor is at the lemma's depth; width, ornament and the
  plaque above each doorway come from `feeding_lemmas`.
- app/inside/: geometry.ts turns descriptors into triangles, star.ts builds the local scene,
  walk.ts is movement, inside.ts the controller (desktop walk, Journey, headset).
- Headset comfort: teleport, 30-degree snap turn, guided tunnel moves with ease in and out and a
  vignette. A guided move never turns the view.

## The cathedral

`cathedral/` is a separate IWSDK app (own `package.json`, npm) and `worker/` the Cloudflare Worker behind
Trurl (own package). GitHub Pages publishes `cathedral/dist`. The surface mine is still `npm run dev`.
Rules 1, 2, 3 and 9 apply: the layout of the hall, doors and threshold is in
`pipeline/cathedral.py` (data/cathedral.json), the pathways and their gates in `pipeline/pathways.py`,
Trurl's grounding in `pipeline/grounding.py`. The app only renders. No provider key or app secret is in
the repo or a client build (`npm run secrets`); the app secret is typed once per device. Comfort is
teleport and a 30 degree snap turn only. A pathway's moment rubric stays `rubric_reviewed: false` until a
person approves it. Dalton Gadapee approved the number-theory rubrics, questions, plane captions, app
lines, and display forms on Oct 11, 2026. The Worker is not deployed; without it, finishing the doing
earns that moment's ideas on the device. See `cathedral/README.md`, `HANDOFF.md`, and `worker/README.md`.

## Checks before a commit

`npm run check` is the fast local gate: typecheck, lint, unit tests, pipeline tests, and the map
e2e (`e2e/mine.spec.ts` on laptop and phone). `npm run e2e` is the full Playwright suite, including
the Inside view and the headset. CI runs that full suite (`.github/workflows/build.yml`). In a
sandbox without a GPU, Chromium renders with SwiftShader and is slow; the e2e timeouts allow for that.
Screenshots land in `e2e/output/`.

## Decisions that differ from the spec, and why

- **MathJax for statement textures, KaTeX for panel names.** KaTeX's HTML needs web fonts and cannot
  be drawn into a WebGL texture for the headset without tainting the canvas. Statement walls are
  rasterized once with MathJax SVG and kept in an LRU of 32 textures (`app/inside/textureCache.ts`);
  entering a chamber again does not draw them again. Names in the side panel stay on KaTeX.
- **Validation's grounding rule** accepts theorems proved from their own hypotheses alone and
  restatements of a definition. set.mm contains 25 such statements, so "every node reaches an
  axiom" can never pass on it as written.
- **Definitions are roots** at depth 0, beside the axioms: both are asserted, not proved.
- **Label font** is DejaVu Sans, pinned and subset by the pipeline, not troika's default CDN
  fallback, so labels render offline and the build fails on a missing glyph.
