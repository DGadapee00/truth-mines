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
| `app/inside/` | The Inside view: renders the descriptors for the local subgraph; desktop walking, Journey, headset |
| `app/plane/` | The number theory plane: draws and animates its descriptors; walking, focus, the sieve, stops, headset |
| `app/render/` | The mine in three.js: instanced nodes and tunnels, batched labels, MathJax |
| `app/ui/` | Panel, search, desktop camera |
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
