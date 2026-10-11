"""The data model the pipeline writes and the app reads. Mirrors core/schema.ts field for field.

Bump SCHEMA_VERSION on any change to these shapes, in both files, so an app never reads data it
does not understand.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

SCHEMA_VERSION = 6

# plane-number-theory.json has its own version, so adding a plane leaves the mine's files alone.
PLANE_SCHEMA_VERSION = 1

# cathedral.json and pathways.json are versioned on their own too (docs/schemas/*.schema.json).
CATHEDRAL_SCHEMA_VERSION = 1
PATHWAYS_SCHEMA_VERSION = 2
GROUNDING_SCHEMA_VERSION = 1  # grounding.json: what Trurl may say (bundled into the Worker)

KINDS = ("axiom", "definition", "theorem")


@dataclass
class Node:
    id: str  # set.mm label
    kind: str  # one of KINDS
    name: str  # human name from landmarks.yaml; may hold inline math between $ signs
    label: str  # the name as plain text, for 3D labels (no TeX)
    statement: str  # LaTeX translated from set.mm: hypotheses above a rule, then the conclusion
    source: str  # the statement as set.mm writes it (ASCII)
    display: str  # hand-written readable LaTeX from landmarks.yaml, or empty
    display_reviewed: bool  # whether a person has checked `display` against the statement
    subject: str  # subject id from config.yaml
    depth: int  # longest path from the roots in the full set.mm graph
    pos: tuple[float, float, float]  # metres; y = -depth * metres_per_depth
    deps: list[str] = field(default_factory=list)  # direct dependencies after collapse
    feeding_lemmas: list[int] = field(default_factory=list)  # per tunnel: lemmas on any path to the dep
    chain: list[list[str]] = field(default_factory=list)  # per tunnel: the longest path, dep end first
    note: str = ""  # path of a reviewed note in content/, or empty

    def to_json(self) -> dict:
        d = asdict(self)
        d["pos"] = [round(v, 3) for v in self.pos]
        return d
