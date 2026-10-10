"""Where each stage reads and writes, and small JSON helpers."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
PIPE = ROOT / "pipeline"
CACHE = PIPE / ".cache"
BUILD = PIPE / "build"
DATA = ROOT / "data"
CONTENT = ROOT / "content"


def stage_file(name: str) -> Path:
    return BUILD / f"{name}.json.gz"


def write_stage(name: str, obj) -> Path:
    BUILD.mkdir(parents=True, exist_ok=True)
    path = stage_file(name)
    with gzip.open(path, "wt", encoding="utf8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return path


def read_stage(name: str):
    path = stage_file(name)
    if not path.exists():
        raise SystemExit(f"{path.relative_to(ROOT)} is missing: run the '{name}' stage first")
    with gzip.open(path, "rt", encoding="utf8") as f:
        return json.load(f)


def load_yaml(path: Path):
    with open(path, encoding="utf8") as f:
        return yaml.safe_load(f)


def config() -> dict:
    return load_yaml(PIPE / "config.yaml")


def read_lock() -> dict[str, dict[str, str]]:
    """sources.lock: [name] blocks of key = value lines."""
    out: dict[str, dict[str, str]] = {}
    cur = None
    for raw in (PIPE / "sources.lock").read_text(encoding="utf8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            cur = out.setdefault(line[1:-1], {})
            continue
        if cur is None or "=" not in line:
            raise SystemExit(f"sources.lock: cannot read line: {raw}")
        k, v = line.split("=", 1)
        cur[k.strip()] = v.strip()
    return out
