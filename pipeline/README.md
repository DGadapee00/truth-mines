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

`python -m pipeline show LABEL` prints a statement and set.mm's own description of it. Read it
before naming a landmark.

Tests: `python -m pytest -q pipeline/tests` (a small hand-written .mm file covers every stage).

## Choices worth knowing

- **Roots.** Axioms and definitions are both asserted in Metamath, so both sit at depth 0.
- **Grounded.** set.mm has a few theorems proved from their own hypotheses alone (`idi`: from φ
  infer φ) and a few that restate a definition (`wl-df.clab`). Validation accepts those; any
  other theorem must reach an axiom or definition.
- **Hidden steps.** For a tunnel B → A, the number of non-landmark statements on some path from
  B down to A.
- **Transitive reduction.** A tunnel is dropped when its far end is reached through other tunnels.
  Ancestor sets are unchanged; core/'s tests check this against the full graph.
- **LaTeX.** pipeline/latex.py parses each statement (set.mm brackets every operation and
  application) and builds LaTeX on set.mm's own `latexdef`s: F(A) for application, (A, B) and
  friends for intervals, fractions, powers, √, |·|, !, and hypotheses above a rule. A few
  latexdefs are overridden in config.yaml where they rely on LaTeX packages a web renderer lacks.
- **Display forms.** Hand-written readable statements in landmarks.yaml, exported alongside the
  formal one with their `reviewed` flag.
- **Tunnels are checked twice.** tests/test_tunnels.py recomputes every tunnel and its
  hidden_steps from both ends of the full graph, independently of collapse.py.
