# Review: Phase 3 on `wip/phase3` (Grok's work, `9938642..439bc05`)

An independent review of the Inside view against the Phase 3 plan. I fixed only bugs with clear
evidence, and each fix has a test. Everything else is listed below for you to decide.

Base: `439bc05`. Data rebuilt from scratch (`npm run data`) before the review began.

## Findings, by severity

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | Tunnel walls cut into halls and galleries. The overlap check only tested the tunnel's centre line (`pipeline/scene_fit.py:416-421` at `439bc05`), so a tunnel up to 5 m wide could pass 7 cm from a gallery and cut 1.6 m into it. An independent check found **42** such intrusions in the built scene, some about 20 m long (`opth`: `canth>opth` through `sbth`'s gallery; `peano5`: `nnssre>peano5` through `php`'s). The pipeline test passed only because it called the same function. | Fixed |
| 2 | High | `npm run e2e` was not green here. `e2e/xr.spec.ts` failed twice in a row. The separation pass stretched `sqrt2irr>ltnr` to 140 m. The guided move runs on frame time (each frame's step is capped at 50 ms), and the emulated headset draws about 5 fps under SwiftShader, so arrival took longer than the test's 120 s poll. HANDOFF.md said this suite passed. | Fixed (test) |
| 3 | Medium | Every doorway plaque was clipped by the wall. A flat sign at least 3.2 m wide stood 0.12 m in front of a curved wall (`pipeline/scene.py:140`, `pipeline/scene_fit.py:99`), so both ends went behind the wall. This is visible in `laptop-inside-5-journey-guided.png` at `439bc05`: "deduction form" and the lemma count are cut off. | Fixed |
| 4 | Medium | Doorways did not seal against their tunnels. The wall opening was a rectangle 3.4 m tall, but the tunnel is vaulted from 0.62 of its height, so the opening's top corners looked out into the void. The curved wall against the tunnel's straight first ring also left slivers at the jambs and in the floor (up to 0.4 m in an 8 m hall). Visible in `laptop-inside-5-journey-guided.png`. | Fixed |
| 5 | Medium | A weakened test. `pipeline/tests/test_scene.py:141` relaxed the pillar's clearance from its doorway wall from 1 m to 0.5 m. The data still clears 1.09 m. | Restored to 1 m |
| 6 | Medium | A GPU leak. The statement slab's geometry was never disposed (`app/inside/star.ts:61`): one geometry leaked per chamber entered (9, 10, 11, 12 after each exit to the map). | Fixed |
| 7 | Medium | Engine independence (rule 9). The app chose the hall's dome height itself (`app/inside/geometry.ts:136`, `H * 1.18`), so Unreal could not draw the same room. This predates Grok's commit; it came in with `9938642`. | Fixed: `dome` is now a descriptor |
| 8 | Medium | Two timing flakes in e2e. `inside.spec.ts:66` slept a fixed 300 ms before checking what is drawn, which changes on the next frame. `mine.spec.ts:29` reloaded while the first load's fetches were still in flight, so "Failed to fetch" counted as a page error. Here the first failed 2 of 5 runs of its file, and the second failed both full runs before the fix. A fresh browser context already starts with empty storage, so one load is enough. | Fixed (tests) |
| 9 | Low | The plan's failure path (the build stops and names the chambers) existed but was untested. | Test added |
| 10 | Medium | **Pillars hide their own plaque.** Each up doorway's pillar is full height and stands on the line between the hall and that doorway's plaque, so from in front of it the middle of the sign is hidden (`e2e/output/review-plaque-sqrt2irr-nnssre.png`, `…-sup3.png`). The pillar's own label gives the same name, so nothing is lost, but it reads badly. | Left for you (design) |
| 11 | Medium | **`scene.json` is over the payload budget**: 4.1 MB raw, about 1.0 MB gzipped, against "data payload under 2 MB". `core/tests/data.test.ts:83` checks only `graph.json` (513 KB; CLAUDE.md still says about 150 KB). HANDOFF says the earlier review accepted this. | Left for you |
| 12 | Low | **A one-subject gallery reads as a ring, not a corridor.** In `sqrt2irr` all 17 doorways share one subject, so one wedge takes nearly the whole wall. You stand in a round hall with an outer ring, and from the spawn no plaque is legible: they fade beyond 16 m, and the doors are about 19 m out. Multi-subject galleries, as in `nnssre` (`laptop-inside-3-arrived.png`), do read as corridors. | Left for you (design) |
| 13 | Low | Overlap checks that are still loose. Chamber against chamber still lets two halls interpenetrate by up to 5 cm (`CLEARANCE`). Tunnel against tunnel is not checked at all. The hall's dome is not in the chamber-against-chamber check (there are no dome intrusions in the current data; the new independent test covers tunnels against domes). Counting the dome in the separation pass stretched one tunnel to 1.2 km, so I backed that out. | Left for you |
| 14 | Low | Guided moves run on frame time with a 50 ms cap, so they slow down on a desktop under 20 fps. That doesn't matter on a Quest at 72 fps. | Left |
| 15 | Low | The plaque says "1 lemmas feed this tunnel". | Left |

## The plan, item by item

Line numbers are at `439bc05` unless marked "now".

1. **Global convergence: pass.** Each pass collects violations over every star (`pipeline/scene.py:362` calls `collect_violations`, which loops over every chamber at `pipeline/scene_fit.py:531`). That happens after any tunnel changes (`scene.py:372-386`). The cap is `SEPARATION_PASSES = 50` (`scene.py:66`). If the passes run out, or a pass has nothing left to move (`scene.py:369`), the build raises `LayoutError` listing every chamber involved (`scene.py:389-399`, `scene_fit.py:650`). There was no test of that failure; there is now (`pipeline/tests/test_scene_layout.py`, `test_a_layout_that_does_not_separate_fails_the_build_and_names_the_chambers`). This build separates in 8 passes (7 before the fixes).
2. **No tunnel through a hall or gallery; 20 m galleries; split subjects: fail on the first part, pass on the other two.** The gallery cap is at `scene_fit.py:57,68` and tested at `test_scene.py:83`. The split is at `scene_fit.py:67-72`, tested at `test_scene.py:94,150` and `test_scene_layout.py:126`. The tunnel test (`test_scene.py:73`) checked only the centre line, using the very code under test, and missed 42 intrusions (finding 1). Fixed, with an independent full-width test.
3. **Texture LRU: pass.** `app/inside/textureCache.ts:6-38`, with the cap at `:41`. Eviction disposes (`:34`), and so does replacing a key (`:26`). Three unit tests in `textureCache.test.ts`. A star holds at most two statements (its own and the focused far chamber's), so a texture in use is never evicted.
4. **No layout logic in `app/`: pass, with one exception.** The exception was the dome (finding 7). The rest of the math in `app/` is tessellation of descriptors (`geometry.ts`), collision against them (`walk.ts:26`), or movement and lighting: arrival nudge `inside.ts:130-133`, guided-route waypoints `inside.ts:146-159`, lamp `star.ts:150-151`. The plaque's text width was an app constant (`star.ts:140`); it now comes from the descriptor.
5. **No test weakened: fail, one case.** The pillar clearance (finding 5), now restored. The other changed assertions hold up:
   - The plaque tolerance went from 1.5 to 3 cm (`test_scene.py:111`), which double rounding explains. I replaced it with a stronger end-of-plaque check.
   - "Ups first" now holds per gallery, not round the whole hall. That is by design: galleries group doorways by subject.
   - `xr.spec.ts` swapped sleeps for polls, and each poll asserts the same value. The final yaw check is now a poll after the stick is released.
   - No assertion was removed from `test_tunnels.py`, `test_scene.py`'s tunnel, marker, width or strata tests, or `inside.spec.ts`.
6. **Schema v5 matches: pass.** `pipeline/schema.py:11` and `core/schema.ts:5` both read 5, and so do `graph.json`, `meta.json` and `scene.json`. Every key in `scene.json` matches the TS interfaces; I checked them programmatically. Note that `pipeline/schema.py` describes only `Node`; the scene's shapes live in `core/schema.ts` and `pipeline/scene.py`. Now 6 in both files (`plaque.width`, `dome`).

## Deploy guard

Already in place: the `deploy` job has `if: github.ref == 'refs/heads/main'` (`.github/workflows/build.yml:78`), and so does the Pages artifact upload (`:73`). No change. The workflow still runs only on a push to `main`, on a pull request, or by `workflow_dispatch`, so a push to this branch does not start CI.

## Visual check

The screenshots were generated with
`npx playwright test --project=laptop e2e/inside.spec.ts e2e/xr.spec.ts`. Since Grok's
`playwright.config.ts` change, the laptop project ignores `xr.spec.ts`, so the headset shots need
`npx playwright test --project=xr --no-deps`.

At `439bc05`:

- `laptop-inside-1-chamber.png`: the `sqrt2irr` hall, 15 m. The statement wall is sharp and readable ("√2 ∉ ℚ", the unreviewed-form note under it). Four pillars stand in view, and doorways sit back at the gallery's outer wall. The light is warm brown and sufficient. No plaques show: the doorways are past the 16 m fade.
- `laptop-inside-2-tunnel.png`: inside `sqrt2irr>nnssre`, with ribs, marker posts and the `sqrt2irrlem` label. Dim but clear.
- `laptop-inside-3-arrived.png`: arrival in `nnssre` (depth 128), standing in a gallery wedge and looking back to the hall. It reads as a corridor and is not too dark.
- `laptop-inside-4-journey-start.png`: the `ax-2` hall, bright, statement readable.
- `laptop-inside-5-journey-guided.png`: the `ax-2` doorway. **The plaque is clipped at both ends by the wall (finding 3). The opening is a rectangle with open corners above the vault, and there are dark slivers at the jambs (finding 4).**
- `xr-xr-1-chamber.png`: the same hall in the emulated headset, with controller rays. Fine.
- `xr-xr-2-travel.png`: the start of a guided move after a 30° snap turn. The vignette is on: the floor's edges read about 30 against 46 in the middle. No clipping.

After the fixes, the same shots show the arched opening meeting the tunnel. Extra shots taken for
this review (gitignored, regenerate as needed):

- `review-plaque-ax-2-door.png`: the plaque reads in full above the sealed arch.
- `review-plaque-sqrt2irr-nnssre.png` and `-sup3.png`: plaques readable, but each door's pillar covers the middle of its sign (finding 10).

## What I changed

- **Tunnel clearance (finding 1).** `pipeline/scene_fit.py`: `_path_hits` takes the tunnel's half-width and height, and the walls must stay 5 cm outside every hall and gallery. `_seg_sector_gap` is an exact segment-to-wedge distance. `_tunnel_hits` trims each tunnel's own two doorways by 1.5 m plus its half-width. The separation pass uses the same rule.
  - Tests: two unit cases (a wall grazing a hall, a wall grazing a wedge), both failing before the fix. Also `test_no_tunnel_wall_enters_a_hall_or_gallery_of_its_star`, which shares no code with `scene_fit.py`: it samples both walls every 0.5 m, from floor to vault, against every hall, dome and gallery in every star.
  - Effect: the longest tunnel went from 691 m (`lgsquad>df-field`) to 443 m (`abstri>nnssre`).
- **Plaques (finding 3).** `pipeline/scene.py`'s `plaque()` sets each sign's width and how far it stands in from the wall. Both ends clear the wall by 0.12 m, and the sign stays inside its own doorway's slot, so neighbours never meet. That adds `plaque.width` to the descriptor, so schema v6. `star.ts` uses that width for the text. Tested in `test_scene.py`: both ends in front of the wall, inside their gallery, no two signs crossing or touching.
- **Doorways (finding 4).** `app/inside/geometry.ts`: the opening follows the tunnel's own profile (`archAt`), and `reveal()` adds jambs, the arch's underside and a floor strip, joining the curved wall to the tunnel's straight first ring.
  - Tests: `app/inside/geometry.test.ts` casts rays at a band round each doorway's outline, on a small hall, a gallery's outer wall, and a hall whose one doorway straddles yaw 0. Every ray must hit rock. All three fail on the old geometry.
  - On the way I caused, caught and fixed a hole in single-door halls, where the doorway faces yaw 0 and the wall's seam is.
- **Dome (finding 7).** The `dome` descriptor comes from `chamber.dome_rise` in `config.yaml`, keeping the old value of 1.18. It is tested in `test_scene.py` and read by `geometry.ts`.
- **Slab leak (finding 6).** `star.ts` disposes the slab's geometry. New e2e test: entering a chamber three times does not grow `renderer.info.memory.geometries`. It fails without the fix (9, then 11).
- **Tests.**
  - Pillar clearance restored (finding 5).
  - `xr.spec.ts` travels the shortest tunnel out of `sqrt2irr`, read from `data/scene.json` (now `sup3`, 65 m); every check stays the same (finding 2).
  - `inside.spec.ts` polls instead of sleeping, and `mine.spec.ts` lets its throwaway first load finish before reloading (finding 8).
  - The non-convergence test (finding 9).

### Frame-rate impact (rule 5)

Draw calls are unchanged: 9 on the desktop and 22 in the headset in `sqrt2irr`, 17 neighbours. In
the emulated headset, triangles went from 115,524 to 160,548. That includes the new layout as well
as the arched doorways and reveals, which add about 50 triangles per doorway. The budget is 500k.
SwiftShader frame rates moved from 5.1 to 4.6 fps in the headset and from 7 to 6.2 fps on the
desktop. Those are CPU rasteriser numbers and say little about a Quest 3; measure on the device.

## Test results

| Suite | Result |
|---|---|
| `npm run check` | pass. Typecheck, lint, vitest 34, pytest 35, map e2e 14 |
| `npm run e2e` | 19 pass, including `e2e/xr.spec.ts`. Two consecutive full runs green, the second after a clean `npm run data` |

Both were run after deleting `data/` and `pipeline/build/` and rebuilding (`npm run data`: separated in 8 passes, longest tunnel 443 m).
Under SwiftShader, `npm run check` takes about 7 minutes and `npm run e2e` about 6.

## CI

Not triggered. The `gh` CLI is installed here, but its token is invalid (`gh auth status`: "The token in GH_TOKEN is invalid"),
so `gh workflow run build.yml --ref wip/phase3` could not run. **Trigger it by hand:** Actions →
"Build, test and deploy" → Run workflow → branch `wip/phase3`. The deploy job is guarded to `main`, so nothing is published.
