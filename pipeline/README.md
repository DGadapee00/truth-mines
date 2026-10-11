# The data pipeline

`python -m pipeline` turns the pinned set.mm into `data/graph.json` and `data/meta.json`. Each
stage reads the previous stage's file in `pipeline/build/` and can be rerun alone
(`python -m pipeline layout export`).

| Stage | Reads | Writes | What it does |
| --- | --- | --- | --- |
| fetch | `sources.lock` | `.cache/` | Downloads each pinned source and checks its sha256 |
| extract | set.mm | `build/extract` | Every axiom, definition and theorem (`\|-` statements) and the results each proof cites; parts; LaTeX for each symbol |
| validate | extract | `build/validate` | Fails the build unless every citation resolves, the graph is acyclic, and every theorem is grounded |
| curate | extract, `landmarks.yaml`, `config.yaml` | `build/curate` | The landmarks: the curated list plus every axiom in the main parts |
| collapse | extract, curate | `build/collapse` | Tunnels between landmarks, counting the lemmas each hides; transitive reduction |
| depth | extract, curate | `build/depth` | Longest path from the roots, in the full graph |
| layout | curate, collapse, depth | `build/layout` | Positions in metres: y by depth, a wedge per subject |
| export | all of the above | `data/` | graph.json, meta.json, reviewed notes, the label font |
| scene | curate, collapse, depth | `data/scene.json` | The Inside view's chambers, tunnels, markers: engine-neutral descriptors |
| plane | `config.yaml` (needs no set.mm) | `data/plane-number-theory.json` | The number theory plane: road, stacks, threads, hues, sieve plaza, overlook |
| cathedral | `config.yaml` (needs no set.mm) | `data/cathedral.json` | The hub: hall, twelve doors with pedestals and previews, the fractal threshold, the vault |
| pathways | `config.yaml`, curate | `data/pathways.json` | The route behind each door: entry requirements, stretches, moments; every id checked against the landmarks |

`python -m pipeline show LABEL` prints a statement and set.mm's own description of it. Read it
before naming a landmark.

Tests: `python -m pytest -q pipeline/tests` (a small hand-written .mm file covers every stage).

## Choices worth knowing

- **Roots.** Axioms and definitions are both asserted in Metamath, so both sit at depth 0.
- **Grounded.** set.mm has a few theorems proved from their own hypotheses alone (`idi`: from φ
  infer φ) and a few that restate a definition (`wl-df.clab`). Validation accepts those; any
  other theorem must reach an axiom or definition.
- **Feeding lemmas and chain.** For a tunnel B → A, `feeding_lemmas` counts the non-landmark
  statements on any path from B down to A (the union of all paths). `chain` lists the statements
  on the longest such path, from A's end down to B's: like depth, it follows the longest route.
  The Inside view places markers along `chain`; tunnel length follows the depth difference.
- **Transitive reduction.** A tunnel is dropped when its far end is reached through other tunnels.
  Ancestor sets are unchanged; core/'s tests check this against the full graph.
- **LaTeX.** pipeline/latex.py parses each statement (set.mm brackets every operation and
  application) and builds LaTeX on set.mm's own `latexdef`s: F(A) for application, (A, B) and
  friends for intervals, fractions, powers, √, |·|, !, and hypotheses above a rule. A few
  latexdefs are overridden in config.yaml where they rely on LaTeX packages a web renderer lacks.
- **Display forms.** Hand-written readable statements in landmarks.yaml, exported alongside the
  formal one with their `reviewed` flag.
- **The number theory plane** (pipeline/numtheory.py, pipeline/plane_nt.py) computes every number
  it shows and tests it against independent code: factorizations against trial division, the
  sieve against a naive simulation in hundreds of strike orders, π(x) against known values and
  direct counting. It has its own schema version (`PLANE_SCHEMA_VERSION`) and no randomness, so
  the same build gives the same bytes. Its captions are drafts with `reviewed: false`.
- **Tunnels are checked twice.** tests/test_tunnels.py recomputes every tunnel and its
  feeding_lemmas from both ends of the full graph, and checks each chain is a real citation path
  no longer than the depth difference allows, independently of collapse.py.
- **The cathedral** (pipeline/cathedral.py) puts twelve doors on a circle at 30-degree slots from the
  far wall; the visitor rises through the floor at the centre (four arcs of three use all twelve
  slots, so no slot is left for a wall entrance). Doors carry no state: `core/doors.ts` computes
  frontier, dim or sealed from what has been earned and from `pathways.json`.
- **Pathways** (pipeline/pathways.py) validate the curation in `config.yaml` (`cathedral.pathways`)
  against the landmarks: an unknown id, a moment that earns outside its stretch, or a door without a
  pathway fails the build. Gates for planes with no stretch yet are marked placeholders.
