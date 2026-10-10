"""The data model the pipeline writes and the app reads. Mirrors core/schema.ts field for field.

Bump SCHEMA_VERSION on any change to these shapes, in both files, so an app never reads data it
does not understand.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

SCHEMA_VERSION = 1

KINDS = ("axiom", "definition", "theorem")


@dataclass
class Node:
    id: str  # set.mm label
    kind: str  # one of KINDS
    name: str  # human name from landmarks.yaml; empty for an axiom without one
    statement: str  # LaTeX: hypotheses, then ⇒, then the conclusion
    subject: str  # subject id from config.yaml
    depth: int  # longest path from the roots in the full set.mm graph
    pos: tuple[float, float, float]  # metres; y = -depth * metres_per_depth
    deps: list[str] = field(default_factory=list)  # direct dependencies after collapse
    hidden_steps: list[int] = field(default_factory=list)  # parallel to deps
    note: str = ""  # path of a reviewed note in content/, or empty

    def to_json(self) -> dict:
        d = asdict(self)
        d["pos"] = [round(v, 3) for v in self.pos]
        return d
