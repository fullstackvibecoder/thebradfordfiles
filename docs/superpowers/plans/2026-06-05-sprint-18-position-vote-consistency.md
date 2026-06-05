# Position ↔ Vote Evidence Pairing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair a candidate's stated positions/pledges with their topically-related council votes across the enclosing term, surfaced as `related_votes` on dossier records — evidence only, no verdict.

**Architecture:** Extend the deterministic `match_votes.py` to also match `position`/`pledge` records (term-window, multi-match, topical keyword overlap), emitting multiple `matches.jsonl` rows per record. `build_site.py` groups matches by shortcode and attaches `related_votes` (positions/pledges) while keeping the single `council_verification` (actions) back-compatible.

**Tech Stack:** Python 3 stdlib only (no external deps — runs in the current env). Tests: `.venv/bin/python -m pytest`.

---

### Task 1: `_term_bounds` helper

**Files:**
- Modify: `scripts/match_votes.py` (add helper near the other date helpers)
- Test: `tests/test_match_votes.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_match_votes.py`:

```python
def test_term_bounds_encloses_date():
    from datetime import datetime
    from scripts import match_votes
    b = match_votes._term_bounds(["2018-2022", "2022-2026"], "2024-05-01")
    assert b is not None
    start, end = b
    assert start == datetime(2022, 1, 1)
    assert end.year == 2026 and end.month == 12 and end.day == 31


def test_term_bounds_returns_none_outside_terms():
    from scripts import match_votes
    assert match_votes._term_bounds(["2022-2026"], "2019-01-01") is None
    assert match_votes._term_bounds([], "2024-01-01") is None
    assert match_votes._term_bounds(["2022-2026"], "") is None
    assert match_votes._term_bounds(["garbage"], "2024-01-01") is None
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_match_votes.py::test_term_bounds_encloses_date -v`
Expected: FAIL — `AttributeError: module 'scripts.match_votes' has no attribute '_term_bounds'`

- [ ] **Step 3: Implement**

In `scripts/match_votes.py`, add after `_parse_post_date` (so `_parse_post_date` is defined above it):

```python
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
```

- [ ] **Step 4: Run it, verify PASS**

Run: `.venv/bin/python -m pytest tests/test_match_votes.py -v`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add scripts/match_votes.py tests/test_match_votes.py
git commit -m "feat(sprint-18): _term_bounds helper for council-term windows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Position/pledge matching path

**Files:**
- Modify: `scripts/match_votes.py` (`_match_dict`, new `_position_matches`, `match_for`, new constants)
- Test: `tests/test_match_votes.py` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_match_votes.py`:

```python
def _seed_position(tmp_path, votes_list, record_overrides=None):
    """Seed multiple votes + one position record for Bradford (term 2022-2026)."""
    votes = tmp_path / "votes"
    votes.mkdir()
    lines = []
    for i, v in enumerate(votes_list, start=1):
        base = {"_id": i, "First Name": "Brad", "Last Name": "Bradford",
                "Date/Time": "2024-06-01 10:00 AM", "Agenda Item #": f"2024.X{i}.1",
                "Agenda Item Title": "", "Vote": "Yes", "Result": "Carried, 20-5",
                "Vote Description": ""}
        base.update(v)
        lines.append(json.dumps(base))
    (votes / "bradford-brad.jsonl").write_text("\n".join(lines) + "\n")
    cand = tmp_path / "bradfordgrams"
    cand.mkdir()
    (cand / "candidate.json").write_text(json.dumps({
        "handle": "bradfordgrams", "slug": "bradford",
        "council_terms": ["2022-2026"],
        "council_name_for_vote_lookup": {"first": "Brad", "last": "Bradford"}}))
    rec = {"kind": "position", "shortcode": "POS1", "post_url": "u",
           "post_date": "2024-05-01", "topic": "transit",
           "summary": "Supports expanding bike lanes across downtown."}
    if record_overrides:
        rec.update(record_overrides)
    (cand / "records.jsonl").write_text(json.dumps(rec) + "\n")
    return votes


def test_position_multi_matches_topical_votes_in_term(tmp_path, monkeypatch):
    votes = _seed_position(tmp_path, [
        {"Agenda Item Title": "Bike lane network expansion Bloor",
         "Vote Description": "Expand bike lanes downtown", "Date/Time": "2024-06-01 10:00 AM"},
        {"Agenda Item Title": "Bike lane installation Danforth",
         "Vote Description": "Install bike lanes Danforth", "Vote": "No",
         "Date/Time": "2025-02-01 10:00 AM"},
        {"Agenda Item Title": "Garbage collection schedule",  # off-topic
         "Vote Description": "Change waste pickup days", "Date/Time": "2024-07-01 10:00 AM"},
    ])
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    matches = match_votes.match_for("bradfordgrams")
    # both bike-lane votes match the bike-lane position; garbage vote does not
    assert len(matches) == 2
    assert all(m["record_kind"] == "position" for m in matches)
    assert all(m["match_type"] == "position_topic" for m in matches)
    titles = {m["agenda_item_title"] for m in matches}
    assert titles == {"Bike lane network expansion Bloor", "Bike lane installation Danforth"}
    # carries the disposition so the reader can interpret the Yes/No
    assert {m["vote_disposition"] for m in matches} == {"Yes", "No"}


def test_position_excludes_votes_outside_term(tmp_path, monkeypatch):
    votes = _seed_position(tmp_path, [
        {"Agenda Item Title": "Bike lane expansion", "Vote Description": "Expand bike lanes",
         "Date/Time": "2019-06-01 10:00 AM"},  # previous term, outside 2022-2026
    ])
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    assert match_votes.match_for("bradfordgrams") == []


def test_no_match_row_carries_a_consistency_verdict(tmp_path, monkeypatch):
    votes = _seed_position(tmp_path, [
        {"Agenda Item Title": "Bike lane expansion", "Vote Description": "Expand bike lanes downtown"},
    ])
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    matches = match_votes.match_for("bradfordgrams")
    forbidden = {"consistent", "inconsistent", "mixed", "score", "alignment", "verdict"}
    for m in matches:
        assert forbidden.isdisjoint(m.keys())
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_match_votes.py::test_position_multi_matches_topical_votes_in_term -v`
Expected: FAIL — `match_for` currently ignores `position` records (returns `[]` → `len(matches) == 0`).

- [ ] **Step 3a: Add constants + extend `_match_dict`**

In `scripts/match_votes.py`, add near the other constants (after `CONFIDENCE_THRESHOLD = 0.7`):

```python
POSITION_MIN_OVERLAP = 2       # min overlapping keywords for a position<->vote pairing
POSITION_MIN_CONFIDENCE = 0.15  # overlap / record-keyword-count floor
```

Replace `_match_dict` with this version (adds `record_kind` + `agenda_item_title`; everything else identical):

```python
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
```

- [ ] **Step 3b: Add `_position_matches`**

In `scripts/match_votes.py`, add after `_tier2_match`:

```python
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
```

- [ ] **Step 3c: Wire into `match_for`**

In `scripts/match_votes.py`, replace the record loop inside `match_for` (the block that currently filters `if r.get("kind") != "action": continue` and appends one tier1/tier2 match) with:

```python
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
```

- [ ] **Step 4: Run the tests, verify PASS**

Run: `.venv/bin/python -m pytest tests/test_match_votes.py -v`
Expected: PASS (all — including the unchanged tier1/tier2 action tests, which now also carry the additive `record_kind`/`agenda_item_title` fields without breaking their assertions).

- [ ] **Step 5: Commit**

```bash
git add scripts/match_votes.py tests/test_match_votes.py
git commit -m "feat(sprint-18): match positions/pledges to term votes (multi-match, evidence-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `build_site` groups matches + attaches `related_votes`

**Files:**
- Modify: `scripts/build_site.py` (`_load_matches`, `_candidate_dossier` signature + record loop)
- Test: `tests/test_build_site_related_votes.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_build_site_related_votes.py`:

```python
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_position_record_gets_related_votes_list(tmp_repo, run_build, monkeypatch):
    data = tmp_repo / "data"
    # Give Bradford a position record + two matching vote rows in matches.jsonl
    brad = data / "bradfordgrams"
    recs = [json.loads(l) for l in (brad / "records.jsonl").read_text().splitlines() if l.strip()]
    recs.append({"kind": "position", "shortcode": "POS1", "post_url": "u",
                 "post_date": "2024-05-01", "topic": "transit", "summary": "bike lanes"})
    (brad / "records.jsonl").write_text("\n".join(json.dumps(r) for r in recs) + "\n")
    votes_dir = data / "votes"
    votes_dir.mkdir(parents=True, exist_ok=True)
    (votes_dir / "matches.jsonl").write_text("\n".join(json.dumps(m) for m in [
        {"record_shortcode": "POS1", "record_kind": "position", "council_vote_id": 1,
         "confidence": 0.5, "match_type": "position_topic", "agenda_item": "2024.X1.1",
         "agenda_item_title": "Bike lane Bloor", "vote_disposition": "Yes",
         "result": "Carried", "vote_date": "2025-02-01 10:00 AM",
         "vote_description": "Expand bike lanes", "candidate_handle": "bradfordgrams",
         "candidate_slug": "bradford"},
        {"record_shortcode": "POS1", "record_kind": "position", "council_vote_id": 2,
         "confidence": 0.4, "match_type": "position_topic", "agenda_item": "2024.X2.1",
         "agenda_item_title": "Bike lane Danforth", "vote_disposition": "No",
         "result": "Lost", "vote_date": "2024-06-01 10:00 AM",
         "vote_description": "Install bike lanes", "candidate_handle": "bradfordgrams",
         "candidate_slug": "bradford"},
    ]) + "\n")

    from scripts import build_site
    build_site.main([])

    dossier = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    pos = next(r for r in dossier["records"] if r.get("shortcode") == "POS1")
    assert "related_votes" in pos
    assert len(pos["related_votes"]) == 2
    # sorted ascending by vote_date
    assert [v["council_vote_id"] for v in pos["related_votes"]] == [2, 1]
    # evidence only — no verdict keys anywhere on the record
    forbidden = {"consistent", "inconsistent", "mixed", "score", "alignment", "verdict"}
    assert forbidden.isdisjoint(pos.keys())
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_build_site_related_votes.py -v`
Expected: FAIL — position record has no `related_votes` (the current build only attaches `council_verification` to actions, and `_load_matches` is 1:1).

- [ ] **Step 3a: Make `_load_matches` group by shortcode**

In `scripts/build_site.py`, replace the entire `_load_matches` function with:

```python
def _load_matches() -> dict[str, list[dict]]:
    """All match rows grouped by record shortcode (a position can match many votes)."""
    out: dict[str, list[dict]] = {}
    if not MATCHES_FILE.exists():
        return out
    for line in MATCHES_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            m = json.loads(line)
        except json.JSONDecodeError:
            continue
        sc = m.get("record_shortcode")
        if sc:
            out.setdefault(sc, []).append(m)
    return out
```

- [ ] **Step 3b: Update the dossier signature + record loop**

In `scripts/build_site.py`, change the `_candidate_dossier` signature annotation:
```python
def _candidate_dossier(manifest: dict, matches_by_sc: dict[str, list[dict]]) -> dict:
```

Replace the action-attach block (currently):
```python
        if r.get("kind") == "action":
            sc = r.get("shortcode")
            if sc and sc in matches_by_sc:
                r["council_verification"] = matches_by_sc[sc]
```
with:
```python
        sc = r.get("shortcode")
        rows = matches_by_sc.get(sc, []) if sc else []
        if rows:
            if r.get("kind") == "action":
                # back-compat: single best-confidence verification
                r["council_verification"] = max(rows, key=lambda m: m.get("confidence", 0))
            elif r.get("kind") in ("position", "pledge"):
                r["related_votes"] = sorted(rows, key=lambda m: m.get("vote_date") or "")
```

- [ ] **Step 4: Run the tests, verify PASS (and no regressions)**

Run: `.venv/bin/python -m pytest tests/test_build_site_related_votes.py tests/test_build_site.py tests/test_build_site_synthesis.py -v`
Expected: PASS. Then full suite: `.venv/bin/python -m pytest tests/ -q` → all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_site.py tests/test_build_site_related_votes.py
git commit -m "feat(sprint-18): group matches; attach related_votes to positions/pledges

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** `_term_bounds` term-window (Task 1) ✓; position/pledge multi-match, term-window, topical threshold, `record_kind` + `agenda_item_title`, no-date-proximity (Task 2) ✓; `matches.jsonl` multi-row per record (Task 2 emits via `match_for`) ✓; build_site grouping + `related_votes` (positions) / `council_verification` back-compat (actions) (Task 3) ✓; neutrality guard — no verdict/score keys (Task 2 `test_no_match_row_carries_a_consistency_verdict` + Task 3 dossier assertion) ✓; action matching unchanged (existing tier1/tier2 tests still pass, Task 2 Step 4) ✓. Rollout step 4 (real-data run + threshold tuning) is operational, correctly deferred (needs repaired env), not a code task.
- **Placeholder scan:** No TBD/TODO; every code step shows full code or exact old→new blocks. Thresholds are concrete constants (`POSITION_MIN_OVERLAP=2`, `POSITION_MIN_CONFIDENCE=0.15`).
- **Type/name consistency:** `_term_bounds(council_terms, post_date) -> tuple|None`, `_position_matches(record, votes, bounds) -> list[dict]`, `_match_dict(record, vote, conf, mtype)` (now incl `record_kind`/`agenda_item_title`), `_load_matches() -> dict[str, list[dict]]`, `match_type="position_topic"`, `related_votes`/`council_verification` — names consistent across tasks and tests. `matches_by_sc` is `dict[str, list[dict]]` everywhere after Task 3.
