# The cathedral (IWSDK app)

The WebXR prototype of the Truth Mines: a threshold you drift down, a round cathedral with twelve
doors, the number theory stretch behind one of them, and Trurl, a voice you talk to (captions only).
It is an [IWSDK](https://iwsdk.dev) app (Vite, `@iwsdk/core` 1.0.1) with its own `package.json`, apart from
the map app in `app/`. The design is `docs/vision.md`, `docs/experience-design.md` and
`docs/technical-design.md`.

The app only renders. Every dimension (hall, doors, pedestals, the threshold's path, rings and speed,
the vault) comes from `data/cathedral.json`, written by `pipeline/cathedral.py`; the pathways and their
gates from `data/pathways.json`; the number theory stretch from `data/plane-number-theory.json`. The
plane's geometry is built by `app/plane/`, reused through a Vite alias that points `three` at IWSDK's.

## Run it

```bash
npm install && npm run install:apps     # from the repo root; installs worker/ and cathedral/ too
npm run data                            # the pipeline writes data/*.json
cd cathedral
IWSDK_DEV_OPEN=false npx vite           # https://localhost:8081 (self-signed); see Notes
npm run dev                             # the IWSDK CLI's managed browser, for its agent tooling
```

Open the page, enter the Worker's address and the app secret once on the device (they stay in that
browser's storage and are never in the build), or choose "Continue without Trurl". Everything else
works without the Worker, with progress kept on the device.

- **Desktop**: drag to look, W A S D to walk, click or Enter on a door, V (held) to talk, T for the text box.
- **Headset**: open the page's network URL from `npx iwsdk dev status` on the Quest's browser (same
  Wi-Fi; accept the certificate warning once), press "Enter VR", which also asks for the microphone.
  Trigger begins and goes through a door, hold A (or X) to talk, B (or Y) steps back, thumbstick for
  teleport and the 30 degree snap turn. There is no smooth locomotion (CLAUDE.md rule 6).
- On a return visit a trigger or click during the drift fades straight to the dais. The first visit
  always plays in full.

## Earning by doing

An idea joins the map by doing, then explaining, in the same visit (core/doing.ts holds the rules):

- **The road**: a composite stack is veiled (one plain colour, its sign only its number). Look at it and say
  or type the primes that multiply to it ("2, 2, 3"); a right answer assembles it. Three stacks finish it.
- **The sieve**: name the next prime to strike (say it, type it, or point and pull the trigger), and say
  "done" when nothing more would fall.
- Then, and only then, Trurl asks his question (a caption from `pathways.json`, nothing sent). The Worker
  gets what was done as numbers and grants nothing unless it was done; the app checks again, and the doing
  is never saved, so a verdict can only follow a doing from this visit.
- While a moment is open nothing on screen says its answer: the plane shows the `*_open` lines, and the
  phrases in `never_show` (pipeline/config.yaml) are scanned for in the data and on the screen.

## Drafts

Prose written ahead of time (the app's own lines in `src/copy.ts`, the plane's texts, Trurl's questions) is
a draft until a person approves it, and a draft carries a small tag drawn by the style beside it (the
`data-draft` attribute in the page, a `DRAFT` tag on the headset panel), never inside the sentence. To approve
an app line add its id to `REVIEWED_LINES`; a plane text or a question, set its `reviewed` flag in the data's
source. Interface text (buttons, status, plain errors) is not content and has no tag.

## Checks

```bash
npm test                  # unit tests (vitest): flow, motion, door picking, storage, SSE, push-to-talk ...
npm run typecheck
npm run build             # production build; then `node ../scripts/check-no-secrets.mjs --client dist`
```

The end-to-end tests are at the repo root: `npx playwright test e2e/cathedral.spec.ts e2e/cathedral-headset.spec.ts --project=cathedral`.
They start this dev server themselves, mock the Worker on the same origin, and drive the IWSDK
emulator (IWER) for the headset. The emulator proves the wiring, not the feel or the frame rate: those
are measured on a Quest 3.

## Notes

- `IWSDK_DEV_OPEN=false` stops the dev plugin from launching (and downloading) its own browser, which
  a sandbox or CI cannot do.
- The scaffold's `@meta-quest/metavr` dependency (usage telemetry) is deliberately not installed.
- Snap turn and teleport are IWSDK's own systems, set up in `src/index.ts`; `SlideSystem` is not
  registered, sliding speed is 0 and jumping is off.
