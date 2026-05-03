"""Candidate manifest discovery and loading."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"


def load_all_candidates() -> list[dict]:
    """Return all primary candidate manifests, alphabetically by surname.
    Aliases (handles with `alias_of`) are excluded."""
    out: list[dict] = []
    for sub in sorted(DATA_DIR.iterdir()):
        if not sub.is_dir():
            continue
        manifest_path = sub / "candidate.json"
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            continue
        if manifest.get("alias_of"):
            continue
        out.append(manifest)
    out.sort(key=lambda c: (c.get("surname", ""), c.get("display_name", "")))
    return out


def load_candidate(handle: str) -> dict | None:
    manifest_path = DATA_DIR / handle / "candidate.json"
    if not manifest_path.exists():
        return None
    return json.loads(manifest_path.read_text())


def alias_handles_for(handle: str) -> list[str]:
    manifest = load_candidate(handle)
    if not manifest:
        return []
    return list(manifest.get("alias_handles", []))
