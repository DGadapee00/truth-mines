# The Truth Mines

A walkable 3D map of mathematics. The axioms sit on the surface; every theorem lies deeper than
everything its proof uses; tunnels follow the actual proof dependencies. Select a theorem and its
whole ancestry lights up, all the way back to the axioms.

The structure is not drawn by hand. It comes from [Metamath](https://us.metamath.org/)'s set.mm,
where every theorem is proved step by step from the axioms of logic and ZFC set theory: 49,510
statements and 909,530 citations. The mine shows 345 landmarks (named theorems, key definitions
and every axiom) and folds the lemmas between them into tunnels that record how much they hide.

Runs in a desktop browser. Headset (WebXR) mode is the next milestone.

## Run it

```bash
pip install -r pipeline/requirements.txt
npm install
npm run data        # python -m pipeline: download the pinned set.mm, build data/ (~15 s)
npm run dev         # http://localhost:5173
```

## Checks

All of these run in CI on every push (`.github/workflows/build.yml`), and a change merges only if
they pass:

| Command | What it checks |
| --- | --- |
| `python -m pipeline` | Validation: acyclic, every citation resolves, every theorem grounded |
| `npm run test:pipeline` | Each pipeline stage on a small .mm fixture |
| `npm test` | core/ queries, and every landmark's ancestors against the full set.mm graph; every statement typesets |
| `npm run typecheck`, `npm run lint` | TypeScript strict; core/ imports no rendering code |
| `npm run e2e` | Playwright, laptop and phone: load within the draw-call budget, search, trace, follow, links |

## Layout of the code

| Path | What |
| --- | --- |
| `pipeline/` | Python: fetch, extract, validate, curate, collapse, depth, layout, export ([README](pipeline/README.md)) |
| `pipeline/landmarks.yaml` | The curated landmarks and their names: the only place curation happens |
| `pipeline/sources.lock` | Pinned sources (set.mm commit, the label font) with hashes |
| `core/` | TypeScript graph model and queries (ancestors, descendants, route to an axiom, search). No rendering |
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
