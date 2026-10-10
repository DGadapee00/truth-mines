# Handoff: Phase 3, the Inside view

Branch: `wip/phase3`. `main` stays at Phase 2 (`ef62f41`). Phase 3 is not merged.
A push of this branch does not start CI. The workflow runs on a push to `main`, on a
pull request, and on `workflow_dispatch`.

## Test state

| Suite | Result |
|---|---|
| `npm run check` | pass. Typecheck, lint, vitest 30, pytest 31, map e2e 14 |
| `npm run e2e` | 18 pass, including `e2e/xr.spec.ts` in the full run |

`npm run check` is the fast local gate. It skips the Inside view and the headset.
`npm run e2e` is the full Playwright suite, and CI runs that suite.

## Done in Phase 3

- **Scene descriptors, schema v5.** `pipeline/scene.py` and `pipeline/scene_fit.py` compute the Inside-view layout and write `data/scene.json` (4.0 MB raw, 1.01 MB gzipped). The review left that size as it is. The file loads on the first Enter. `pipeline/schema.py` and `core/schema.ts` both read version 5, and so do `graph.json` and `meta.json`.
- **Halls are at most 15 m.** `chamber.max_radius` is 15. When the doorways do not fit on that circle, the pipeline groups them by the target landmark's subject into side galleries. A gallery rank is at most 20 m deep. A subject that needs more depth gets another rank of the same subject, and the doors sit on the outermost rank. `php` has radius 15, 50 doors, and 16 galleries. The farthest gallery wall is 64.3 m from the centre.
- **Chambers drawn together do not overlap.** The pipeline tests check every star: hall disks, gallery wedges, and tunnel paths, except at the tunnel's own doorway. After each change the build checks every star again. It stops after 50 passes and names the chambers if any still meet. This scene separated in 7 passes. The longest tunnel is `lgsquad>df-field`, 691 m.
- **Renderer.** `app/inside/` turns descriptors into meshes. It does not choose radii, door angles, gallery sizes, or tunnel lengths. A gallery mouth is walkable, so a door on the outer arc can be reached from the hall. The hall lamp reaches that outer door. The camera far plane is 1600 m, past the longest tunnel.
- **Statement textures.** MathJax SVG, drawn once per statement and kept in an LRU of 32 (`app/inside/textureCache.ts`). Eviction disposes the texture. Entering a chamber again does not draw it again. Names in the side panel stay on KaTeX.
- **Desktop, Journey, WebXR.** As before: pointer lock and WASD, guided Journey from the axiom end of `criticalPath`, and a headset with teleport, a 30° snap turn, and a guided tunnel move. The Inside view is desktop and XR. The phone project still runs only `e2e/mine.spec.ts`, the surface map.
- **Headset test.** `xr.spec.ts` used to pass alone and fail in the full run. A fixed sleep fired while SwiftShader was still busy with the other WebGL tests, so the snap turn and the button press landed between frames. The `xr` project now runs after the laptop and phone projects. The test holds the stick, the trigger, and B until a frame reports the change.
- **Screenshots.** Retaken under SwiftShader. The folder is gitignored. `e2e/output/laptop-inside-1-chamber.png`, `laptop-inside-2-tunnel.png`, `laptop-inside-3-arrived.png`, `laptop-inside-4-journey-start.png`, `laptop-inside-5-journey-guided.png`, `xr-xr-1-chamber.png`, `xr-xr-2-travel.png`. The arrival shot is `nnssre` at depth 128, so it is dark.

## Left to do

1. **Measure 72 fps on a real Quest 3.** The hall is 15 m, a gallery can reach about 64 m, and one tunnel is 691 m.
2. **Add in-headset Journey text and HUD.** The HUD is HTML, so a headset cannot show it.
3. **Phase 3 review**, then merge `wip/phase3` into `main`.

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
