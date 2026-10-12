# The Truth Mines

A walkable 3D map of mathematics. The axioms sit on the surface; every theorem lies deeper than
everything its proof uses; tunnels follow the actual proof dependencies. Select a theorem and its
whole ancestry lights up, all the way back to the axioms.

The structure is not drawn by hand. It comes from [Metamath](https://us.metamath.org/)'s set.mm,
where every theorem is proved step by step from the axioms of logic and ZFC set theory: 49,510
statements and 909,530 citations. The mine shows 345 landmarks (named theorems, key definitions
and every axiom) and folds the lemmas between them into tunnels that record how much they hide.

Three ways to look:

- **The map**: the whole mine from outside. Select a theorem and its critical path to the axioms
  lights up.
- **Inside**: stand in a theorem's chamber at human scale. Its statement is on the wall, a pillar
  for each result it rests on, tunnels up to those results and down to what rests on it, with the
  lemmas of each tunnel marked at their own depth. "Journey here" walks you down from the axioms.
  Desktop (W A S D and the mouse) or a VR headset (teleport, snap turn, guided tunnels).
- **The number theory plane**: a second place, not a theorem. Walk a road of the integers 1 to 100
  (a prime is one tall monolith, every other number a stack of prime blocks, threads of light to
  what it is made of), strike numbers in the sieve plaza until only the 25 primes stand, and look
  out over the primes to a million as the count thins along a logarithmic road. Entered from the
  header or `#/plane/number-theory`; desktop and headset. The brief is
  [docs/plane-number-theory.md](docs/plane-number-theory.md).

- **The cathedral**, which is what [the published site](https://dgadapee00.github.io/truth-mines/)
  serves: a WebXR app in `cathedral/`. A threshold you drift down onto the dais of a round hall with
  twelve doors (lit, dim or sealed by what you have understood), the number theory stretch behind one
  of them, and questions in captions. Trurl's live voice needs a Worker that is not deployed; without
  it, finishing the road or the sieve still earns that moment's idea on the device. See
  [cathedral/README.md](cathedral/README.md) and [HANDOFF.md](HANDOFF.md). The map and the Inside view
  above are still in this repo (`npm run dev`); they are not the published page.

## Run it

```bash
pip install -r pipeline/requirements.txt
npm install
npm run data        # python -m pipeline: download the pinned set.mm, build data/ (~15 s)
npm run dev         # http://localhost:5173
```

## Checks

CI (`.github/workflows/build.yml`) runs the pipeline, the unit tests, and the full Playwright suite
on a pull request and on a push to `main`. A change merges only if they pass. `npm run check` is the
fast local gate: the same unit and pipeline tests, plus the map e2e, and not the Inside or headset
runs.

| Command | What it checks |
| --- | --- |
| `python -m pipeline` | Validation: acyclic, every citation resolves, every theorem grounded |
| `npm run test:pipeline` | Each pipeline stage on a small .mm fixture |
| `npm test` | core/ queries, and every landmark's ancestors against the full set.mm graph; every statement typesets |
| `npm run typecheck`, `npm run lint` | TypeScript strict; core/ imports no rendering code |
| `npm run check` | typecheck, lint, unit tests, pipeline tests, and the map e2e. The fast local gate |
| `npm run test:worker`, `npm run test:cathedral` | The Worker's tests (mocked Claude and xAI) and the cathedral app's unit tests |
| `npm run secrets` | No provider key or app secret in the repo or in a client build |
| `npm run e2e` | Full Playwright suite, which CI runs: the map on laptop and phone; the Inside view; the headset on an emulated Quest 3 |

## Layout of the code

| Path | What |
| --- | --- |
| `pipeline/` | Python: fetch, extract, validate, curate, collapse, depth, layout, export ([README](pipeline/README.md)) |
| `pipeline/landmarks.yaml` | The curated landmarks and their names: the only place curation happens |
| `pipeline/sources.lock` | Pinned sources (set.mm commit, the label font) with hashes |
| `core/` | TypeScript graph model and queries (ancestors, descendants, critical path, search), the sieve's rules, door states (`doors.ts`), progress merge (`progress.ts`), and the schema of every data file. No rendering |
| `pipeline/scene.py` | The Inside view's chambers and tunnels, as engine-neutral scene descriptors (data/scene.json) |
| `pipeline/numtheory.py`, `pipeline/plane_nt.py` | The number theory plane: arithmetic (tested against trial division) and its descriptors (data/plane-number-theory.json) |
| `cathedral/` | The IWSDK app for the cathedral prototype: threshold, hall, doors, number theory stretch, Trurl, push-to-talk, progress. Its own package ([README](cathedral/README.md)) |
| `pipeline/cathedral.py`, `pathways.py`, `grounding.py` | The cathedral's layout (data/cathedral.json), the pathways and their gates (data/pathways.json) and Trurl's grounding (data/grounding.json) |
| `app/inside/` | The Inside view: renders the descriptors for the local subgraph; desktop walking, Journey, headset |
| `app/plane/` | The number theory plane: draws and animates its descriptors; walking, focus, the sieve, stops, headset |
| `app/render/` | The mine in three.js: instanced nodes and tunnels, batched labels, MathJax |
| `app/ui/` | Panel, search, desktop camera |
| `worker/` | The Cloudflare Worker behind Trurl: auth, rate limits, progress, the streamed Claude reply and the speech-to-text proxy. Holds every provider key ([README](worker/README.md)) |
| `scripts/check-no-secrets.mjs` | Fails if a key or the app secret is in the repo or a client build |
| `content/` | Plain-language notes, shown only once reviewed ([README](content/README.md)) |
| `e2e/` | Playwright tests and screenshots |
| `data/` | Generated, gitignored. Never edited by hand |

## Credits

- **Data:** Metamath set.mm, by Norman Megill and the Metamath community, dedicated to the public
  domain under CC0. Pinned commit in `pipeline/sources.lock`. Each landmark links to its page on
  the Metamath Proof Explorer.
- **Label font:** DejaVu Sans (Bitstream Vera license with DejaVu changes), cut down to the
  characters the names use.
- Inspired by the Truth Mines in Greg Egan's novel *Diaspora*.
