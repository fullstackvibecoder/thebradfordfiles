"""Tests for ingest_votes.py."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_ingest_writes_jsonl_per_term(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    (src / "member-voting-record-2022-2026.json").write_text(json.dumps([
        {"_id": 1, "Term": "2022-2026", "First Name": "Brad", "Last Name": "Bradford",
         "Committee": "City Council", "Date/Time": "2024-09-26 10:00 AM",
         "Agenda Item #": "2024.GG12.7", "Agenda Item Title": "Watercraft ban",
         "Motion Type": "Motion", "Vote": "Yes",
         "Result": "Carried, 24-0", "Vote Description": "Ban personal watercraft"},
    ]))
    out = tmp_path / "out"
    from scripts import ingest_votes
    monkeypatch.setattr(ingest_votes, "SOURCE_DIR", src)
    monkeypatch.setattr(ingest_votes, "OUT_DIR", out)
    ingest_votes.main([])
    raw = out / "raw" / "2022-2026.jsonl"
    rows = [json.loads(l) for l in raw.read_text().splitlines() if l.strip()]
    assert len(rows) == 1
    assert rows[0]["First Name"] == "Brad"


def test_ingest_writes_by_councillor_index(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    (src / "member-voting-record-2022-2026.json").write_text(json.dumps([
        {"_id": 1, "Term": "2022-2026", "First Name": "Brad", "Last Name": "Bradford",
         "Date/Time": "2024-09-26", "Agenda Item #": "2024.GG12.7",
         "Agenda Item Title": "x", "Vote": "Yes", "Result": "Carried", "Vote Description": "y"},
        {"_id": 2, "Term": "2022-2026", "First Name": "Olivia", "Last Name": "Chow",
         "Date/Time": "2024-09-26", "Agenda Item #": "2024.GG12.7",
         "Agenda Item Title": "x", "Vote": "Yes", "Result": "Carried", "Vote Description": "y"},
    ]))
    out = tmp_path / "out"
    from scripts import ingest_votes
    monkeypatch.setattr(ingest_votes, "SOURCE_DIR", src)
    monkeypatch.setattr(ingest_votes, "OUT_DIR", out)
    ingest_votes.main([])
    bradford_index = out / "by-councillor" / "bradford-brad.jsonl"
    chow_index = out / "by-councillor" / "chow-olivia.jsonl"
    assert bradford_index.exists() and chow_index.exists()
    bradford_rows = [json.loads(l) for l in bradford_index.read_text().splitlines() if l.strip()]
    assert len(bradford_rows) == 1
