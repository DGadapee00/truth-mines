# Cathedral Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the WebXR half of the cathedral prototype: threshold, twelve-door cathedral with computed door states, the number theory stretch, Trurl as streamed captions (push-to-talk plus a desktop text box), and progress that saves and resumes.

**Architecture:** The pipeline computes every layout (hall, doors, threshold, pathways) into `data/cathedral.json` and `data/pathways.json`. `core/` derives door states and merges progress, with no rendering. A Cloudflare Worker holds the provider keys, Trurl's prompt and its grounding. A new IWSDK app (`cathedral/`) only renders descriptors and talks to the Worker.

**Tech Stack:** Python 3.11+ (pipeline, pytest, jsonschema); TypeScript, vitest, Playwright; Cloudflare Worker (plain `fetch` handler, KV); IWSDK 1.0.1 (`@iwsdk/core`, which pins `three` to `super-three@0.181.0`) on Vite.

**Spec:** `docs/technical-design.md` (revision 3), `docs/experience-design.md`, `docs/vision.md`, `docs/plane-number-theory.md`, `CLAUDE.md`. Where a doc and this plan differ, the docs win.

## Global Constraints

- Branch `prototype/cathedral` from `prototype/tech-design`, with `plane/number-theory` merged in. Never touch or merge to `main`. Commit per working step; push the branch; **stop for review after each of the four steps**.
- CLAUDE.md rule 9: all layout is computed in the pipeline and exported; the app decides no geometry. Rule 10: no Python `hash()`; any randomness is seeded from SHA-256 of an id; output does not depend on input order. Rule 1: `core/` imports no three.js. Rule 3: curation only in `landmarks.yaml` and `config.yaml`; never hand-edit `data/`.
- Rule 4: instancing or batching only. Budgets: under 100 draw calls, under 500k triangles, `data/` payload under 2 MB (scene.json already exceeds it and is not loaded by the cathedral). Report frame-rate impact of rendering changes.
- Rule 6: no smooth locomotion, no camera motion the user did not start. Teleport and 30-degree snap turn only. The threshold is the one guided move; it starts only when the visitor presses Enter or the trigger, eases in and out, has a vignette, never rolls the horizon.
- Rule 8: every feature lands with desktop support and a test. No test is weakened, skipped or deleted.
- No secrets in the repo or the client build. `TRURL_APP_SECRET` is entered once per device and kept in `localStorage`. Provider keys exist only as Worker secrets (`ANTHROPIC_API_KEY`, `XAI_API_KEY`); tests use mocks and fake keys.
- Worker model is `claude-haiku-5-5`, fixed by the Worker. The client cannot choose model, system prompt or token limit. STT model `grok-voice-transcribe-2.0` at `wss://api.x.ai/v1/stt`.
- Rate limits (defaults): 30 Trurl requests and 10 STT sessions per minute. CORS: production origin plus `localhost` and local-network dev origins.
- Door states: frontier = every id in `entry_requires` earned; dim = not frontier, every unmet requirement has all its own graph dependencies earned; sealed = the rest. Never stored. Progress merge: earned is a set union; per pathway, latest `updated_at` wins.
- Twelve doors, one per plane; arcs fixed: Foundations (far wall) logic, sets, infinity; Discrete (left) number-theory, combinatorics, graph-theory; Structure (right) algebra-symmetry, linear-algebra, complex-numbers; Space and change (entrance) geometry, topology, calculus-analysis.
- Trurl has no voice in the prototype: captions only. Speech input is push-to-talk.
- Schemas live in `docs/schemas/*.schema.json` with matching types in `core/schema.ts`. `pipeline/schema.py` and `core/schema.ts` move together.
- Pipeline pytest takes about 4.5 minutes in full; new pipeline tests build from config and fixtures and stay under a few seconds.

## Decisions I am making where the docs are silent (review at each step)

| # | Decision | Why |
| --- | --- | --- |
| D1 (revised at the step 1 review) | The threshold is a level tunnel in the vault, over the entrance wall. The visitor drifts out of its mouth, turns down and **descends slowly onto a dais at the hall centre**, landing facing Foundations (the far wall) with Space and change behind. The descent is short and slow (13.5 m at 1.2 m/s, about 11 s) with a stronger vignette. The wall has twelve doors at 30-degree slots and no entrance opening. | Four arcs of three doors use all twelve slots, including 180 degrees, so a wall entrance has no free slot. The dais keeps the symmetry that divides by 2, 3, 4 and 6. |
| D2 | Stretch `nt-1` has landmarks `df-prm`, `1arith`. Moment `nt-1-road` earns `1arith`; `nt-1-sieve` earns `df-prm`. Other planes get curated `entry_requires` in `config.yaml`: logic, sets and infinity gate on one axiom each (dim at the start); algebra-symmetry gates on `1arith`; the rest gate on landmarks with many unmet dependencies (sealed). | The tech design says its ids are illustrative and the pipeline chooses. `1arith` is real: `dirith` rests on both `1arith` (number theory) and `ablfac` (algebra). Earning `1arith` lights algebra-symmetry. Gates for planes without a pathway yet are placeholders and are marked so in the config. |
| D3 | Under the literal door-state rule, "dim" is rare: a landmark usually has about ten direct dependencies, so a requirement is one step from earned only when it is a root (axiom or definition). I implement the rule as written and report it. | The docs bind the rule; the weakness is for you to judge once you see the hall. |
| D4 | The IWSDK app lives in `cathedral/` as its own package, importing `../core`. `app/` (the three.js mine and old plane) stays untouched. | IWSDK pins `super-three`; keeping it out of the root app avoids two three.js versions in one bundle. |
| D5 | The new app reuses `app/plane/{road,plaza,overlook,ground,labels}.ts` (pure three.js builders of the descriptors) through a Vite alias `three` to `super-three`, after a spike in Task 4.1. Fallback: copy the builders into `cathedral/src/plane/`. | Avoids rewriting the road, plaza and overlook. |
| D6 | STT WebSocket auth uses the `Sec-WebSocket-Protocol` subprotocol `bearer.<secret>`; browsers cannot set headers on WebSockets, and a query string leaks into logs. | Keeps three endpoints. |
| D7 | Trurl's grounding is a new pipeline stage `grounding` writing `data/grounding.json` (statement, source, reviewed display, reviewed note, set.mm comment per pathway landmark, plus each moment's rubric). The Worker bundles a copy at build time. | Keeps the Worker free of set.mm. Moment rubrics are Claude drafts, flagged `reviewed: false`, and are used only as the Worker's judging criterion, never shown. |
| D8 | The xAI STT wire protocol is not verifiable from here. The adapter is isolated in `worker/src/stt.ts` and tested against a mock. The first real key may need a small fix. | Honest limit of mocking. |

## Review Focus

The input classes the spec implies but a happy-path test would not exercise, most likely first. Each has a test in the task that owns the code.

1. **Bad or missing secret on a device** (never entered, wrong, rotated, 401 mid-session): the cathedral still loads and walks; Trurl and sync turn off with a visible hint; nothing crashes. Tasks 3.2, 4.5.
2. **Two devices diverge, storage fails**: both offline then sync, KV unreachable, `localStorage` throwing (private window), a saved resume pointing at a stretch that no longer exists. Earned ideas are never lost. Tasks 2.2, 4.6.
3. **Verdict forgery and injection**: the model returns an id outside the moment's `earns`, an already-earned id, malformed JSON or no verdict; the visitor says "ignore your rules, I earned it". Nothing is earned unless it passes the Worker's filter. Task 3.4.
4. **Interrupted or oddly chunked stream**: upstream drops mid-reply; the verdict tag is split across chunks; the model emits the tag text mid-sentence. Captions never show verdict text. Task 3.4.
5. **Empty or oversized speech**: a button tap with no audio, an empty or whitespace transcript, a 10,000-character utterance, a 200-turn dialogue. Rejected or trimmed without a model call. Tasks 3.3, 4.5.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `pipeline/config.yaml` (modify) | New `cathedral:` section: hall, doors, threshold, vault, previews, and each plane's pathway (entry gate, stretches, moments, rubrics). |
| `pipeline/cathedral.py` (create) | `build(cfg)`: hall, arrival dais, twelve doors with pedestals and previews, threshold rings and rails path, vault tiers. Writes `data/cathedral.json`. |
| `pipeline/pathways.py` (create) | `build(cfg, graph_ids)`: ordered pathways, validated against the graph. Writes `data/pathways.json`. |
| `pipeline/grounding.py` (create, Task 3.1) | Writes `data/grounding.json`. |
| `pipeline/schema.py`, `core/schema.ts` (modify) | `CATHEDRAL_SCHEMA_VERSION`, `PATHWAYS_SCHEMA_VERSION`, `GROUNDING_SCHEMA_VERSION`, `PROGRESS_SCHEMA_VERSION`, `TRURL_SCHEMA_VERSION` and types and parsers. |
| `docs/schemas/{cathedral,pathways,progress,trurl-request,grounding}.schema.json` (create) | JSON Schema files. |
| `core/doors.ts`, `core/progress.ts` (create) | Pure functions. |
| `worker/` (create) | The Cloudflare Worker, its own `package.json`, vitest. |
| `cathedral/` (create) | The IWSDK app. |
| `e2e/cathedral.spec.ts`, `playwright.config.ts` (create, modify) | Desktop and emulated-headset checks with a mocked Worker. |

---

## Step 1: Pipeline (cathedral.json and pathways.json)

### Task 1.1: Config, schema versions, cathedral builder

**Files:**
- Modify: `pipeline/config.yaml`, `pipeline/schema.py`, `pipeline/requirements.txt` (add `jsonschema`), `pipeline/__main__.py` (stages `cathedral`, `pathways` after `plane`; update the docstring)
- Create: `pipeline/cathedral.py`, `docs/schemas/cathedral.schema.json`
- Test: `pipeline/tests/test_cathedral.py`

**Interfaces:**
- Produces: `cathedral.build(cfg: dict) -> dict` where `cfg = config()["cathedral"]`; output keys `schema_version, conventions, arcs, hall, arrival, doors, threshold, vault`. `doors[i] = {plane, name, arc, slot (0..11), bearing_deg, pos [x,y,z], yaw, pedestal {pos, radius, height}, preview {id, params}}`. `arrival = {pos, yaw, dais_radius}`. `threshold = {motif, rings:[{k, scale, rotation, radius, z}], path:[[x,y,z]...], speed, duration_s}`. `vault = {tiers:[{radius, y, sides, rotation}]}`. All numbers in metres, +Y up, yaw about +Y, heading(yaw) = (sin yaw, 0, cos yaw), as in `plane_nt.py`.

- [ ] **Step 1: Write failing tests** in `test_cathedral.py`, all on `build(config()["cathedral"])`:
  `test_twelve_doors_one_per_plane`; `test_arcs_hold_the_planes_the_experience_design_names` (exact plane ids per arc); `test_doors_stand_30_degrees_apart_from_the_far_wall` (slot k at bearing 30k from +Z, far-wall arc centred on 0, left arc on +90 meaning +X, right on -90, entrance arc on 180); `test_hall_is_symmetric` (mirroring about the Z axis maps each left door to a right door; rotating 90 degrees maps arc slots to arc slots); `test_doors_face_the_centre` (heading(yaw) points from `pos` at the origin within 1e-6); `test_threshold_lasts_20_to_30_seconds` (`duration_s == path length / speed`); `test_threshold_rings_shrink_by_a_constant_ratio` (each `scale` is the previous times the config ratio, within 1e-9) and `test_threshold_path_ends_at_the_arrival_dais`; `test_prime_stack_preview_matches_trial_division` (each stack's blocks equal the factorization found by trial division, smallest at the bottom); `test_build_is_byte_identical_and_order_independent` (build twice, then with `planes` shuffled in the config; `json.dumps(sort_keys=True)` equal); `test_output_validates_against_schema` (jsonschema).
- [ ] **Step 2: Run** `python3 -m pytest -q pipeline/tests/test_cathedral.py`. Expect FAIL: module missing.
- [ ] **Step 3: Add `cathedral:` to `config.yaml`**: `hall {radius: 24, wall_height: 14, door {width: 3.6, height: 6.5}, pedestal_inset: 5}`, `arrival {dais_radius: 2.2}`, `threshold {motif: sierpinski, motif_depth: 3, rings: 48, scale_ratio: 0.9, rotation_deg: 7.5, length: 40, speed: 1.6, ascent: 6}`, `vault {tiers: 7, ratio: 0.618, sides: 12}`, `planes:` twelve entries each with `id, name, arc, preview`. Arc placement lives in `arcs:` with `centre_deg`. Previews: `prime-stacks` (number-theory), `limit-curve` (calculus-analysis), `torus-cup` (topology), others `ring-motif`; `prime-stacks.params.numbers: [2..30]` computed by `numtheory.factorize`.
- [ ] **Step 4: Implement `build`** in `cathedral.py` (sort planes by id before layout so input order cannot matter; slots come from the arc table, not list order; reuse `pt`, `heading`, `RA`, `R2` from `plane_nt.py`). Threshold path: level along +Z in the vault, a quarter-circle turn, then straight down onto the dais, as two segments (`drift`, `descent`) each with a speed and vignette; write `run()`.
- [ ] **Step 5: Write `docs/schemas/cathedral.schema.json`** and `CATHEDRAL_SCHEMA_VERSION = 1` in `schema.py`; add `jsonschema` to requirements.
- [ ] **Step 6: Run** the new tests. Expect all PASS. Then run `python3 -m pipeline cathedral`; expect `data/cathedral.json`.
- [ ] **Step 7: Commit** `pipeline: cathedral.json builder (hall, twelve doors, threshold, vault)`.

### Task 1.2: Pathways builder

**Files:**
- Modify: `pipeline/config.yaml` (`cathedral.pathways`), `pipeline/__main__.py`
- Create: `pipeline/pathways.py`, `docs/schemas/pathways.schema.json`
- Test: `pipeline/tests/test_pathways.py`

**Interfaces:**
- Consumes: `cathedral.build` plane ids; `data/graph.json` node ids (read through `read_stage("export")`'s source, same as `scene.py` does).
- Produces: `pathways.build(cfg: dict, graph_ids: set[str], plane_ids: list[str]) -> dict`: `{schema_version, pathways:[{plane, entry_requires, stretches:[{id, plane_data, landmarks, moments:[{id, kind, earns}]}]}]}`, one pathway per plane, sorted by plane id. Planes with no stretch have `stretches: []`. Raises `SystemExit` naming the id on any unknown id.

- [ ] **Step 1: Write failing tests**: `test_every_plane_has_exactly_one_pathway`; `test_unknown_landmark_id_fails_the_build` (fixture ids missing one, expect `SystemExit` naming it) and the same for `entry_requires` and `earns`; `test_earns_are_landmarks_of_their_stretch`; `test_only_number_theory_has_no_entry_requirement` (prototype invariant); `test_nt_stretch_points_at_the_plane_file_and_its_plane` (`plane_data == "plane-number-theory.json"`, the file's `plane` field matches); `test_ids_unique_across_pathways` (stretch and moment ids); `test_output_validates_against_schema`; `test_pathways_are_deterministic_and_order_independent`.
- [ ] **Step 2: Run**; expect FAIL.
- [ ] **Step 3: Implement** `pathways.build` and `run()`; add the pathway curation to `config.yaml` per D2, with a comment on each placeholder gate, and the moment `rubric` text (one sentence of what a good explanation says; drafts).
- [ ] **Step 4: Run** the tests; PASS. Run `python3 -m pipeline cathedral pathways`; confirm every id exists in the real `data/graph.json`.
- [ ] **Step 5: Mirror in TypeScript**: `core/schema.ts` gains `CATHEDRAL_SCHEMA_VERSION`, `PATHWAYS_SCHEMA_VERSION`, interfaces, `parseCathedral`, `parsePathways` (throw `SchemaError`); extend `core/tests/data.test.ts` with: every pathway id exists in `graph.json`; both files parse; twelve doors.
- [ ] **Step 6: Run** `npm run typecheck && npm run lint && npm test && python3 -m pytest -q pipeline/tests/test_cathedral.py pipeline/tests/test_pathways.py`; PASS.
- [ ] **Step 7: Commit** `pipeline: pathways.json builder validated against the graph`, update `pipeline/README.md` (two stage rows), push, **stop and summarise for review** (including D1, D2, D3).

---

## Step 2: core/ (door states and progress merge)

### Task 2.1: Door-state function

**Files:**
- Create: `core/doors.ts`
- Test: `core/tests/doors.test.ts`

**Interfaces:**
- Consumes: `CathedralFile`, `PathwaysFile`, `GraphFile` from `core/schema.ts`.
- Produces: `type DoorState = 'frontier' | 'dim' | 'sealed'`; `doorStates(earned: Iterable<string>, cathedral: CathedralFile, pathways: PathwaysFile, graph: GraphFile): Record<string, DoorState>`, keyed by plane id for all twelve doors. Throws `SchemaError` if an `entry_requires` id is not in the graph or a door has no pathway.

- [ ] **Step 1: Write failing tests** on a small hand-made graph: `no requirements is frontier`; `all requirements earned is frontier`; `an unmet root requirement is dim` (its deps are empty); `an unmet requirement whose deps are all earned is dim`; `an unmet requirement with an unearned dependency is sealed`; `one dim requirement and one sealed requirement is sealed` (every unmet one must qualify); `earning more never makes a door sink` (monotone: states only move sealed to dim to frontier, over random earned supersets with a fixed seed); `earned ids unknown to the graph are ignored`; `unknown entry_requires id throws`; and on real data (`data/*.json`): `empty progress lights exactly number-theory`, `earning 1arith lights algebra-symmetry`, `all twelve planes get a state`.
- [ ] **Step 2: Run** `npx vitest run core/tests/doors.test.ts`; FAIL.
- [ ] **Step 3: Implement `doorStates`** in `core/doors.ts` (direct `deps` from `graph.json`, as the docs say).
- [ ] **Step 4: Run**; PASS. **Commit** `core: door states computed from earned ideas`.

### Task 2.2: Progress type, parse, earn, resume, merge

**Files:**
- Modify: `core/schema.ts` (`PROGRESS_SCHEMA_VERSION = 1`, `Progress`, `PathwayProgress`, `Resume`)
- Create: `core/progress.ts`, `docs/schemas/progress.schema.json`
- Test: `core/tests/progress.test.ts`

**Interfaces:**
- Produces: `emptyProgress(): Progress` (`updated_at` `"1970-01-01T00:00:00Z"`); `parseProgress(raw: unknown): Progress` (throws `SchemaError`; sorts and dedupes `earned`); `earn(p: Progress, ids: string[], now: string): Progress`; `setResume(p: Progress, plane: string, stretch: string, resume: {pos: Vec3; yaw: number}, now: string): Progress`; `mergeProgress(a: Progress, b: Progress): Progress`; `validResume(p: Progress, pathways: PathwaysFile, plane: string): {stretch: string; resume: Resume} | null` (null when the stretch no longer exists). All pure; inputs are not mutated.

- [ ] **Step 1: Write failing tests**: `merge is commutative, associative and idempotent` (property test over generated progress with a seeded generator); `merge keeps every earned id from both`; `per pathway the later updated_at wins and a tie breaks the same way both ways`; `merged updated_at is the maximum`; `parse rejects a wrong schema_version, a non-array earned and a malformed resume`; `parse sorts and dedupes earned`; `earn is idempotent and keeps order sorted`; `inputs are not mutated`; `validResume returns null for a stretch that is not in pathways` (Review Focus 2); `progress validates against docs/schemas/progress.schema.json` (add `ajv` as a root devDependency for this and for Task 1 data checks).
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement.** **Step 4: Run**; PASS.
- [ ] **Step 5: Run** `npm run check`; PASS. **Commit** `core: progress parse, earn, resume and merge`, push, **stop and summarise for review**.

---

## Step 3: Worker

All under `worker/`; its tests run with vitest in Node against `fetch(request, env)` with a fake `env` (Map-backed KV) and a stubbed `globalThis.fetch` and WebSocket upstream. `worker/` may import `../core` (rule 1 only forbids the reverse).

### Task 3.1: Scaffold, grounding stage, auth, CORS, rate limits

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.toml` (KV binding, `ALLOWED_ORIGINS` var, **no secrets**), `worker/src/{index,auth,cors,ratelimit,env}.ts`, `pipeline/grounding.py`, `docs/schemas/grounding.schema.json`
- Modify: root `package.json` (`test:worker`, added to `check`), `pipeline/__main__.py`
- Test: `worker/test/{auth,cors,ratelimit}.test.ts`, `pipeline/tests/test_grounding.py`

**Interfaces:**
- Produces: `interface Env { PROGRESS: KVNamespace; TRURL_APP_SECRET: string; ANTHROPIC_API_KEY: string; XAI_API_KEY: string; ALLOWED_ORIGINS: string }`; `authorize(req: Request, env: Env): boolean` (constant-time compare; reads `Authorization: Bearer` or a `bearer.<secret>` subprotocol); `corsHeaders(req: Request, env: Env): Headers | null` (null when the origin is not allowed); `rateLimit(env: Env, key: string, limit: number, windowS: number): Promise<boolean>` (KV fixed window, best effort); `export default { fetch(req: Request, env: Env): Promise<Response> }`.
- Grounding: `data/grounding.json = {schema_version, landmarks: {id: {statement, source, comment, display?, note?}}, moments: {id: {plane, stretch, landmarks, earns, rubric}}}`. `display` and `note` appear only when `reviewed: true`.

- [ ] **Step 1: Write failing tests**: `missing, malformed and wrong bearer give 401 with no body detail`; `right bearer passes`; `compare does not short-circuit on the first differing byte` (call with equal-length wrong secret differing at index 0 and at the last index; both 401); `an unlisted origin gets no CORS headers and OPTIONS is refused`; `localhost and 192.168.x origins are allowed`; `the 31st /api/trurl request in a minute gets 429 with Retry-After` and `the 11th STT session`; `windows reset`; `unknown path gets 404 only after auth`. Grounding: `unreviewed display and note are absent`; `every moment id and landmark exists in pathways and graph`; `output validates against schema`.
- [ ] **Step 2: Run**; FAIL. **Step 3: Implement** each module and `grounding.py` (reads `graph.json`, `pathways.json`, `content/` reviewed notes via the existing export logic). **Step 4: Run**; PASS.
- [ ] **Step 5: Commit** `worker: scaffold, auth, CORS, rate limits; pipeline: grounding stage`.

### Task 3.2: Progress endpoint

**Files:** Create `worker/src/progress.ts`; Test `worker/test/progress.test.ts`.
**Interfaces:** `handleProgress(req: Request, env: Env): Promise<Response>`: GET returns the stored `Progress` (empty if none); PUT validates with `parseProgress`, merges with the stored value through `mergeProgress`, stores and returns the merged result. KV key is the constant `progress`.

- [ ] **Step 1: Failing tests**: `GET with nothing stored returns empty progress`; `PUT then GET round-trips`; `PUT merges: two devices' earned ids both survive`; `PUT with an older pathway timestamp does not overwrite a newer one`; `PUT of invalid JSON or wrong schema_version gives 400`; `body over 16 KB gives 413`; `KV failure gives 503 and does not echo internals` (Review Focus 2).
- [ ] **Steps 2-4:** run to fail, implement, run to pass. **Step 5: Commit** `worker: progress endpoint with merge`.

### Task 3.3: Trurl request validation and prompt

**Files:** Create `worker/src/{prompt,request}.ts`, `docs/schemas/trurl-request.schema.json`; modify `core/schema.ts` (`TRURL_SCHEMA_VERSION`, `TrurlRequest`, `parseTrurlRequest`); Test `worker/test/{request,prompt}.test.ts`.
**Interfaces:** `parseTrurlRequest(raw: unknown, grounding: Grounding): TrurlRequest` (throws `RequestError` with an HTTP status; rejects unknown fields including `model`, `system` and `max_tokens`; `plane`, `stretch`, `moment`, `landmark` must exist in grounding; `utterance` is trimmed, 1 to 600 characters; `dialogue` at most 12 turns of at most 600 characters, older turns dropped); `buildSystem(req: TrurlRequest, grounding: Grounding): {persona: string; grounding: string}` (two system blocks, persona first with `cache_control: {type: 'ephemeral'}`).

- [ ] **Step 1: Failing tests**: `a client-supplied model, system or max_tokens is rejected`; `unknown plane, moment or landmark gives 400`; `empty or whitespace utterance gives 400 and makes no model call`; `a 10,000-character utterance is rejected`; `a 200-turn dialogue is cut to the latest 12`; `the system text contains the verified statement and set.mm comment for the current landmark`; `it contains a reviewed note and display form when reviewed, and neither when not`; `it tells Trurl to say it does not know when the grounding is silent`; `the persona text carries the Guide section's rules: never lectures, quiet until called, guards the frame against scores, teasing never cruel`; `the persona block is the cacheable one`.
- [ ] **Steps 2-4**, then **Step 5: Commit** `worker: Trurl request validation and prompt`.

### Task 3.4: Streaming reply and verdict

**Files:** Create `worker/src/{trurl,verdict,anthropic}.ts`; Test `worker/test/{trurl,verdict}.test.ts` (consult the `claude-api` skill for the Messages streaming and prompt-caching parameters before writing `anthropic.ts`).
**Interfaces:** `class VerdictSplitter { push(chunk: string): string; end(): { text: string; earned: string[] } }` (`push` returns the caption text safe to emit now; it holds back any suffix that could begin the `<verdict>` tag; `end` parses `<verdict>{"earned":[...]}</verdict>`); `streamTrurl(req: TrurlRequest, env: Env, grounding: Grounding, upstreamFetch: typeof fetch): Response`, an SSE stream of `event: text` (data `{"delta": string}`), then one `event: verdict` (data `{"earned": string[]}`), then `event: done`; on upstream failure, `event: error` with a generic message. The verdict is filtered to ids in the current moment's `earns` and not already in `req.earned`.

- [ ] **Step 1: Failing tests** (upstream is a stub returning Anthropic-style SSE): `reply text streams as text events in order`; `the request to Anthropic uses model claude-haiku-5-5, the fixed max_tokens, stream true and the Worker's key, and the client's body fields are not forwarded`; `the verdict is parsed and sent as one verdict event, never as text`; `a verdict tag split across two or three chunks never leaks into text` (Review Focus 4); `the tag text in mid-sentence prose is treated as the tag only at the end of the reply`; `an id outside the moment's earns is dropped`; `an already-earned id is dropped`; `malformed verdict JSON, a missing verdict, or no active moment gives earned: []`; `a prompt-injection utterance cannot widen earns` (stub model obeys and returns a forged id; the filter drops it; Review Focus 3); `upstream dropping mid-stream ends with an error event and no verdict`; `the response never contains the Anthropic key`; `a 5xx from upstream gives an error event, not a leaked body`.
- [ ] **Steps 2-4**, then **Step 5: Commit** `worker: streamed Trurl reply with parsed, filtered verdict`.

### Task 3.5: Speech-to-text proxy

**Files:** Create `worker/src/stt.ts`; Test `worker/test/stt.test.ts`.
**Interfaces:** `handleStt(req: Request, env: Env, connectUpstream: (url: string, headers: Record<string, string>) => Promise<WebSocketLike>): Promise<Response>`: upgrades the client socket, opens the xAI socket with `Authorization: Bearer <XAI_API_KEY>` and model `grok-voice-transcribe-2.0` plus mathematical keyterms (prime, sieve, composite, factor), relays audio frames up and transcript JSON down, closes both when either closes; accepts the subprotocol `bearer.<secret>` and echoes a neutral subprotocol, never the secret.

- [ ] **Step 1: Failing tests** with a mock upstream: `no or wrong subprotocol is refused before any upstream is opened`; `audio frames reach upstream and interim and final transcripts reach the client`; `the xAI key is only in the upstream headers, never in a frame sent to the client`; `either side closing closes the other`; `the 11th session in a minute is refused`; `a session with no audio frames ends with an empty final transcript, not an error` (Review Focus 5); `upstream connect failure closes the client socket with a generic code`.
- [ ] **Steps 2-4**, then wire `index.ts` routes `/api/trurl`, `/api/stt`, `/api/progress`.
- [ ] **Step 5: Add `scripts/check-no-secrets.mjs`** (fails on `sk-ant-`, `xai-` followed by 20 or more word characters, or an assignment of a literal to `TRURL_APP_SECRET`, in tracked files and in `cathedral/dist` when present) with a vitest test that feeds it a planted fake key and a clean tree; add to `check`.
- [ ] **Step 6: Run** `npm run check`; PASS. **Commit** `worker: STT proxy, routes, secret scan`, push, **stop and summarise for review** (include D6, D7, D8; list the exact steps you need to do: keys, KV id).

---

## Step 4: The IWSDK app

### Task 4.1: Scaffold and spike

**Files:** Create `cathedral/` (package, `vite.config.ts`, `index.html`, `src/index.ts`); modify root `package.json` (scripts), `.gitignore`.

- [ ] **Step 1:** Scaffold with `npx @iwsdk/create` (non-interactive flags if available; otherwise copy the structure from the generated output into `cathedral/`). Read the generated `AGENTS.md` and the `@iwsdk/cli` MCP tooling docs and record how to start the dev server and the MCP in `cathedral/README.md`.
- [ ] **Step 2: Spike the three.js alias.** Import `buildRoad` from `../app/plane/road.ts` under `resolve.alias: { three: 'super-three' }`; run `vite build`; check the bundle holds one copy of three. If it does not work in under an hour, use the fallback in D5.
- [ ] **Step 3: Verify locomotion settings.** Enable teleport and snap turn at 30 degrees; confirm slide locomotion is off. Test `locomotion config disallows smooth movement` in vitest by reading the world's configured options.
- [ ] **Step 4: Commit** `cathedral: IWSDK scaffold and alias spike`.

### Task 4.2: Flow, secret and device storage (no rendering)

**Files:** Create `cathedral/src/{flow,secret,storage}.ts`; Test `cathedral/src/*.test.ts` (add `cathedral/src` to vitest `include`).
**Interfaces:** `type Phase = 'secret' | 'ready' | 'threshold' | 'cathedral' | 'plane'`; `createFlow(): { phase(): Phase; on(event: 'enter' | 'arrived' | 'door' | 'exit'): void; subscribe(fn: (p: Phase) => void): () => void }`; `secret.get(): string | null`, `secret.set(v: string)`, `secret.forget()` wrapping `localStorage` in try/catch (returns `null`, never throws, when storage is blocked); `storage.read(): Progress | null` and `storage.write(p: Progress): void` with the same guard.

- [ ] **Step 1: Failing tests**: `the flow runs ready, threshold, cathedral, plane and back to cathedral`; `without a secret the flow still reaches the cathedral`; `forget clears the secret`; `blocked localStorage does not throw and reads as empty` (Review Focus 2).
- [ ] **Steps 2-4**, **Step 5: Commit** `cathedral: flow, secret and storage guards`.

### Task 4.3: Threshold and cathedral from descriptors

**Files:** Create `cathedral/src/{load,threshold,hall,doors,preview,vault}.ts`; Test `cathedral/src/doors.test.ts`, `e2e/cathedral.spec.ts` (first part).
**Interfaces:** `shouldSkipThreshold(seen: boolean): boolean`; `loadWorld(base: string): Promise<{cathedral: CathedralFile; pathways: PathwaysFile; graph: GraphFile}>` (parsers from `core/schema.ts`); `doorLook(state: DoorState): {glow: number; opacity: number; pedestal: boolean}` (pure: frontier glowing with pedestal, dim visible without glow, sealed faint); `buildHall(c: CathedralFile): Object3D`, `buildDoors(c: CathedralFile, states: Record<string, DoorState>): { object: Object3D; setStates(s: Record<string, DoorState>): void }` (one `InstancedMesh` for all twelve doors; per-instance colour carries the state), `buildThreshold(c: CathedralFile): { object: Object3D; path: Vec3[]; duration: number }`.

- [ ] **Step 0 (added at the step 2 review): skipping the threshold on a return visit.** The first visit always plays the threshold in full. On a return visit a button or trigger press during the drift fades straight to the dais. `thresholdSeen` is a per-device flag in `localStorage` (set when the threshold first completes; a blocked store reads as "not seen", so the threshold plays), so a new device plays it once. Tests: `first visit has no skip and plays in full`; `a return visit skips on a press and lands on the dais pose facing Foundations`; `skipping fades rather than cuts (a fade of at least ease_s, no camera motion beyond the fade)`; `a blocked localStorage plays the full threshold`. A skip is user-started, so rule 6 holds.
- [ ] **Step 1: Failing tests**: `doorLook gives frontier more glow than dim and dim more than sealed`; `only frontier doors show a pedestal`; `the hall draws in under 20 calls` and `triangles under 500k` (e2e, reading `renderer.info`); `twelve door instances at the descriptor positions`; `threshold motion eases in and out and keeps pitch and roll at zero` (sample the path function at 0, 0.05, 0.5, 0.95, 1).
- [ ] **Steps 2-4:** implement; the threshold move runs along `path` over `duration` with ease-in-out and a vignette, started only by the visitor's Enter or trigger (rule 6). Instanced rings from `threshold.rings`.
- [ ] **Step 5: Screenshots** of threshold, hall and doors to `e2e/output/`; report draw calls, triangles and emulator frame time. **Commit** `cathedral: threshold, hall and twelve doors from descriptors`.

### Task 4.4: Number theory stretch

**Files:** Create `cathedral/src/plane/nt.ts` (wraps the reused builders); modify `flow` wiring; Test `e2e/cathedral.spec.ts` (second part).
**Interfaces:** `enterPlane(plane: string, stretch: string, resume: Resume | null): void`, `exitPlane(): Resume` (current pose), reading `plane-number-theory.json` named by the stretch's `plane_data`.

- [ ] **Step 1: Failing e2e**: `choosing the number theory door loads the road, the plaza and the overlook`; `striking 2, 3, 5, 7 leaves 25 standing` (reusing `core/sieve.ts`); `exit returns to the cathedral at the same door`; `a door that is not frontier cannot be entered`; `the plane stays within the draw-call and triangle budgets`.
- [ ] **Step 2-4:** implement with the reused builders and IWSDK teleport (doors and plane stops are teleport targets from the descriptor `stops`). **Step 5: Commit** `cathedral: number theory stretch`.

### Task 4.5: Trurl captions, push-to-talk, text box

**Files:** Create `cathedral/src/trurl/{client,sse,ptt,captions,ribbon,secretPrompt}.ts`; Test `cathedral/src/trurl/*.test.ts`, `e2e/cathedral.spec.ts` (third part, Worker mocked with Playwright `page.route`).
**Interfaces:** `parseSse(chunks: AsyncIterable<Uint8Array>): AsyncIterable<{event: string; data: unknown}>`; `askTrurl(req: TrurlRequest, signal: AbortSignal): AsyncIterable<{type: 'text'; delta: string} | {type: 'verdict'; earned: string[]} | {type: 'error'}>`; `pushToTalk(onFinal: (text: string) => void): { start(): void; stop(): void }` (microphone to `/api/stt`); `Captions.append(delta: string)` shown as a UIKit panel beside the ribbon; desktop DOM text box calling `askTrurl` directly. The secret field is a plain DOM input on the 2D page shown before entering VR.

- [ ] **Step 1: Failing tests**: `parseSse handles an event split across chunks`; `text events append to captions in order and the verdict never appears in captions`; `no secret means no Trurl calls and a visible hint, and the cathedral still works` (Review Focus 1); `a 401 turns Trurl and sync off, shows the hint, and does not retry in a loop`; `an empty transcript sends nothing` and `a tap with no audio sends nothing` (Review Focus 5); `a verdict with earned ids calls earn and saves progress`; `an error event leaves a short in-world caption and no crash`; the ribbon animates while tokens arrive and rests when done (state test, not pixels). Context sent matches the request schema: plane, stretch, moment, landmark, `looking_at`, `earned`, dialogue, utterance.
- [ ] **Steps 2-4**, **Step 5: Commit** `cathedral: Trurl captions, push-to-talk and text box`.

### Task 4.6: Progress save and resume, and the full loop

**Files:** Create `cathedral/src/progress/store.ts`; Test `cathedral/src/progress/store.test.ts`, `e2e/cathedral.spec.ts` (fourth part).
**Interfaces:** `createStore(deps: {api: ProgressApi | null; storage: typeof storage; now(): string}): { get(): Progress; earn(ids: string[]): void; resume(plane: string, stretch: string, r: Resume): void; sync(): Promise<void>; subscribe(fn: (p: Progress) => void): () => void }`. Reads local cache at start, merges the Worker's copy when reachable, writes both, using `mergeProgress` and `validResume` from `core/`.

- [ ] **Step 1: Failing tests**: `loads from the local cache at once and works offline`; `sync merges the remote progress and writes it back`; `a failed sync keeps local progress and retries on the next change`; `two stores with different earned sets converge to the union` (Review Focus 2); `a saved resume for a removed stretch falls back to the start of the pathway`; `earning an idea changes the computed door states` (uses `doorStates`).
- [ ] **Step 2-4:** implement. **Step 5 (e2e, full loop with mocked Worker):** enter the secret, press Enter, arrive, see one frontier door, enter number theory, say a sentence through the text box, receive a streamed caption and a verdict earning `1arith`, return to the cathedral, algebra-symmetry now glows, reload the page, and the progress, the lit door and the resume position persist; also `forget this device` clears the secret.
- [ ] **Step 6: Run** `npm run check` and `npm run e2e`; PASS. Run `scripts/check-no-secrets.mjs` against `cathedral/dist`. Update `README.md` and `CLAUDE.md` with the cathedral, worker and run commands. **Commit** `cathedral: progress save and resume; full loop`, push, **stop and summarise for review** with measured draw calls, triangles and emulator frame time, and the list of headset tests that remain for you.

---

## Self-review

- **Coverage:** Next-steps 1 to 4 map to Steps 1 to 4. Door twelve and arcs, determinism, schemas in `docs/schemas/`, auth never built in, rate limits, CORS, fixed model, grounding with reviewed-only notes, verdict, captions only, push-to-talk plus desktop text box, per-pathway resume, set-union merge, and the Tech Design's door-state rule each have a task and a test. Headset verification (Next step 5) stays with Dalton and is listed at Step 4's stop.
- **Types:** `Progress`, `Resume`, `DoorState`, `TrurlRequest`, `Env`, `Grounding`, `VerdictSplitter` are defined once (Tasks 2.1, 2.2, 3.1, 3.3, 3.4) and used under the same names later.
- **Open risks:** D1 and D2 are layout and curation calls; D3 the dim-state weakness; D5 the three.js alias; D8 the unverified xAI wire format; the verdict format is a prompt contract with a model I cannot call from here, so the real-key run may need prompt tuning.
