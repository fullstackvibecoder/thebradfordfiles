"""Tests for scripts/lib/synthesis.py — pure helpers (no API calls)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import synthesis


def test_compute_input_records_hash_is_deterministic():
    records = [
        {"shortcode": "A", "topic": "transit", "summary": "x"},
        {"shortcode": "B", "topic": "transit", "summary": "y"},
    ]
    h1 = synthesis.compute_input_records_hash(records)
    h2 = synthesis.compute_input_records_hash(records)
    assert h1 == h2
    assert h1.startswith("sha256:")


def test_compute_input_records_hash_changes_with_content():
    records1 = [{"shortcode": "A", "topic": "transit", "summary": "x"}]
    records2 = [{"shortcode": "A", "topic": "transit", "summary": "y"}]
    assert synthesis.compute_input_records_hash(records1) != synthesis.compute_input_records_hash(records2)


def test_compute_input_records_hash_independent_of_order():
    a = {"shortcode": "A", "topic": "transit", "summary": "x"}
    b = {"shortcode": "B", "topic": "transit", "summary": "y"}
    assert synthesis.compute_input_records_hash([a, b]) == synthesis.compute_input_records_hash([b, a])


def test_collect_records_for_topic_filters_by_topic_and_kind(tmp_path, monkeypatch):
    handle_dir = tmp_path / "bradfordgrams"
    handle_dir.mkdir()
    (handle_dir / "candidate.json").write_text(json.dumps({
        "handle": "bradfordgrams", "slug": "bradford", "alias_handles": [],
    }))
    (handle_dir / "records.jsonl").write_text("\n".join([
        json.dumps({"shortcode": "P1", "kind": "position", "topic": "transit", "summary": "..."}),
        json.dumps({"shortcode": "P2", "kind": "position", "topic": "housing", "summary": "..."}),
        json.dumps({"shortcode": "A1", "kind": "action",   "topic": "transit", "summary": "..."}),
        json.dumps({"shortcode": "L1", "kind": "pledge",   "topic": "transit", "summary": "..."}),
        json.dumps({"shortcode": "Q1", "kind": "quote",    "topic": "transit", "summary": "..."}),
        json.dumps({"shortcode": "E1", "kind": "endorsement", "topic": "transit", "summary": "..."}),
    ]) + "\n")
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)
    out = synthesis.collect_records_for_topic("bradfordgrams", "transit")
    shortcodes = sorted(r["shortcode"] for r in out)
    assert shortcodes == ["A1", "L1", "P1"], "should keep position/pledge/action only, topic=transit only"


def test_collect_records_for_topic_merges_alias_handles(tmp_path, monkeypatch):
    primary = tmp_path / "bradfordgrams"
    primary.mkdir()
    (primary / "candidate.json").write_text(json.dumps({
        "handle": "bradfordgrams", "slug": "bradford", "alias_handles": ["beybradford"],
    }))
    (primary / "records.jsonl").write_text(
        json.dumps({"shortcode": "P1", "kind": "position", "topic": "transit"}) + "\n"
    )
    alias = tmp_path / "beybradford"
    alias.mkdir()
    (alias / "records.jsonl").write_text(
        json.dumps({"shortcode": "P2", "kind": "position", "topic": "transit"}) + "\n"
    )
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)
    out = synthesis.collect_records_for_topic("bradfordgrams", "transit")
    assert sorted(r["shortcode"] for r in out) == ["P1", "P2"]


def test_is_cache_valid_returns_true_when_all_keys_match():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
        "cache_namespace": "production-v1",
    }
    assert synthesis.is_cache_valid(cached, "sha256:abc", "sha256:xyz",
                                    "claude-opus-4-7", "production-v1")


def test_is_cache_valid_returns_false_on_records_change():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
        "cache_namespace": "production-v1",
    }
    assert not synthesis.is_cache_valid(cached, "sha256:DIFFERENT", "sha256:xyz",
                                        "claude-opus-4-7", "production-v1")


def test_is_cache_valid_returns_false_on_prompt_change():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
        "cache_namespace": "production-v1",
    }
    assert not synthesis.is_cache_valid(cached, "sha256:abc", "sha256:DIFFERENT",
                                        "claude-opus-4-7", "production-v1")


def test_is_cache_valid_returns_false_on_model_change():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
        "cache_namespace": "production-v1",
    }
    assert not synthesis.is_cache_valid(cached, "sha256:abc", "sha256:xyz",
                                        "claude-sonnet-4-6", "production-v1")


def test_is_cache_valid_handles_missing_keys():
    assert not synthesis.is_cache_valid({}, "h", "h", "m", "production-v1")


def test_is_cache_valid_returns_false_on_namespace_change():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
        "cache_namespace": "test",
    }
    assert not synthesis.is_cache_valid(
        cached, "sha256:abc", "sha256:xyz", "claude-opus-4-7", "production-v1"
    )


def test_cache_namespace_constant_is_production():
    assert synthesis.CACHE_NAMESPACE == "production-v1"


def test_system_prompt_hash_is_stable():
    h1 = synthesis.SYSTEM_PROMPT_HASH
    h2 = synthesis.compute_text_hash(synthesis.SYSTEM_PROMPT)
    assert h1 == h2
    assert h1.startswith("sha256:")


def test_system_prompt_forbids_em_dashes():
    assert "em dashes" in synthesis.SYSTEM_PROMPT
    assert "U+2014" in synthesis.SYSTEM_PROMPT


def test_synthesis_tool_schema_has_required_fields():
    schema = synthesis.SYNTHESIS_TOOL_SCHEMA
    assert schema["name"] == "emit_synthesis"
    props = schema["input_schema"]["properties"]
    assert set(props.keys()) >= {
        "summary", "consistency", "key_positions", "key_actions", "synthesis_skipped_reason"
    }
    assert props["consistency"]["properties"]["label"]["enum"] == ["consistent", "evolving", "shifted"]
    # Sprint 8A: synthesis_skipped_reason is now string-only with two valid values.
    # null is no longer permitted as a value — its absence on a real synthesis is
    # what the schema-validator interprets as success.
    assert props["synthesis_skipped_reason"]["enum"] == [
        "insufficient_data", "model_declined"
    ]
    assert props["synthesis_skipped_reason"]["type"] == ["string", "null"]
