"""python -m pipeline [stage ...]

With no stage, runs every stage in order. Each stage reads the previous stage's file in
pipeline/build/, so any one can be rerun alone:

  python -m pipeline              fetch, extract, validate, curate, collapse, depth, layout, export, scene, plane
  python -m pipeline layout export
  python -m pipeline show LABEL   a statement's set.mm description, for naming a landmark
"""

from __future__ import annotations

import re
import sys
import time

from . import collapse, curate, depth, export, extract, fetch, layout, plane_nt, scene, validate

STAGES = {
    "fetch": fetch.run,
    "extract": extract.run,
    "validate": validate.run,
    "curate": curate.run,
    "collapse": collapse.run,
    "depth": depth.run,
    "layout": layout.run,
    "export": export.run,
    "scene": scene.run,
    "plane": plane_nt.run,
}


def show(label: str) -> None:
    db = extract.parse(fetch.source_path().read_text(encoding="utf8"))
    s = db.statements.get(label)
    if not s:
        raise SystemExit(f"{label} is not a statement in the pinned set.mm")
    print(f"{label} ({s.kind}, part: {db.parts[s.part]})")
    print(" ".join(s.concl))
    print(re.sub(r"\s+", " ", s.comment))


def main(argv: list[str]) -> None:
    if argv[:1] == ["show"]:
        for label in argv[1:]:
            show(label)
        return
    names = argv or list(STAGES)
    for name in names:
        if name not in STAGES:
            raise SystemExit(f"unknown stage {name}; stages: {', '.join(STAGES)}")
        t = time.time()
        STAGES[name]()
        print(f"  ({time.time() - t:.1f}s)")


if __name__ == "__main__":
    main(sys.argv[1:])
