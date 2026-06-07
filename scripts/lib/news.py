"""News ingestion helpers: url hashing, candidate name matching, and stdlib
html.parser-based RSS + article parsing (expat-free, pip-free)."""
from __future__ import annotations

import hashlib


def url_hash(url: str) -> str:
    """Stable, filesystem-safe 16-hex-char id for a URL (whitespace-trimmed)."""
    return hashlib.sha1((url or "").strip().encode("utf-8")).hexdigest()[:16]


def match_candidates(text: str, candidates: list[dict]) -> list[str]:
    """Return handles of candidates whose full display_name appears in text
    (case-insensitive). Full-name match avoids false positives from common
    surnames; routing to multiple candidates is allowed."""
    low = (text or "").lower()
    out: list[str] = []
    for c in candidates:
        name = (c.get("display_name") or "").strip().lower()
        if name and name in low:
            out.append(c["handle"])
    return out
