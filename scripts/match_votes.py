#!/usr/bin/env python3
"""Match Action records against the City of Toronto council voting record.

Tier 1 (agenda_item): record's source_quote contains an agenda item number
that maps directly to a council vote. Confidence >= 0.95.

Tier 2 (date_keyword): action's post_date is within +/-60 days of a council
vote AND keywords from summary/topic overlap with the vote's title/description.
Confidence 0.7-0.94 based on date closeness x keyword overlap.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
VOTES_BY_COUNCILLOR = DATA_DIR / "votes" / "by-councillor"
MATCHES_OUT = DATA_DIR / "votes" / "matches.jsonl"

AGENDA_ITEM_RE = re.compile(r"\b\d{4}\.[A-Z]{2,3}\d+\.\d+\b")
DATE_WINDOW_DAYS = 60
CONFIDENCE_THRESHOLD = 0.7
POSITION_MIN_OVERLAP = 2       # min overlapping keywords for a position<->vote pairing
POSITION_MIN_CONFIDENCE = 0.15  # overlap / record-keyword-count floor


def _slug(text: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in (text or "")).strip("-")


def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def _parse_council_date(s: str | None) -> datetime | None:
    if not s or not isinstance(s, str):
        return None
    for fmt in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _parse_post_date(s: str) -> datetime | None:
    if not s:
        return None
    s = s.split("T")[0]
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        return None


def _term_bounds(council_terms: list[str], post_date: str) -> tuple[datetime, datetime] | None:
    """Return (start, end) datetimes of the council term enclosing post_date,
    parsed from a list of 'YYYY-YYYY' term strings. None if the date parses to
    nothing or falls in no listed term."""
    pd = _parse_post_date(post_date)
    if not pd:
        return None
    for term in council_terms or []:
        try:
            start_y, end_y = str(term).split("-")
            start = datetime(int(start_y), 1, 1)
            end = datetime(int(end_y), 12, 31, 23, 59, 59)
        except (ValueError, AttributeError):
            continue
        if start <= pd <= end:
            return (start, end)
    return None


def _keywords(text: str) -> set[str]:
    if not text:
        return set()
    return {w for w in re.findall(r"[a-z]{4,}", text.lower())}


def _tier1_match(record: dict, votes: list[dict]) -> dict | None:
    haystack = (record.get("source_quote", "") + " " + record.get("summary", ""))
    items = AGENDA_ITEM_RE.findall(haystack)
    if not items:
        return None
    target = items[0]
    for v in votes:
        if v.get("Agenda Item #") == target:
            return _match_dict(record, v, 0.97, "agenda_item")
    return None


def _tier2_match(record: dict, votes: list[dict]) -> dict | None:
    post_dt = _parse_post_date(record.get("post_date", ""))
    if not post_dt:
        return None
    record_kw = _keywords(record.get("summary", "") + " " + (record.get("topic", "") or "").replace("_", " "))
    if not record_kw:
        return None
    best, best_conf = None, 0.0
    for v in votes:
        v_dt = _parse_council_date(v.get("Date/Time", ""))
        if not v_dt:
            continue
        delta = abs((post_dt - v_dt).days)
        if delta > DATE_WINDOW_DAYS:
            continue
        v_kw = _keywords(v.get("Agenda Item Title", "") + " " + v.get("Vote Description", ""))
        if not v_kw:
            continue
        overlap = len(record_kw & v_kw)
        if overlap == 0:
            continue
        date_score = 1.0 - (delta / DATE_WINDOW_DAYS)
        keyword_score = overlap / max(len(record_kw), 1)
        conf = 0.7 + ((0.6 * keyword_score + 0.4 * date_score) * 0.24)
        if conf > best_conf and conf >= CONFIDENCE_THRESHOLD:
            best, best_conf = _match_dict(record, v, round(conf, 3), "date_keyword"), conf
    return best


def _position_matches(record: dict, votes: list[dict],
                      bounds: tuple[datetime, datetime]) -> list[dict]:
    """Match a position/pledge against EVERY topically-related vote within the
    council term `bounds`. Multi-match, no date-proximity term. Returns one row
    per qualifying vote (evidence pairing — no verdict computed)."""
    start, end = bounds
    rec_kw = _keywords(record.get("summary", "") + " "
                       + (record.get("topic", "") or "").replace("_", " "))
    if not rec_kw:
        return []
    out: list[dict] = []
    for v in votes:
        v_dt = _parse_council_date(v.get("Date/Time", ""))
        if not v_dt or not (start <= v_dt <= end):
            continue
        v_kw = _keywords(v.get("Agenda Item Title", "") + " " + v.get("Vote Description", ""))
        overlap = len(rec_kw & v_kw)
        if overlap < POSITION_MIN_OVERLAP:
            continue
        conf = round(overlap / max(len(rec_kw), 1), 3)
        if conf < POSITION_MIN_CONFIDENCE:
            continue
        out.append(_match_dict(record, v, conf, "position_topic"))
    return out


def _match_dict(record: dict, vote: dict, conf: float, mtype: str) -> dict:
    return {
        "record_shortcode": record.get("shortcode"),
        "record_kind": record.get("kind"),
        "council_vote_id": vote.get("_id"),
        "confidence": conf,
        "match_type": mtype,
        "agenda_item": vote.get("Agenda Item #"),
        "agenda_item_title": vote.get("Agenda Item Title"),
        "vote_disposition": vote.get("Vote"),
        "result": vote.get("Result"),
        "vote_date": vote.get("Date/Time"),
        "vote_description": vote.get("Vote Description"),
    }


def match_for(handle: str) -> list[dict]:
    cand_dir = DATA_DIR / handle
    manifest_path = cand_dir / "candidate.json"
    if not manifest_path.exists():
        return []
    manifest = json.loads(manifest_path.read_text())
    name = manifest.get("council_name_for_vote_lookup") or {}
    if not name.get("last"):
        return []
    votes_path = VOTES_BY_COUNCILLOR / f"{_slug(name['last'])}-{_slug(name.get('first', ''))}.jsonl"
    votes = _load_jsonl(votes_path)
    if not votes:
        return []
    terms = manifest.get("council_terms", [])
    matches: list[dict] = []
    for r in _load_jsonl(cand_dir / "records.jsonl"):
        kind = r.get("kind")
        if kind == "action":
            m = _tier1_match(r, votes) or _tier2_match(r, votes)
            if m:
                matches.append(m)
        elif kind in ("position", "pledge"):
            bounds = _term_bounds(terms, r.get("post_date", ""))
            if bounds:
                matches.extend(_position_matches(r, votes, bounds))
    return matches


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--handles", nargs="*", default=None)
    args = parser.parse_args(argv)
    sys.path.insert(0, str(ROOT / "scripts"))
    from lib import candidates  # type: ignore
    primaries = candidates.load_all_candidates()
    if args.handles:
        primaries = [p for p in primaries if p["handle"] in args.handles]
    all_matches: list[dict] = []
    for p in primaries:
        m = match_for(p["handle"])
        all_matches.extend({**x, "candidate_handle": p["handle"], "candidate_slug": p["slug"]} for x in m)
        print(f"  @{p['handle']}: {len(m)} matches")
    MATCHES_OUT.parent.mkdir(parents=True, exist_ok=True)
    with MATCHES_OUT.open("w", encoding="utf-8") as f:
        for m in all_matches:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    print(f"\n  wrote {MATCHES_OUT.relative_to(ROOT)} ({len(all_matches)} matches)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
