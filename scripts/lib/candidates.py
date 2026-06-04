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
    """Load a single candidate manifest by handle.
    Returns None if the file is missing or contains malformed JSON."""
    manifest_path = DATA_DIR / handle / "candidate.json"
    if not manifest_path.exists():
        return None
    try:
        return json.loads(manifest_path.read_text())
    except json.JSONDecodeError:
        return None


def alias_handles_for(handle: str) -> list[str]:
    manifest = load_candidate(handle)
    if not manifest:
        return []
    return list(manifest.get("alias_handles", []))


INCUMBENCY_VALUES = {"incumbent", "challenger_officeholder", "challenger_outsider"}

_PRONOUN_FORMS = {
    "he/him": ("he", "him", "his"),
    "she/her": ("she", "her", "her"),
    "they/them": ("they", "them", "their"),
}


def _pronoun_forms(pronouns: str | None) -> tuple[str, str, str]:
    """Map a 'she/her'-style string to (subject, object, possessive).
    Falls back to they/them for missing or unrecognized input."""
    return _PRONOUN_FORMS.get((pronouns or "").strip().lower(), ("they", "them", "their"))


def prompt_persona(manifest: dict) -> str:
    """Build the candidate-framing paragraph injected at the top of the triage
    and extraction system prompts. Single source of truth for per-candidate
    framing — derived from the manifest so adding a candidate needs no prompt
    edits. Unknown/missing incumbency falls back to the most conservative
    'outsider' framing (assumes no voting record, so it never implies a council
    record the candidate lacks)."""
    name = manifest.get("display_name", "the candidate")
    handle = manifest.get("ig_handle") or manifest.get("handle", "")
    handle_str = f" (@{handle})" if handle else ""
    role = manifest.get("current_role", "")
    subj, _obj, poss = _pronoun_forms(manifest.get("pronouns"))
    incumbency = manifest.get("incumbency", "challenger_outsider")

    role_clause = f", {role}," if role else ","
    lead = (
        f"This project documents the public political record of {name}{handle_str}"
        f"{role_clause} a candidate for Mayor of Toronto in 2026."
    )

    if incumbency == "incumbent":
        office = (
            f" {name} is the incumbent — {subj} currently holds elected office, "
            f"so {poss} council and legislative votes, motions, and official "
            f"actions should be captured as Action records."
        )
    elif incumbency == "challenger_officeholder":
        office = (
            f" {name} currently holds elected office with a voting record, so "
            f"{poss} council and legislative votes, motions, and official actions "
            f"should be captured as Action records."
        )
    else:  # challenger_outsider, and any unknown value
        office = (
            f" {name} does not currently hold elected office and has no "
            f"legislative voting record; Action records should capture {poss} past "
            f"civic or organizing actions (e.g. community advocacy), not council votes."
        )
    return lead + office
