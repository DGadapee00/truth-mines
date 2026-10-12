# Review: the cathedral prototype on `prototype/cathedral`

An independent review of Sonnet's cathedral work (`6b53fd4..be7c8d3`), against `docs/vision.md` and
`docs/experience-design.md`. I checked every claim myself: I rebuilt `data/` from set.mm, ran both
suites, mutation-tested the important logic, drove the app on desktop and in the IWSDK emulator, and
read set.mm for each landmark and gate. Six bugs are fixed, each in its own commit with a test
(`85d3e6e..1f7de1f`). Everything else is listed for you.

## 1. Verdict

The plumbing is good and honestly tested, but the experience does not yet meet the vision. The hall
is a dark navy cylinder with flat arches, nothing beautiful. An idea is "earned" by reading the
plane's caption back to Trurl. Earning it changes one door. So the feeling of your framework
shifting has nothing to land on yet. It is ready for your headset test as a test of wiring and
comfort (threshold, teleport, snap turn, push-to-talk, captions, resume), with my fixes and a
deployed Worker. It is not ready to judge whether this engine and this design produce the Truth
Mines; for that it needs the three changes in section 6 first.

## 2. Findings, by severity

| # | Severity | Where | What's wrong | Status |
|---|---|---|---|---|
| 1 | High | `app/plane/plaza.ts:79` (`paint` ran only on the first update) | **The sieve plaza was invisible in the cathedral app.** Its 99 columns are one InstancedMesh, and IWSDK measured its bounds before the columns were placed. So three.js kept a bounding sphere of 0.87 m at the origin, 230 m from the plaza, and culled every column: at the plaza stop only floating labels showed over "99 of 99 standing" (compare `docs/review-cathedral/28-map-app-plaza-for-comparison.png` with the old `cathedral-6-plaza.png`). The e2e test passed because it only counted standing numbers in the state. | Fixed `be8c5d1`; e2e now checks the columns pass the frustum test |
| 2 | High | `cathedral/src/app.ts` `sessionChanged` | **Leaving VR from inside the plane broke the world.** The flow went back to `ready` but the plane stayed drawn and the hall stayed hidden. After the next threshold the visitor stood in the road under a sign saying "The cathedral", with invisible doors still answering the pointer (`27-cathedral-after-leaving-vr-in-plane.png`). The place in the plane was not saved either. On a Quest this is what the system menu or taking the headset off does. | Fixed `d577d4c`; headset e2e test |
| 3 | High (vision) | `pipeline/config.yaml:196-203`; `cathedral/src/app.ts:552-556` | **Earning is reading the answer back.** The road's caption says "Every whole number is built from primes in exactly one way", which is the road rubric word for word. The plaza says "What is left standing is the primes", the sieve rubric. The sieve note then explains why nothing falls after 7. The active moment is picked only by which zone you stand in, so nothing has to be *done*: you can earn `1arith` at the road's start by typing the caption. Trurl is never told what was struck, so it cannot ask the design's own question, "why did nothing fall after you struck 7?". Principle 3 fails. | Left for you (design) |
| 4 | High (maths) | `pipeline/config.yaml:339` | **`1arith` gating Algebra and symmetry is not true of set.mm.** In `graph.json`, `ablfac` (fundamental theorem of finite abelian groups) does not rest on `1arith`. Only `dirith` and `pnt` do. The config comment's reason ("dirith rests on both") is an argument for a junction, not a gate. The hall tells the visitor that algebra rests on prime factorization, which is false. Principle 5 fails at the one place the map changes. | Left for you |
| 5 | High (design) | `pipeline/config.yaml:298-355`, `core/doors.ts` | **The door states cannot move, except one.** No moment earns any direct dependency of any gate (0 of 5 for `1arith`, 0 of 33 for `bwth`, and so on; I computed all eleven). So no door can ever go from sealed to dim. Dim means only that the gate is an axiom or definition (logic, sets, infinity, and the placeholders `df-lmod` and `df-trkg`), and those stay dim forever. Earning `df-prm` at the sieve changes nothing visible. The only change the whole prototype can make is Algebra jumping from sealed straight to frontier. Principle 4 ("fainter, what lies beyond") is not served: dim measures nothing. This is D3 from the plan, but worse than reported. | Left for you |
| 6 | High (risk, unverified) | `worker/src/ratelimit.ts:25`; `cathedral/src/lib/progress-store.ts` `doSync` | **The rate limiter will likely refuse the progress PUT in production.** Every request writes a KV counter, and a sync is a GET then a PUT within milliseconds, both writing the same `rl:progress:<minute>` key. Cloudflare KV documents a limit of 1 write per second per key, and a refused write makes the Worker answer 503. The free tier also allows only 1,000 writes a day. Mocks cannot show this; check it on the deployed Worker. Fix ideas: the Workers Rate Limiting binding or a Durable Object instead of KV, and drop the GET before the PUT (the PUT already returns the merge; I mutation-tested that removing it changes nothing). | Partly fixed (finding 9); left for you |
| 7 | Medium | `cathedral/src/app.ts` `enterPlane` | **The cathedral's vault hung over the number theory road** (`16-road-arrive.png`, `26-headset-plane.png`, gold lines overhead). | Fixed `1f7de1f`; e2e |
| 8 | Medium | `worker/src/request.ts`, `worker/src/prompt.ts` | **Prompt injection into the system prompt.** `earned` ids the grounding does not know were written into Trurl's *system* prompt verbatim, and the parser accepted any string of up to 80 characters, so a request could put its own instructions next to the rubric. The prompt test claimed the visitor cannot write into the system prompt; it only checked the utterance. | Fixed `85d3e6e`: ids must be set.mm labels, in the parser and the JSON Schema |
| 9 | Medium | `cathedral/src/app.ts:737`, `progress-store.ts` | **Standing still in a plane saved and synced every 4 s**, about 2,700 KV writes an hour against a free tier of 1,000 a day. Once it ran out, every endpoint, Trurl included, would answer 503. | Fixed `568e7d4`: the same place again is not a change |
| 10 | Medium | `scripts/check-no-secrets.mjs` | **`--client dist` scanned the wrong build.** The directory was joined to the repo root whatever you ran it from, so the command in `cathedral/README.md` crashed with a stack trace, and it would have passed on the root app's build if one existed. | Fixed `a4aac28`: resolved from where it runs (from the root: `--client cathedral/dist`) |
| 11 | Medium | plane HUD, `pipeline/config.yaml:195-205` | **Unreviewed text is shown to the visitor.** All five plane captions are `reviewed: false` and appear with "(draft)" in the cathedral's HUD. The app's own lines ("Twelve doors. The ones that glow are open to you.", Trurl's sleep and failure lines) are not reviewed anywhere. Principle 5 says nothing unreviewed is shown. | Left for you (review the texts, or hide drafts) |
| 12 | Medium | `be7c8d3` | **The rubrics were marked approved by the agent**, on the strength of "the project owner's exact words". I cannot see that approval. Please confirm it, since CLAUDE.md says only a person sets the flag. | Left for you |
| 13 | Medium | `worker/src/trurl.ts:9-11` | **Haiku 5.5 thinks by default, and thinking counts against `max_tokens: 400`.** A reply that thinks long stops at `max_tokens`. The Worker then sends a cut caption and an empty verdict (correctly, but the visitor's good explanation earns nothing). Thinking also delays the first caption word. The persona block (about 650 tokens) is probably below the minimum length that can be cached, so `cache_control` likely does nothing (cost is negligible). Needs a real key. | Left for you |
| 14 | Medium | `pipeline/grounding.py` | **Trurl's grounding holds only set.mm statements**, not the plane's own computed and tested facts. Rule 2 of the persona says Trurl must say it doesn't know anything outside the grounding, so "is 91 prime?" or "why did 49 fall?" should get "I don't know". The facts are in `plane-number-theory.json`; the grounding stage could add them. | Left for you |
| 15 | Medium | `cathedral/src/world/hall.ts:84,93,100`; `previews.ts:56,91,94`; `ribbon.ts:54-55`; `docs/schemas/cathedral.schema.json:91` | **Rule 9 leaks.** The app decides the door frame (0.28 m wide, 0.12 m deep), the dais's thickness and taper, the pedestal's taper, the ring-motif sizes, the prime towers' animation timings and drop height, Trurl's size and place, and the lights and fog. A preview's `params` is an untyped object in the schema, so an Unreal build has no contract for it. | Left for you |
| 16 | Low | `cathedral/src/app.ts:540` | In a headset the resume yaw is `desktop.heading`, which a headset never updates, so the saved heading is meaningless. Harmless in VR (the view is never turned), but wrong if you resume on desktop. | Left |
| 17 | Low | `cathedral/src/input-desktop.ts:56` | After you send a line to Trurl, focus stays in the text box: W A S D, 1 2 3 and M type into it, and Escape does not leave it. Only a click on the scene does. My own screenshots fell into this. | Left (UX) |
| 18 | Low | `worker/test/auth.test.ts:26` | The test only guards a compare that looks at the last byte. Mutating the compare to look only at the *first* byte passes every test. The code itself is correct. | Left |
| 19 | Low | `cathedral/public/` | `scenes/AGENTS.md` and `ui/AGENTS.md` (IWSDK agent notes) ship in the public build. | Left |
| 20 | Low | `core/schema.ts:414,501,540,547`; `pipeline/pathways.py:18`; `app.ts` | **Twelve-plane scaling is hard-coded**: plane ids, moment kinds (`road \| sieve \| overlook`), 4 arcs and 12 slots (the design's second tier of doors breaks the parser), one plane file, `stretches[0]` only (nothing advances a stretch), and a zone-to-moment map in the app. | Left |
| 21 | Low | `HANDOFF.md`; `cathedral/src/world/vault.ts:6` | HANDOFF.md is still the number theory handoff; the cathedral has none. The vault comment says golden ratio; the ratio is 0.82. | Left |

## 3. The four lenses

### Vision

| Principle | Verdict | Evidence |
|---|---|---|
| 1. Visuals come from the mathematics | **Mostly fails** | The threshold's Sierpinski rings and the vault's shrinking twelve-gons are real rules (`10-vault-overhead.png`). The hall itself is a generic room: a blue cylinder, flat gold-framed arches, a black floor (`06`, `09`). The symmetry is real (12 slots, tested) but you don't feel it: three doors in view, no ornament. Nine of twelve doors carry no preview of their own mathematics. The plane is unchanged gray box. |
| 2. Your path is your own | **Partly** | No curriculum, and door states are computed, never stored. But the gates are hand-picked placeholders, and one is false (finding 4). With one open door there is no choice to make. |
| 3. Understanding is earned | **Fails** | Explaining exists, doing does not count, and the HUD prints the answer (finding 3). The verdict filter itself is solid: forged ids, ids outside the moment, already-earned ids, split tags and injection are all dropped, and every one of those checks survived my mutation tests. |
| 4. You can always see further | **Weak** | Dim and sealed doors are visible and say so on focus (`13`, `14`). But dim means "gated on an axiom", not "nearly reachable", and it can never change (finding 5). |
| 5. The map is true | **Mixed** | Every number on the plane is computed and tested, and the grounding carries only set.mm text plus reviewed notes. But the Algebra gate is false, and unreviewed captions are on screen (findings 4, 11). |

**Trurl's persona** (`worker/src/prompt.ts`) matches the doc closely: a one-sided ribbon, Banks' drone, the Cheshire Cat, teasing never cruel, quiet until called, never lectures, guarding the frame against scores, unmovable by "ignore your rules". The in-app lines are in voice ("Slow down, I am only one ribbon."). It cannot be judged for real until a key is used.

**Scores:** none. No points, percentages or bars. The sieve's "25 of 99 standing" is plane state, and the sync label is a small grey corner note.

**Biggest risk to the vision:** that earning stays what it is now, reading the caption back to a chatbot while the cathedral barely reacts. That is a quiz with extra steps, and the one feeling the project exists for has nowhere to come from. Beauty can be added later; this loop is the product.

### Visual

Plainly: **it does not feel like the Truth Mines.** It is correct geometry with no atmosphere, the lesson from the Unreal spike again. Against the art direction:

- **Light and pattern, not rock:** no rock, but no light either. The surfaces are flat colour under one point light and a hemisphere light. Nothing glows from within, and nothing reads as translucent or crystalline. Sainte-Chapelle's "light as material" is entirely absent.
- **Ornament from mathematical rules:** only the threshold and the vault, both drawn as WebGL lines, which are always 1 px wide. In the headset they will be thin, aliased and shimmering. There are no tilings, polyhedra, tracery or domes on the floor, the walls or the doors. The Isfahan-ceiling reference has no counterpart.
- **The threshold** (`01`, `02`, `24`): the rings hang inside the hall's vault, so from the first second you look *through* them at the doors below. It does not separate the ordinary world from this one; it gives the arrival away. The rings shrink only from 3.5 m to 1.8 m over 22 m, so it barely closes around you. Looking down during the descent is a black void (`05`).
- **On arrival and turning round** (`06`, `09`, `25`): three flat arches on a dull wall. The far wall, "where an altar would be", has nothing to mark it. The vault from the floor is a few gold lines on black.
- **The frontier door** (`11`, `12`): a solid gold arch with pastel cubes rising beside it. It reads as "open", not as beckoning. The prime towers are the right idea, but their muted colours lose the prime hues.
- **Dim and sealed** (`13`, `14`): blue-grey and near-black panels. Clear, but nothing tempting about either.
- **The road and sieve** (`16`, `17`, `19`, `20`): unchanged gray-box blocks. Even fixed, the struck sieve's 25 survivors barely stand out under the weak light. The design asked for the plane to move toward the cathedral's luminous style; it has not.
- **Trurl** (`18`): a small gold Möbius ribbon, the nicest object in the scene. It sometimes sits half off-screen or edge-on (`03`, `14`). On desktop the captions are a HUD bar, not beside the ribbon. In the headset they are one always-on panel that follows your view, with control hints, which is a big immersion cost in a sacred hall.
- **A door lighting after earning** (`15` to `22`): the door turns from near-black to solid gold and a pedestal appears. You are in the plane when it happens, so you never see the change. On return it is a colour swap with no ceremony.

### Conceptual

- **Mathematics.** The rubrics agree with set.mm. `df-prm` defines a prime as a positive integer with exactly two positive divisors, which matches "greater than 1, divisors only 1 and itself". `1arith` is the bijection from ℕ to finitely supported exponent vectors, which matches "built from primes in exactly one way" (the rubric's "above 1" drops 1's empty product, which is fine). "Every composite up to 100 has a prime factor of at most 7" is true. The grounding is exactly set.mm's statements and descriptions, credits stripped, with no unreviewed display forms (all display forms are still `reviewed: false`, so Trurl sees none). The sieve moment earns a *definition*, which is a fair stand-in, since set.mm has no sieve theorem among the landmarks. The Algebra gate is wrong (finding 4).
- **Design coherence.** The door-state rule, pathways and progress model are clean pieces that don't yet add up. The rule uses direct graph dependencies, but moments earn isolated landmarks, so the earned set is never closed downward and "dim" never happens (finding 5). Junctions have no data model yet. "The pathway grows longer" has no mechanism: only `stretches[0]` exists and nothing advances it. At twelve planes this rule would leave most doors sealed for good. It needs to be about what is *reachable* from what you've earned, through the pathways, not about direct set.mm dependencies.
- **Architecture.** Rule 9 mostly holds: hall, doors, threshold path, rings, timings and vault are all in `pipeline/cathedral.py`, deterministic and order-independent (tested; my order mutation was an equivalent one). The leaks are small but real (finding 15). The three schema locations agree: versions match in `pipeline/schema.py`, `core/schema.ts` and `docs/schemas/`, and there are JSON Schema tests in the pipeline and the Worker. Unreal could read the hall and threshold today, but not the previews.

### Functional

| Check | Result |
|---|---|
| `npm run check` | **Pass**: typecheck, lint, vitest 129, pytest 148, Worker 135, cathedral 96, secret scan, map e2e 14 |
| `npm run e2e` | **Pass**: 48 of 48 in 13 min (SwiftShader), including 15 cathedral desktop and 5 headset tests |
| After my fixes | Worker 136, cathedral 97, scanner tests 7. Cathedral e2e: 15 desktop + 6 headset pass. The map app's plane e2e: 8 pass. |
| Core loop on desktop, Worker mocked | Works end to end: gate, threshold (27 s, no skip on a first visit), cathedral, number theory, road, sieve (25 standing from any order), Trurl caption, verdict earns `1arith`, Algebra lights, leave, reload, resume at the same place, threshold skippable on return. Broken only by findings 1, 2, 7 and 17 (the first three fixed). |
| Forged and bad Worker requests | A client-chosen model, system prompt or token limit, unknown fields, places that don't fit together, empty, huge or 200-turn input, a bad origin, a missing, wrong or prefix secret, and a 31st request in a minute are all refused. An injection through `earned` got in (fixed). One gap remains by design: the client sends Trurl's earlier turns, so it can forge them. The verdict filter still caps what that can win at the current moment's own idea. |
| A verdict earning what it shouldn't | Filtered in the Worker to the moment's `earns`, minus what is already earned. The client trusts its Worker and does not filter again. |
| Offline then sync; two devices | Union merge, commutative, associative and idempotent (property tests). A failed sync keeps local progress and retries. The real KV concurrency limits are unverified (finding 6). |
| Secrets | None in the repo or `cathedral/dist`, and no provider name, host or key name in the client build (I grepped beyond the scanner). The app secret is typed once per device and kept in localStorage; it is never built in, never put in a URL, never on the page (tested). |
| Budgets | Threshold 12 calls / 6.7k triangles; arrival 11 / 6.8k; vault view 10 / 5.4k; road and plaza 17 / 10.7k. Far inside the budgets, though frame rate is unmeasured. |
| Test quality | Strong. Of 31 mutations of security, verdict, merge, door-state, flow and pipeline logic, 28 were caught. Two survivors were equivalent changes; one is a real gap (finding 18). No test was weakened. The miss that mattered was finding 1: the plaza test checked the state, not what is drawn. |

## 4. Screenshots

In `docs/review-cathedral/`, taken under SwiftShader at 1280×800 (headset ones in the IWSDK emulator).
Findings 1, 2 and 7 were fixed after these were taken, except where marked "after fix".

| File | What it shows |
|---|---|
| `01-threshold-drift-start.png` | Inside the Sierpinski tunnel: a dense swirl of 1 px lines, with the hall's doors already visible below |
| `02-threshold-drift-deep.png` | Deeper in: the rings narrow, still see-through to the hall |
| `03-threshold-mouth.png` | Out of the tunnel's mouth: the vault's first ring and the wall top; Trurl clipped at the edge |
| `04-threshold-descent.png` | The descent, looking forward at three flat arches on the wall |
| `05-threshold-descent-looking-down.png` | Looking down during the descent: a black void and the dais glow |
| `06-arrival-facing-foundations.png` | Arrival: the far wall (Foundations), three dim doors, Trurl beside you |
| `07-facing-discrete-left.png` | Turned left: the number theory door glowing, its pedestal and towers, and two sealed doors |
| `08-facing-structure-right.png` | Turned right: the Structure arc |
| `09-turned-around-entrance.png` | Turned around: Space and change, two sealed doors and one dim |
| `10-vault-overhead.png` | Looking up: twelve-sided rings recede to a point, the most mathematical view in the hall |
| `11-frontier-door-preview.png` | The number theory door from its stand, with prime blocks assembling |
| `12-preview-close.png` | The prime towers close up: pastel cubes, muted hues |
| `13-dim-door-sets.png` | A dim door (Sets) with its label |
| `14-sealed-door-topology.png` | A sealed door (Topology) with its label |
| `15-algebra-before.png` | Algebra and symmetry, sealed, before anything is earned |
| `16-road-arrive.png` | The road on arrival: draft caption on screen, and the cathedral's vault overhead (finding 7) |
| `17-road-focus-12.png` | Focusing a column: "11 is prime" |
| `18-trurl-ribbon-captions.png` | Trurl's caption after an explanation, with the ribbon beside the road |
| `19-plaza-after-fix.png` | The sieve plaza, after fix: the 99 columns are drawn again |
| `20-sieve-struck-after-fix.png` | After 2, 3, 5, 7: 25 standing, and the sieve note spells out the answer |
| `21-overlook.png` | The overlook: π(x) curves, panels of lights, the marker readout |
| `22-algebra-lit-after-earning.png` | After earning `1arith`, Algebra glows gold with a pedestal |
| `23-structure-arc-after-earning.png` | The Structure arc after earning |
| `24-headset-threshold.png` | Emulated Quest 3 in the threshold, vignette on, the hall visible below |
| `25-headset-cathedral.png` | Emulated Quest 3 on the dais |
| `26-headset-plane.png` | Emulated Quest 3 on the road: threads of light, and the vault overhead (finding 7) |
| `27-cathedral-after-leaving-vr-in-plane.png` | Finding 2 before the fix: "The cathedral" on screen, but you are inside the road |
| `28-map-app-plaza-for-comparison.png` | The same plaza in the map app, where it always rendered |

## 5. For your judgment in the headset

1. **The descent.** 13.5 m straight down at 1.2 m/s with the vignette at 0.7. Is it comfortable, and is it a crossing or a lift? Also whether seeing the hall through the tunnel spoils the arrival.
2. **72 fps** on the threshold (about 3,900 line segments), in the hall and on the road and plaza (chrome://inspect over USB).
3. **1 px lines** in the threshold and vault: shimmer and aliasing at Quest resolution.
4. **Scale:** a 24 m radius and a 14 m wall. Do the doors read, and does the hall feel vast?
5. **Speech:** microphone permission over HTTPS, push-to-talk on A, transcription of maths words, and the time from release to the first caption word (design: 1 to 1.5 s). Haiku's thinking may stretch it (finding 13). The xAI wire protocol is still unverified with a real key (plan D8).
6. **The headset panel** that follows your view with hints: helpful or intrusive?
7. **Arrival orientation in a plane.** In a headset the view is never turned (correct), so you face wherever you faced the door. Check that the road is findable.
8. **Trurl's place:** right and ahead at 0.6 m and 1.3 m. Does it crowd you, and is it ever behind something?
9. **Teleport and snap turn** on the hall floor and the plane ground; tall monoliths against honest stack height (the plane brief's open question).
10. **A real Worker:** whether the progress PUT is refused by KV's per-key write limit (finding 6), and whether real verdicts arrive at `max_tokens: 400`.

## 6. The three changes that would most improve the experience

1. **Make earning real.** While a moment is open, take its answer out of the caption. Open the sieve moment only once the visitor has struck the sieve through to its 25 survivors, and the road moment only after they have looked at a few stacks. Send Trurl what was done (which numbers were struck and in what order, what fell, which column is in view) and the plane's computed facts as grounding. Trurl can then ask "why did nothing fall after 7?" and judge the answer. This is the principle the project exists for, and it is mostly data that already exists.
2. **Make the map true and make it move.** Replace the hand-picked gates with ones derived from the pathways and the graph. A door is a frontier when its pathway's first landmark rests only on what you've earned or what lies before it on your own pathways; it is dim when it is one moment away. Drop the false `1arith` gate on Algebra. Then each earned idea visibly changes something, and dim doors mean "nearly yours". Junctions and the vault's threads of light can come later on the same rule.
3. **One art pass on the hall, built from rules.** Make light the material: emissive and translucent surfaces, with bloom. Draw the threshold and vault with real width (instanced ribbons or tubes, not 1 px lines). Give the floor a generated tiling (girih or Penrose) and the walls tracery, and the far wall an altar-like focus. Enclose the threshold so the hall stays hidden until its mouth. Bring the plane toward the same luminous look so that the sieve's survivors glow. All of it is computed in the pipeline and drawn as instanced geometry. Do this before the WebXR-versus-Unreal comparison, or the comparison will judge engines on a scene that neither makes beautiful.

## Commits in this review

| Commit | Fix |
|---|---|
| `85d3e6e` | Worker: earned ids must be set.mm labels (prompt injection) |
| `a4aac28` | Secret scan finds the client build from where it runs; fails clearly when it is missing |
| `d577d4c` | Leaving VR from inside the plane brings the hall back and keeps your place |
| `568e7d4` | Standing still in a plane no longer saves and syncs every 4 s |
| `be8c5d1` | The sieve plaza is drawn in the cathedral app |
| `1f7de1f` | The vault no longer hangs over the number theory plane |
