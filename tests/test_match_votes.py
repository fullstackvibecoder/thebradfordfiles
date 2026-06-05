"""Tests for match_votes.py: agenda-item and date+keyword matching."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _seed(tmp_path, vote_overrides=None, record_overrides=None, post_date="2024-09-26"):
    votes = tmp_path / "votes"
    votes.mkdir()
    base_vote = {"_id": 1, "First Name": "Brad", "Last Name": "Bradford",
                 "Date/Time": "2024-09-26 10:00 AM",
                 "Agenda Item #": "2024.GG12.7",
                 "Agenda Item Title": "Watercraft ban Cherry Beach",
                 "Vote": "Yes", "Result": "Carried, 24-0",
                 "Vote Description": "Ban personal watercraft Cherry Beach"}
    if vote_overrides: base_vote.update(vote_overrides)
    (votes / "bradford-brad.jsonl").write_text(json.dumps(base_vote) + "\n")
    cand = tmp_path / "bradfordgrams"
    cand.mkdir()
    (cand / "candidate.json").write_text(json.dumps({
        "handle":"bradfordgrams","slug":"bradford",
        "council_name_for_vote_lookup":{"first":"Brad","last":"Bradford"}}))
    base_record = {"kind":"action","shortcode":"ABC","post_url":"u",
                   "post_date": post_date, "topic":"safety_crime",
                   "summary":"Brought motion creating jet-ski no-go zone Cherry Beach.",
                   "source_quote":"I brought forward 2024.GG12.7 and it passed unanimously."}
    if record_overrides: base_record.update(record_overrides)
    (cand / "records.jsonl").write_text(json.dumps(base_record) + "\n")
    return votes


def test_tier1_match_by_agenda_item(tmp_path, monkeypatch):
    votes = _seed(tmp_path)
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    matches = match_votes.match_for("bradfordgrams")
    assert len(matches) == 1
    m = matches[0]
    assert m["match_type"] == "agenda_item"
    assert m["confidence"] >= 0.95
    assert m["agenda_item"] == "2024.GG12.7"
    assert m["vote_disposition"] == "Yes"


def test_tier2_match_by_date_and_keyword(tmp_path, monkeypatch):
    votes = _seed(tmp_path,
                  record_overrides={"source_quote": "passed unanimously"},  # no agenda item
                  post_date="2024-09-30")
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    matches = match_votes.match_for("bradfordgrams")
    assert len(matches) == 1
    assert matches[0]["match_type"] == "date_keyword"
    assert 0.7 <= matches[0]["confidence"] < 0.95


def test_no_match_when_unrelated(tmp_path, monkeypatch):
    votes = _seed(tmp_path,
                  vote_overrides={"Date/Time":"2024-01-01 10:00 AM",
                                  "Agenda Item Title":"unrelated topic",
                                  "Vote Description":"completely different subject"},
                  record_overrides={"summary":"Subway expansion announcement.",
                                    "source_quote":"subway",
                                    "topic":"transit"},
                  post_date="2024-09-30")
    from scripts import match_votes
    monkeypatch.setattr(match_votes, "VOTES_BY_COUNCILLOR", votes)
    monkeypatch.setattr(match_votes, "DATA_DIR", tmp_path)
    assert match_votes.match_for("bradfordgrams") == []


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
