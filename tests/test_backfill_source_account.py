"""Tests for scripts/backfill_source_account.py — one-time fixup script."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_backfill_adds_source_account_when_missing(tmp_path, monkeypatch):
    handle_dir = tmp_path / "bradfordgrams"
    handle_dir.mkdir()
    (handle_dir / "records.jsonl").write_text("\n".join([
        json.dumps({"shortcode": "A", "kind": "position", "topic": "transit"}),
        json.dumps({"shortcode": "B", "kind": "action",   "topic": "housing",
                    "source_account": "bradfordgrams"}),  # already set, keep
    ]) + "\n")
    from scripts import backfill_source_account
    monkeypatch.setattr(backfill_source_account, "DATA_DIR", tmp_path)
    n_repaired, n_total = backfill_source_account.backfill_handle("bradfordgrams")
    assert n_repaired == 1
    assert n_total == 2
    rows = [json.loads(l) for l in (handle_dir / "records.jsonl").read_text().splitlines() if l.strip()]
    assert all(r.get("source_account") for r in rows), "every record should have source_account"
    assert rows[0]["source_account"] == "bradfordgrams"
    assert rows[1]["source_account"] == "bradfordgrams"


def test_backfill_processes_all_known_handles(tmp_path, monkeypatch):
    """Backfill walks every handle that has a records.jsonl, including aliases."""
    for handle in ("bradfordgrams", "beybradford", "oliviachow"):
        d = tmp_path / handle
        d.mkdir()
        (d / "records.jsonl").write_text(
            json.dumps({"shortcode": "X", "kind": "position", "topic": "transit"}) + "\n"
        )
    from scripts import backfill_source_account
    monkeypatch.setattr(backfill_source_account, "DATA_DIR", tmp_path)
    summary = backfill_source_account.backfill_all()
    assert set(summary.keys()) == {"bradfordgrams", "beybradford", "oliviachow"}
    for handle, (repaired, total) in summary.items():
        assert repaired == 1 and total == 1
        first_row = json.loads(
            (tmp_path / handle / "records.jsonl").read_text().splitlines()[0]
        )
        assert first_row["source_account"] == handle


def test_backfill_handles_missing_records_file(tmp_path, monkeypatch):
    """A handle directory without records.jsonl should not crash; returns (0, 0)."""
    handle_dir = tmp_path / "newcandidate"
    handle_dir.mkdir()
    from scripts import backfill_source_account
    monkeypatch.setattr(backfill_source_account, "DATA_DIR", tmp_path)
    repaired, total = backfill_source_account.backfill_handle("newcandidate")
    assert repaired == 0 and total == 0
