"""Tests for scripts/synthesize.py — uses a fake Anthropic client."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import synthesize
from scripts.lib import synthesis


def _seed_candidate(tmp_path: Path, handle: str, slug: str, records: list[dict]):
    d = tmp_path / handle
    d.mkdir(parents=True, exist_ok=True)
    (d / "candidate.json").write_text(json.dumps({
        "handle": handle, "slug": slug, "alias_handles": [],
    }))
    (d / "records.jsonl").write_text(
        "\n".join(json.dumps(r) for r in records) + ("\n" if records else "")
    )


def _make_fake_client(tool_input: dict):
    """Return a MagicMock that mimics anthropic.Anthropic().messages.create."""
    fake_block = MagicMock()
    fake_block.type = "tool_use"
    fake_block.name = "emit_synthesis"
    fake_block.input = tool_input
    fake_response = MagicMock()
    fake_response.content = [fake_block]
    fake_response.stop_reason = "tool_use"
    client = MagicMock()
    client.messages.create.return_value = fake_response
    return client


def test_synthesize_writes_full_output_when_records_sufficient(tmp_path, monkeypatch):
    records = [
        {"shortcode": f"R{i}", "kind": "position", "topic": "transit",
         "summary": "supports TTC expansion", "post_date": f"2024-0{i+1}-01"}
        for i in range(7)
    ]
    _seed_candidate(tmp_path, "bradfordgrams", "bradford", records)
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)

    fake_tool_input = {
        "summary": "Bradford has consistently supported TTC expansion.",
        "consistency": {
            "label": "consistent",
            "stable_since": "2024-01",
            "changes": [],
        },
        "key_positions": [{"stance": "TTC expansion", "supporting_records": ["R0", "R1"]}],
        "key_actions": [],
        "synthesis_skipped_reason": None,
    }
    client = _make_fake_client(fake_tool_input)

    out_path = synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)
    assert out_path.exists()
    data = json.loads(out_path.read_text())
    assert data["candidate_handle"] == "bradfordgrams"
    assert data["topic"] == "transit"
    assert data["summary"] == "Bradford has consistently supported TTC expansion."
    assert data["consistency"]["label"] == "consistent"
    assert data["input_record_count"] == 7
    assert data["model"] == synthesis.MODEL
    assert data["input_records_hash"].startswith("sha256:")
    assert data["system_prompt_hash"] == synthesis.SYSTEM_PROMPT_HASH
    assert client.messages.create.call_count == 1


def test_synthesize_short_circuits_on_insufficient_data(tmp_path, monkeypatch):
    records = [
        {"shortcode": "R0", "kind": "position", "topic": "transit", "summary": "x"},
        {"shortcode": "R1", "kind": "position", "topic": "transit", "summary": "y"},
    ]
    _seed_candidate(tmp_path, "bradfordgrams", "bradford", records)
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)

    client = _make_fake_client({})  # should never be called
    out_path = synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)
    data = json.loads(out_path.read_text())
    assert data["summary"] is None
    assert data["consistency"] is None
    assert data["synthesis_skipped_reason"] == "insufficient_data"
    assert data["input_record_count"] == 2
    assert client.messages.create.call_count == 0


def test_synthesize_uses_cache_when_inputs_unchanged(tmp_path, monkeypatch):
    records = [
        {"shortcode": f"R{i}", "kind": "position", "topic": "transit", "summary": "x"}
        for i in range(7)
    ]
    _seed_candidate(tmp_path, "bradfordgrams", "bradford", records)
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)

    client = _make_fake_client({
        "summary": "ok", "consistency": {"label": "consistent", "stable_since": None, "changes": []},
        "key_positions": [], "key_actions": [], "synthesis_skipped_reason": None,
    })
    synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)
    synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)
    assert client.messages.create.call_count == 1, "second call should hit cache"


def test_synthesize_force_bypasses_cache(tmp_path, monkeypatch):
    records = [
        {"shortcode": f"R{i}", "kind": "position", "topic": "transit", "summary": "x"}
        for i in range(7)
    ]
    _seed_candidate(tmp_path, "bradfordgrams", "bradford", records)
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)

    client = _make_fake_client({
        "summary": "ok", "consistency": {"label": "consistent", "stable_since": None, "changes": []},
        "key_positions": [], "key_actions": [], "synthesis_skipped_reason": None,
    })
    synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)
    synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=True)
    assert client.messages.create.call_count == 2


def test_synthesize_invalidates_cache_on_records_change(tmp_path, monkeypatch):
    records = [
        {"shortcode": f"R{i}", "kind": "position", "topic": "transit", "summary": "x"}
        for i in range(7)
    ]
    _seed_candidate(tmp_path, "bradfordgrams", "bradford", records)
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)

    client = _make_fake_client({
        "summary": "ok", "consistency": {"label": "consistent", "stable_since": None, "changes": []},
        "key_positions": [], "key_actions": [], "synthesis_skipped_reason": None,
    })
    synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)

    # Add a new record — cache should invalidate
    records.append({"shortcode": "R7", "kind": "position", "topic": "transit", "summary": "z"})
    _seed_candidate(tmp_path, "bradfordgrams", "bradford", records)
    synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)
    assert client.messages.create.call_count == 2
