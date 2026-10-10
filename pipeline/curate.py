"""Stage 3, curate: choose the landmarks.

The landmarks are every entry in landmarks.yaml plus every axiom in config.yaml's
`axiom_subjects`, named from landmarks.yaml's `axiom_names`. Each statement's subject comes from the set.mm part it sits in, mapped by
config.yaml; a landmark may override it. Fails on an unknown label, a duplicate, a hypothesis or
syntax label, or a part no subject claims.
"""

from __future__ import annotations

from .files import PIPE, config, load_yaml, read_stage, write_stage


def subject_of_part(cfg: dict, parts: list[str]) -> list[str]:
    by_title = {p: s["id"] for s in cfg["subjects"] for p in s["parts"]}
    missing = [p for p in parts if p not in by_title]
    if missing:
        raise SystemExit(f"curate: config.yaml gives no subject for set.mm part(s): {missing}")
    return [by_title[p] for p in parts]


def select(ex: dict, cfg: dict, landmarks: list[dict], axiom_names: dict[str, str] | None = None) -> list[dict]:
    st = ex["statements"]
    subj = subject_of_part(cfg, ex["parts"])
    known = {s["id"] for s in cfg["subjects"]}
    out: list[dict] = []
    seen: set[str] = set()
    for lm in landmarks:
        label = str(lm["label"])
        if label in seen:
            raise SystemExit(f"curate: {label} is listed twice")
        if label not in st:
            raise SystemExit(f"curate: landmark {label} is not a statement in the pinned set.mm")
        if st[label]["kind"] == "axiom":
            raise SystemExit(f"curate: {label} is an axiom; axioms are added automatically")
        subject = lm.get("subject") or subj[st[label]["part"]]
        if subject not in known:
            raise SystemExit(f"curate: {label} has unknown subject {subject}")
        seen.add(label)
        entry = {"label": label, "name": lm["name"], "subject": subject}
        disp = lm.get("display")
        if disp is not None:
            if not isinstance(disp, dict) or not isinstance(disp.get("tex"), str) or not isinstance(disp.get("reviewed"), bool):
                raise SystemExit(f"curate: {label}: display needs a `tex` string and a `reviewed` true/false")
            entry["display"] = {"tex": disp["tex"], "reviewed": disp["reviewed"]}
        out.append(entry)
    names = axiom_names or {}
    for label in names:
        if label not in st or st[label]["kind"] != "axiom":
            raise SystemExit(f"curate: axiom_names lists {label}, which is not an axiom in the pinned set.mm")
    for label, s in st.items():
        if s["kind"] == "axiom" and subj[s["part"]] in cfg["axiom_subjects"] and label not in seen:
            seen.add(label)
            out.append({"label": label, "name": names.get(label, ""), "subject": subj[s["part"]]})
    return out


def run() -> None:
    ex = read_stage("extract")
    lm = load_yaml(PIPE / "landmarks.yaml")
    picked = select(ex, config(), lm["landmarks"], lm.get("axiom_names"))
    write_stage("curate", {"landmarks": picked})
    kinds: dict[str, int] = {}
    for p in picked:
        k = ex["statements"][p["label"]]["kind"]
        kinds[k] = kinds.get(k, 0) + 1
    print(f"curate: {len(picked)} landmarks {kinds}")
