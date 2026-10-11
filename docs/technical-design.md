# Trurl Technical Design

**Status:** Draft for approval (revision 3)
**Date:** 2026-10-10
**Branch:** `prototype/tech-design`
**Stack:** IWSDK 1.0.1 + Vite + TypeScript, static hosting (GitHub Pages or Cloudflare Pages), one Cloudflare Worker

This document resolves the implementation unknowns before any app code. It builds on `docs/vision.md` and `docs/experience-design.md`; where they disagree with this file, they win. Headset-specific tests remain open items for Dalton.

**Changes in revision 3:** no Trurl voice in the prototype (captions instead); speech input uses Grok Voice Transcribe 2.0 instead of Deepgram.

**Changes in revision 2:** the app secret is never built into the client; schemas rewritten from the experience design and the existing pipeline; door states are computed, not stored; Trurl's persona and grounding move into the Worker; the speech chain streams; model pinned to `claude-haiku-5-5`.

## 1. Worker architecture

One Cloudflare Worker holds every API key as a secret. The static app never sees a provider key.

**Model:** `claude-haiku-5-5`, set by the Worker, never by the client.

### Endpoints

| Endpoint | Method | Purpose | Upstream |
| --- | --- | --- | --- |
| `/api/trurl` | POST | Trurl's reply, streamed | Claude Messages API (streaming) |
| `/api/stt` | WebSocket | Speech to text, streamed | Grok Voice Transcribe 2.0 (`wss://api.x.ai/v1/stt`) |
| `/api/progress` | GET / PUT | Read and write progress | Cloudflare KV |

The endpoint is `/api/trurl`, not a generic Claude proxy: the client cannot choose the model, the system prompt or the token limit.

### Authentication

The site is public, so anything in its build is public. The app secret is therefore **never** in the client build, an environment file the build reads, or the repo.

- The Worker expects `Authorization: Bearer <TRURL_APP_SECRET>`. The secret is a Worker secret (`wrangler secret put TRURL_APP_SECRET`).
- **On each device, the app asks for the secret once** on first launch (a single text field) and keeps it in `localStorage`. Without it, the cathedral still loads; Trurl and progress sync stay off. A "forget this device" action clears it.
- CORS is restricted to the production origin and `localhost` / the local-network dev origin.
- Per-endpoint rate limits in the Worker (for example 30 Trurl requests and 10 STT sessions per minute), so a leaked secret cannot drain credit quickly.
- **Spend limits as a backstop:** set a monthly spend limit in the Anthropic Console (for example $10) and in the xAI console.
- Rotating the secret means one `wrangler secret put` and re-entering it on each device.

Provider keys (`ANTHROPIC_API_KEY`, `XAI_API_KEY`) are added to outbound requests by the Worker and never returned.

## 2. Speech pipeline

### Recognition

**Confirmed absent** in the Meta Quest browser (Meta community reports; 2026 research that switched to an external Whisper-style service). External speech-to-text is required.

### Prototype decision: Trurl speaks in captions

For the prototype, **Trurl has no voice.** Its replies appear as captions floating beside the ribbon, streamed word by word as Claude writes them. Dalton still talks to Trurl by voice, because typing in a headset would undercut explaining ideas, which is how they are earned. On desktop, a text box works as well.

### Speech input: Grok Voice Transcribe 2.0

- Model `grok-voice-transcribe-2.0`, streaming over xAI's STT WebSocket, proxied by the Worker so the xAI key stays secret.
- About $0.20 per hour of streamed audio; interim results roughly every 500 ms. Use keyterm prompting for mathematical words (prime, sieve, composite, factor).
- Measure in the headset: time from releasing the button to the final transcript.

### Chain

1. Dalton holds a controller button (push-to-talk) and speaks; audio streams through `/api/stt`.
2. On release, the final transcript returns. The app sends it to `/api/trurl` with the context in section 4.
3. The Worker streams Claude's reply; captions appear word by word beside the ribbon, which animates while Trurl "talks".

**Expected time from releasing the button to the first caption word: about 1–1.5 s** (final transcript ~0.3–0.5 s, Claude first tokens ~0.5–0.8 s, network ~0.1 s). Measure on the headset.

### Later: Trurl's voice

Kept out of the prototype, designed so it slots in without rework, since replies already stream sentence by sentence:

- Each completed sentence goes to a text-to-speech endpoint (`/api/tts`) while Claude keeps writing; audio chunks play in order.
- Candidates: Grok TTS preset voices (Ara, Eve, Leo, Rex, Sal) and ElevenLabs; choose by ear.
- Robotic effect in Web Audio: band-pass filter → light ring modulation (~30–50 Hz) → mild wave shaper → gain.
- `speechSynthesis` on the Quest is unverified and too poor for a character; don't rely on it.
- A further option is the Grok Voice Agent API (speech in, speech out, under 700 ms), if latency becomes the problem; it would move Trurl's brain to Grok.

## 3. Progress persistence

- **Primary:** Cloudflare KV through `/api/progress`, one record under a fixed key for the single user. PC and headset share it.
- **Cache:** `localStorage` holds the last known progress so the cathedral loads instantly and works offline; it syncs to KV when online.
- **Conflicts:** earned ideas merge as a set union (they are never lost); for each pathway the most recent `updated_at` wins.
- KV's free tier is ample.

## 4. Data formats

Two kinds of data, kept separate:

- **World data**, built by the pipeline, static, versioned, identical for WebXR and Unreal: `graph.json`, the cathedral, pathways and planes. All layout lives in the pipeline (CLAUDE.md rule 9); the app only renders.
- **Player data**, written at runtime: progress only.

### Cathedral (`data/cathedral.json`, built by the pipeline)

Four arcs of three planes, as fixed in the experience design. Door positions are computed by the pipeline.

```json
{
  "schema_version": 1,
  "arcs": [
    { "id": "foundations", "name": "Foundations", "placement": "far-wall", "planes": ["logic", "sets", "infinity"] },
    { "id": "discrete", "name": "Discrete", "placement": "left", "planes": ["number-theory", "combinatorics", "graph-theory"] },
    { "id": "structure", "name": "Structure", "placement": "right", "planes": ["algebra-symmetry", "linear-algebra", "complex-numbers"] },
    { "id": "space-change", "name": "Space and change", "placement": "entrance", "planes": ["geometry", "topology", "calculus-analysis"] }
  ],
  "doors": [
    { "plane": "number-theory", "arc": "discrete", "pos": [0, 0, 0], "yaw": 0, "preview": "prime-stacks" }
  ]
}
```

There is exactly one door per plane, twelve in total. Doors carry **no state field**.

### Pathways (`data/pathways.json`, built by the pipeline)

A pathway is the ordered route behind a door. Its landmarks are real set.mm ids from `graph.json`; its moments are plane interactions where ideas are earned.

```json
{
  "schema_version": 2,
  "pathways": [
    {
      "plane": "number-theory",
      "gated_on": "df-prm",
      "entry_requires": [],
      "stretches": [
        {
          "id": "nt-1",
          "plane_data": "plane-number-theory.json",
          "landmarks": ["1arith", "infpn"],
          "moments": [
            { "id": "nt-1-sieve", "kind": "sieve", "earns": ["infpn"] }
          ]
        }
      ]
    }
  ]
}
```

- `entry_requires`: set.mm ids that must all be earned before the door can be a frontier door. **Derived by the pipeline, never written by hand:** the ideas on the map (the landmarks of any stretch) that `gated_on` truly rests on in set.mm. `gated_on` is the first landmark of a built pathway, or the idea an unbuilt pathway will reach if that idea truly rests on something on the map. `null` for both means no true gate exists yet (config says why) and the door is sealed. `pipeline/tests/test_gates.py` re-derives every gate from the raw set.mm text.
- `earns`: the set.mm ids a moment can grant when Dalton explains it to Trurl.
- Landmark ids above are illustrative; the pipeline chooses and validates the real ones (every id must exist in `graph.json`, and a test checks it).

### Plane data

Reuse the existing `plane-number-theory.json` exactly as `pipeline/plane_nt.py` writes it (`PLANE_SCHEMA_VERSION = 1` in `core/schema.ts`: road columns with factors and parts, prime colours, the sieve plaza, the overlook). Each future plane gets its own file and version in the same style.

### Progress (player data, KV + localStorage)

Progress stores only what Dalton has done. Nothing derivable is stored.

```json
{
  "schema_version": 1,
  "earned": ["infpn"],
  "pathways": {
    "number-theory": { "stretch": "nt-1", "resume": { "pos": [0, 0, 12.5], "yaw": 0 }, "updated_at": "2026-10-10T21:00:00Z" }
  },
  "updated_at": "2026-10-10T21:00:00Z"
}
```

### Door states are computed

A pure function in `core/` derives each door's state from `earned`, `pathways.json` and the dependency graph:

- **frontier:** every id in `entry_requires` is earned (a door with none starts as frontier; for the prototype, only number theory).
- **sealed** also for every door whose `entry_requires` is `null`: no idea on the map leads to it.
- **dim:** not a frontier, but every unmet requirement is itself one step from the earned set (its own dependencies are all earned).
- **sealed:** everything else.

Because states are computed, the saved progress and the mathematics can never disagree. The function has unit tests.

### Trurl request (client → Worker)

The client sends only facts about where Dalton is:

```json
{
  "schema_version": 1,
  "plane": "number-theory",
  "stretch": "nt-1",
  "moment": "nt-1-sieve",
  "landmark": "infpn",
  "looking_at": "door:number-theory",
  "earned": ["infpn"],
  "dialogue": [{ "role": "user", "text": "…" }, { "role": "trurl", "text": "…" }],
  "utterance": "why did nothing fall after seven?"
}
```

### Trurl in the Worker

The Worker builds the prompt; the client cannot change it.

- **System prompt:** Trurl's persona, tone and guardrails, taken from the Guide section of `docs/experience-design.md` (snarky, edgy, robotic, teasing but never cruel; never lectures; quiet until called; guards the frame against scores).
- **Grounding:** the Worker adds the verified statement, display form and reviewed note for the current `landmark` and `moment` from a bundled copy of the pipeline data. Trurl may only assert mathematics found there and says so when it doesn't know. Unreviewed notes are not used.
- **Judging understanding:** when a moment is active, Trurl's reply ends with a structured verdict the Worker parses (`{"earned": ["infpn"]}` or none). The client applies it to progress; the verdict is never spoken.
- Prompt caching on the system prompt keeps cost down.

All schemas live in `docs/schemas/` as JSON Schema files, with matching TypeScript types in `core/`.

## 5. What needs Dalton

1. **Anthropic Console:** create an API key, set a monthly spend limit (for example $15).
2. **Cloudflare account** (free): Worker, KV namespace, secrets, deploy.
3. **xAI** API key for speech input, with a spend limit.
4. **App secret:** generate a strong random `TRURL_APP_SECRET`; put it in the Worker and type it into each device once. Never commit it.
5. **Headset tests:** microphone permission over HTTPS, push-to-talk, transcription accuracy, time to the first caption word.
6. **GitHub:** enable Pages (or connect Cloudflare Pages) for the static build.

### Monthly cost (one user, ~5 hrs/week)

| Item | Estimate |
| --- | --- |
| Speech input (Grok Transcribe, ~1–2 hrs of talking) | under $1 |
| Claude Haiku (`claude-haiku-5-5`) | $1–3 |
| Cloudflare (Worker, KV, Pages) | $0 |
| **Total** | **about $1–4** |

Estimates assume Trurl is quiet until called, so actual talk time is a small part of time in the headset.

## Next steps after approval

1. Pipeline: `cathedral.json` and `pathways.json` builders with tests (every landmark id exists, twelve doors, layout deterministic).
2. `core/`: door-state function and progress merge, with tests.
3. Worker: the four endpoints, auth, rate limits, Trurl prompt and grounding.
4. App: IWSDK cathedral, threshold, door previews, number theory stretch, push-to-talk and streamed captions.
5. Headset verification of the full loop.

---

*Scaffold verification:* `npm create @iwsdk@latest` succeeded with Vite 7, TypeScript, the Quest 3 emulator config, and AGENTS.md / MCP tooling present. The dev server starts on HTTPS (mkcert) and exposes a network URL for Quest browser testing.
