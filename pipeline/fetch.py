"""Stage 0, fetch: download each pinned source once and check its hash."""

from __future__ import annotations

import hashlib
import urllib.request
import zipfile

from .files import CACHE, read_lock


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name, src in read_lock().items():
        path = CACHE / src["file"]
        if path.exists() and sha256(path) == src["sha256"]:
            print(f"fetch: {name} already here ({src['commit'][:12]})")
            continue
        print(f"fetch: downloading {name} at {src['commit'][:12]}")
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(src["url"], tmp)
        got = sha256(tmp)
        if got != src["sha256"]:
            tmp.unlink()
            raise SystemExit(f"fetch: {name} hash mismatch: got {got}, sources.lock says {src['sha256']}")
        tmp.replace(path)


def source_path(name: str = "set.mm"):
    """The file a stage reads: the download itself, or for an archive, the pinned member in it."""
    src = read_lock()[name]
    path = CACHE / src["file"]
    member = src.get("member")
    if not member:
        return path
    out = CACHE / name / member.split("/")[-1]
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path) as z:
            out.write_bytes(z.read(member))
    return out
