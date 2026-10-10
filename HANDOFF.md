# Handoff: Phase 3, the Inside view

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
