"""The label font: DejaVu Sans (pinned in sources.lock), cut down to the characters the names use.

The app draws landmark names with troika-three-text, which reads .woff files. Shipping only the
glyphs the names need keeps the download small; checking coverage here means a name with a
character the font lacks fails the build instead of showing a blank box on the headset.
"""

from __future__ import annotations

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

from .fetch import source_path

ALWAYS = "".join(chr(c) for c in range(0x20, 0x7F))  # ASCII, for labels and the search box


def build_label_font(names: list[str], out: Path) -> int:
    src = source_path("dejavu-sans")
    chars = set(ALWAYS) | {c for n in names for c in n}
    cmap = TTFont(src).getBestCmap()
    missing = sorted(c for c in chars if ord(c) not in cmap and not c.isspace())
    if missing:
        bad = [n for n in names if any(c in missing for c in n)]
        raise SystemExit(f"fonts: DejaVu Sans has no glyph for {' '.join(missing)} (in: {bad[:5]})")
    opts = subset.Options()
    opts.flavor = "woff"
    opts.layout_features = ["kern", "liga"]
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text="".join(sorted(chars)))
    sub.subset(font)
    out.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(out), opts)
    return len(chars)
