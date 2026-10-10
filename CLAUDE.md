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

The e2e test checks draw calls and triangles on load; data.test.ts checks the payload size.

## Checks before a commit

`npm run check` (typecheck, lint, unit tests, pipeline tests), then `npm run e2e` and look at the
screenshots in `e2e/output/`. In a sandbox without a GPU, Chromium renders with SwiftShader and is
slow; the e2e timeouts allow for that.

## Decisions that differ from the spec, and why

- **MathJax, not KaTeX.** KaTeX's HTML needs web fonts and cannot be drawn into a WebGL texture
  for the headset without tainting the canvas. MathJax's SVG output draws glyphs as paths, so one
  renderer serves the page and the headset.
- **Validation's grounding rule** accepts theorems proved from their own hypotheses alone and
  restatements of a definition. set.mm contains 25 such statements, so "every node reaches an
  axiom" can never pass on it as written.
- **Definitions are roots** at depth 0, beside the axioms: both are asserted, not proved.
- **Label font** is DejaVu Sans, pinned and subset by the pipeline, not troika's default CDN
  fallback, so labels render offline and the build fails on a missing glyph.
