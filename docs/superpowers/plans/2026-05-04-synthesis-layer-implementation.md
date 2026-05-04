# Phase 7 — Synthesis Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-candidate × per-topic synthesis layer over the existing extracted records: 80–150 word summary, consistency label (consistent/evolving/shifted), key positions, key actions, with shortcode citations for every claim. Surface in `Said vs. Done` and as a landing-card dot.

**Architecture:** Pure read-through transform of `data/<handle>/records.jsonl`. New scripts (`synthesize.py`, `synthesize_all.py`, `lib/synthesis.py`) call Anthropic Opus 4.7 with a tool-use schema that locks output structure. Caching by `(records_hash, prompt_hash, model)` so reruns skip unchanged cells. Output lives at `data/<handle>/synthesis/<topic>.json`; consumed by `build_site.py` and rendered by the existing template chrome.

**Tech Stack:** Python 3.14, Anthropic SDK (already in `requirements.txt`), pytest. No new deps. Frontend stays vanilla HTML/CSS/JS.

---

## Pre-flight: confirm baseline

### Task 0: Verify baseline state

**Files:** read-only.

- [ ] **Step 1:** Confirm Phase 2-6 commits are present and tests still pass.

```bash
cd /Users/aramammo/thebradfordfiles
git log --oneline | head -25
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: 14 tests pass; recent commits include the synthesis spec at `6947b0f`.

- [ ] **Step 2:** Confirm record counts and dossier freshness.

```bash
wc -l data/bradfordgrams/records.jsonl data/oliviachow/records.jsonl data/beybradford/records.jsonl
ls -lh site/candidates/
```

Expected: Bradford 5,247 + Chow 470 + beybradford 188 = 5,905 records; dossier files dated 2026-05-03 21:29 or later.

- [ ] **Step 3:** Confirm `ANTHROPIC_API_KEY` is in `.env`.

```bash
grep -c "^ANTHROPIC_API_KEY=" .env
```

Expected: `1`.

---

# Phase 7A: Backend (Tasks 1–7)

## Task 1: Synthesis helpers with TDD

**Files:**
- Create: `scripts/lib/synthesis.py`
- Create: `tests/test_synthesis_helpers.py`

- [ ] **Step 1:** Write the failing tests.

`tests/test_synthesis_helpers.py`:

```python
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
    }
    assert synthesis.is_cache_valid(cached, "sha256:abc", "sha256:xyz", "claude-opus-4-7")


def test_is_cache_valid_returns_false_on_records_change():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
    }
    assert not synthesis.is_cache_valid(cached, "sha256:DIFFERENT", "sha256:xyz", "claude-opus-4-7")


def test_is_cache_valid_returns_false_on_prompt_change():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
    }
    assert not synthesis.is_cache_valid(cached, "sha256:abc", "sha256:DIFFERENT", "claude-opus-4-7")


def test_is_cache_valid_returns_false_on_model_change():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
    }
    assert not synthesis.is_cache_valid(cached, "sha256:abc", "sha256:xyz", "claude-sonnet-4-6")


def test_is_cache_valid_handles_missing_keys():
    assert not synthesis.is_cache_valid({}, "h", "h", "m")


def test_system_prompt_hash_is_stable():
    h1 = synthesis.SYSTEM_PROMPT_HASH
    h2 = synthesis.compute_text_hash(synthesis.SYSTEM_PROMPT)
    assert h1 == h2
    assert h1.startswith("sha256:")


def test_synthesis_tool_schema_has_required_fields():
    schema = synthesis.SYNTHESIS_TOOL_SCHEMA
    assert schema["name"] == "emit_synthesis"
    props = schema["input_schema"]["properties"]
    assert set(props.keys()) >= {
        "summary", "consistency", "key_positions", "key_actions", "synthesis_skipped_reason"
    }
    assert props["consistency"]["properties"]["label"]["enum"] == ["consistent", "evolving", "shifted"]
```

- [ ] **Step 2:** Run tests to verify they fail.

```bash
.venv/bin/python -m pytest tests/test_synthesis_helpers.py -v
```

Expected: ImportError on `scripts.lib.synthesis`.

- [ ] **Step 3:** Write `scripts/lib/synthesis.py`.

```python
"""Synthesis layer helpers — pure functions, no API calls.

Used by scripts/synthesize.py (single-cell) and scripts/synthesize_all.py
(batch driver). The companion module scripts/lib/candidates.py provides
candidate manifest discovery."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

# Record kinds that count as stance claims for synthesis input.
SYNTHESIS_INPUT_KINDS = {"position", "pledge", "action"}

# Minimum number of records required to attempt synthesis on a topic.
INSUFFICIENT_DATA_THRESHOLD = 5

MODEL = "claude-opus-4-7"

# The SYSTEM_PROMPT is the editorial contract. Editing it invalidates
# every cached synthesis (intentionally; see methodology page).
SYSTEM_PROMPT = """\
You are synthesizing a Toronto mayoral candidate's positions on a single
public-policy topic, based on their public Instagram content.

RULES:
1. Synthesize POSITIONS only. Do NOT characterize the candidate's intent,
   motivation, character, sincerity, or political identity.
2. Every claim about a stance, position, or change must cite at least one
   shortcode from the input records (in `supporting_records`).
3. If you detect a stance change, classify it as "shifted" only when the new
   stance directly contradicts the prior stance. Refinement or specificity
   is "evolving", not "shifted". The `changes` array is required for
   "shifted" and each entry must cite at least 2 supporting records.
4. If fewer than 5 substantive records exist on this topic, return
   synthesis_skipped_reason="insufficient_data" and null fields for
   summary and consistency.
5. Use the candidate's name (not pronouns) in the first sentence of summary.
6. The summary is 80–150 words, plain prose. No headers, no lists.
7. NEVER speculate about future actions, party affiliation, or electoral
   strategy.

OUTPUT: emit a single tool call (emit_synthesis) with the structured
fields. No prose outside the tool call.
"""


SYNTHESIS_TOOL_SCHEMA = {
    "name": "emit_synthesis",
    "description": "Emit the structured synthesis for one (candidate, topic) cell.",
    "input_schema": {
        "type": "object",
        "required": ["summary", "consistency", "key_positions", "key_actions",
                     "synthesis_skipped_reason"],
        "properties": {
            "summary": {
                "type": ["string", "null"],
                "description": "80–150 words plain prose, or null if insufficient_data.",
            },
            "consistency": {
                "type": ["object", "null"],
                "properties": {
                    "label": {"type": "string", "enum": ["consistent", "evolving", "shifted"]},
                    "stable_since": {"type": ["string", "null"]},
                    "changes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["from_stance", "to_stance",
                                         "approximate_date", "supporting_records"],
                            "properties": {
                                "from_stance": {"type": "string"},
                                "to_stance": {"type": "string"},
                                "approximate_date": {"type": "string"},
                                "supporting_records": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "minItems": 2,
                                },
                            },
                        },
                    },
                },
                "required": ["label", "changes"],
            },
            "key_positions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["stance", "supporting_records"],
                    "properties": {
                        "stance": {"type": "string"},
                        "supporting_records": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 1,
                        },
                    },
                },
            },
            "key_actions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["action", "supporting_records"],
                    "properties": {
                        "action": {"type": "string"},
                        "supporting_records": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 1,
                        },
                    },
                },
            },
            "synthesis_skipped_reason": {
                "type": ["string", "null"],
                "enum": [None, "insufficient_data"],
            },
        },
    },
}


def compute_text_hash(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


SYSTEM_PROMPT_HASH = compute_text_hash(SYSTEM_PROMPT)


def compute_input_records_hash(records: list[dict]) -> str:
    """Hash a normalized JSON of the records (sorted by shortcode) so order
    doesn't perturb the cache key."""
    sorted_records = sorted(records, key=lambda r: r.get("shortcode", ""))
    payload = json.dumps(sorted_records, ensure_ascii=False, sort_keys=True)
    return compute_text_hash(payload)


def _load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def collect_records_for_topic(handle: str, topic: str) -> list[dict]:
    """Return position/pledge/action records for the given (handle, topic),
    merging alias handles per the candidate manifest's alias_handles."""
    primary = DATA_DIR / handle
    manifest_path = primary / "candidate.json"
    if not manifest_path.exists():
        return []
    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError:
        return []
    handles = [handle] + list(manifest.get("alias_handles") or [])
    out: list[dict] = []
    for h in handles:
        path = DATA_DIR / h / "records.jsonl"
        for r in _load_jsonl(path):
            if r.get("kind") in SYNTHESIS_INPUT_KINDS and r.get("topic") == topic:
                out.append(r)
    return out


def is_cache_valid(cached: dict, current_records_hash: str,
                   current_prompt_hash: str, current_model: str) -> bool:
    if not cached:
        return False
    return (
        cached.get("input_records_hash") == current_records_hash
        and cached.get("system_prompt_hash") == current_prompt_hash
        and cached.get("model") == current_model
    )


def synthesis_path(handle: str, topic: str) -> Path:
    return DATA_DIR / handle / "synthesis" / f"{topic}.json"


def load_cached_synthesis(handle: str, topic: str) -> dict | None:
    path = synthesis_path(handle, topic)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None
```

- [ ] **Step 4:** Run tests; verify they pass.

```bash
.venv/bin/python -m pytest tests/test_synthesis_helpers.py -v
```

Expected: 11 passed.

- [ ] **Step 5:** Commit.

```bash
git add scripts/lib/synthesis.py tests/test_synthesis_helpers.py
git commit -m "feat: synthesis helpers (hash, cache, schema, record collection)"
```

## Task 2: `synthesize.py` single-cell driver with TDD

**Files:**
- Create: `scripts/synthesize.py`
- Create: `tests/test_synthesize.py`

- [ ] **Step 1:** Write failing tests using a fake Anthropic client (no real API calls).

`tests/test_synthesize.py`:

```python
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
```

- [ ] **Step 2:** Run tests; verify failure.

```bash
.venv/bin/python -m pytest tests/test_synthesize.py -v
```

Expected: ImportError on `scripts.synthesize`.

- [ ] **Step 3:** Write `scripts/synthesize.py`.

```python
#!/usr/bin/env python3
"""synthesize.py — synthesize one (candidate, topic) cell.

Usage:
    python scripts/synthesize.py --account bradfordgrams --topic transit
    python scripts/synthesize.py --account oliviachow --topic housing --force

Reads the candidate's records.jsonl (plus alias accounts), filters to the
topic, and either short-circuits with insufficient_data (<5 records) or
calls Opus with a tool-use schema-locked prompt. Output written to
data/<handle>/synthesis/<topic>.json. Caches by (records_hash,
prompt_hash, model) — reruns are no-ops unless something changed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import synthesis as _s  # type: ignore  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def _build_user_message(handle: str, topic: str, records: list[dict]) -> str:
    """Render the user-message payload that the model sees: candidate, topic,
    and a JSON-array of records. Each record is the raw extracted dict."""
    return json.dumps({
        "candidate_handle": handle,
        "topic": topic,
        "record_count": len(records),
        "records": records,
    }, ensure_ascii=False, indent=2)


def _extract_tool_input(response) -> dict:
    """Pull the emit_synthesis tool call out of an Anthropic response.
    Raises ValueError if the model didn't call the tool."""
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "emit_synthesis":
            return dict(block.input)
    raise ValueError("model did not emit emit_synthesis tool call")


def synthesize_one(handle: str, topic: str, *,
                   client=None, force: bool = False) -> Path:
    """Run synthesis for one (handle, topic) cell. Returns the output path.

    `client` is dependency-injected for testability; pass an
    anthropic.Anthropic instance in production. If None, build one from
    env on demand (see _default_client below)."""
    records = _s.collect_records_for_topic(handle, topic)
    out_path = _s.synthesis_path(handle, topic)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    records_hash = _s.compute_input_records_hash(records)

    # Short-circuit for insufficient data — skip Opus call entirely.
    if len(records) < _s.INSUFFICIENT_DATA_THRESHOLD:
        out = {
            "candidate_handle": handle,
            "candidate_slug": _candidate_slug(handle),
            "topic": topic,
            "summary": None,
            "consistency": None,
            "key_positions": [],
            "key_actions": [],
            "input_record_count": len(records),
            "input_records_hash": records_hash,
            "model": _s.MODEL,
            "system_prompt_hash": _s.SYSTEM_PROMPT_HASH,
            "synthesis_generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "synthesis_skipped_reason": "insufficient_data",
        }
        out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
        return out_path

    # Cache check.
    if not force:
        cached = _s.load_cached_synthesis(handle, topic)
        if _s.is_cache_valid(cached, records_hash, _s.SYSTEM_PROMPT_HASH, _s.MODEL):
            return out_path

    # Live call.
    if client is None:
        client = _default_client()

    response = client.messages.create(
        model=_s.MODEL,
        max_tokens=2048,
        system=_s.SYSTEM_PROMPT,
        tools=[_s.SYNTHESIS_TOOL_SCHEMA],
        tool_choice={"type": "tool", "name": "emit_synthesis"},
        messages=[{"role": "user", "content": _build_user_message(handle, topic, records)}],
    )

    tool_input = _extract_tool_input(response)
    out = {
        "candidate_handle": handle,
        "candidate_slug": _candidate_slug(handle),
        "topic": topic,
        "summary": tool_input.get("summary"),
        "consistency": tool_input.get("consistency"),
        "key_positions": tool_input.get("key_positions", []),
        "key_actions": tool_input.get("key_actions", []),
        "input_record_count": len(records),
        "input_records_hash": records_hash,
        "model": _s.MODEL,
        "system_prompt_hash": _s.SYSTEM_PROMPT_HASH,
        "synthesis_generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "synthesis_skipped_reason": tool_input.get("synthesis_skipped_reason"),
    }
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    return out_path


def _candidate_slug(handle: str) -> str:
    """Look up the slug from the manifest. Tests don't always seed slugs;
    fallback to the handle itself."""
    manifest_path = _s.DATA_DIR / handle / "candidate.json"
    if not manifest_path.exists():
        return handle
    try:
        m = json.loads(manifest_path.read_text())
    except json.JSONDecodeError:
        return handle
    return m.get("slug", handle)


def _default_client():
    from anthropic import Anthropic  # type: ignore
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY missing from env")
    return Anthropic(api_key=api_key)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--account", required=True, help="candidate handle, e.g. bradfordgrams")
    parser.add_argument("--topic", required=True, help="topic slug, e.g. transit")
    parser.add_argument("--force", action="store_true", help="bypass cache")
    args = parser.parse_args(argv)
    out = synthesize_one(args.account, args.topic, force=args.force)
    print(f"wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4:** Run tests; verify they pass.

```bash
.venv/bin/python -m pytest tests/test_synthesize.py -v
```

Expected: 5 passed.

- [ ] **Step 5:** Commit.

```bash
git add scripts/synthesize.py tests/test_synthesize.py
git commit -m "feat: synthesize.py single-cell driver with cache + insufficient-data short-circuit"
```

## Task 3: `synthesize_all.py` batch driver

**Files:**
- Create: `scripts/synthesize_all.py`

- [ ] **Step 1:** Write the script.

`scripts/synthesize_all.py`:

```python
#!/usr/bin/env python3
"""synthesize_all.py — batch driver: iterate all primary candidates ×
all known topics. Calls scripts.synthesize.synthesize_one per cell.

Topics are the same set as VALID_TOPICS in site/api/issue-vote.js. The
batch driver creates one Anthropic client and reuses it across calls.

Usage:
    python scripts/synthesize_all.py
    python scripts/synthesize_all.py --force
    python scripts/synthesize_all.py --handles bradfordgrams
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from synthesize import synthesize_one, _default_client  # type: ignore  # noqa: E402
from lib import candidates as _candidates  # type: ignore  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

# Must stay in sync with VALID_TOPICS in site/api/issue-vote.js.
TOPICS = [
    "housing", "transit", "safety_crime", "taxes_fiscal",
    "parks_environment", "infrastructure", "civic_engagement",
    "governance_ethics", "small_business_economy", "social_services",
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="bypass cache for every cell")
    parser.add_argument("--handles", nargs="*", default=None,
                        help="restrict to specific candidate handles")
    args = parser.parse_args(argv)

    primaries = _candidates.load_all_candidates()
    if args.handles:
        primaries = [p for p in primaries if p["handle"] in args.handles]
    if not primaries:
        print("[synthesize_all] no candidates found")
        return 0

    client = _default_client()
    total_cells = 0
    written_cells = 0
    skipped_cells = 0

    for manifest in primaries:
        handle = manifest["handle"]
        for topic in TOPICS:
            total_cells += 1
            try:
                out = synthesize_one(handle, topic, client=client, force=args.force)
                # Detect skip vs cache-hit vs fresh by mtime relative to before.
                # Simpler: re-read and check fields.
                import json as _json
                data = _json.loads(out.read_text())
                if data.get("synthesis_skipped_reason") == "insufficient_data":
                    skipped_cells += 1
                    print(f"  [skip] @{handle} · {topic} (insufficient data, "
                          f"{data['input_record_count']} records)")
                else:
                    written_cells += 1
                    label = (data.get("consistency") or {}).get("label", "?")
                    print(f"  [ok]   @{handle} · {topic} ({label}, "
                          f"{data['input_record_count']} records)")
            except Exception as e:
                print(f"  [err]  @{handle} · {topic}: {e!r}")

    print(f"\n  total: {total_cells} cells, {written_cells} synthesized, "
          f"{skipped_cells} skipped (insufficient data)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2:** Quick syntax check.

```bash
.venv/bin/python -c "import ast; ast.parse(open('scripts/synthesize_all.py').read()); print('ok')"
```

Expected: `ok`.

- [ ] **Step 3:** Commit.

```bash
git add scripts/synthesize_all.py
git commit -m "feat: synthesize_all.py batch driver across candidates × topics"
```

## Task 4: Run synthesis on real data (Bradford + Chow)

**Files:** none (data-only).

This is the only step that costs real money (~$10) and takes wall-clock time (~10 min).

- [ ] **Step 1:** Source `.env` and run the batch driver.

```bash
cd /Users/aramammo/thebradfordfiles
set -a && source ./.env && set +a
.venv/bin/python scripts/synthesize_all.py 2>&1 | tee synthesize-all.log
```

Expected (approximate):
- 20 cells total (2 candidates × 10 topics)
- ~12-18 synthesized, ~2-8 skipped (topics with <5 records)
- Wall-clock ~8-12 min
- Final summary line: `total: 20 cells, N synthesized, M skipped`

- [ ] **Step 2:** Spot-check one synthesized output.

```bash
cat data/bradfordgrams/synthesis/transit.json | python3 -m json.tool | head -25
```

Expected: a `summary` paragraph (80–150 words), `consistency.label` set, `key_positions` and `key_actions` arrays with `supporting_records` shortcodes.

- [ ] **Step 3:** Sanity-check cite-shortcode validity.

```bash
.venv/bin/python -c "
import json
from pathlib import Path
errors = 0
for path in Path('data').glob('*/synthesis/*.json'):
    data = json.loads(path.read_text())
    if data.get('synthesis_skipped_reason'): continue
    handle = data['candidate_handle']
    records_path = Path('data') / handle / 'records.jsonl'
    valid_codes = set()
    for line in records_path.read_text().splitlines():
        if line.strip():
            try:
                r = json.loads(line)
                if r.get('shortcode'): valid_codes.add(r['shortcode'])
            except: pass
    # Also include alias handles
    import json as _j
    manifest = _j.loads((Path('data') / handle / 'candidate.json').read_text())
    for alias in manifest.get('alias_handles', []):
        ap = Path('data') / alias / 'records.jsonl'
        if ap.exists():
            for line in ap.read_text().splitlines():
                if line.strip():
                    try:
                        r = json.loads(line)
                        if r.get('shortcode'): valid_codes.add(r['shortcode'])
                    except: pass
    cited = set()
    for kp in data.get('key_positions', []):
        cited.update(kp.get('supporting_records', []))
    for ka in data.get('key_actions', []):
        cited.update(ka.get('supporting_records', []))
    if data.get('consistency'):
        for ch in data['consistency'].get('changes', []):
            cited.update(ch.get('supporting_records', []))
    bogus = cited - valid_codes
    if bogus:
        print(f'  {path}: cites unknown shortcodes {sorted(bogus)[:3]}...')
        errors += 1
print(f'cite validation: {errors} files with bogus citations')
"
```

Expected: `cite validation: 0 files with bogus citations`. If non-zero, the LLM hallucinated a citation — flag it and report; the synthesis cell needs `--force` re-run.

- [ ] **Step 4:** Commit the synthesis outputs.

```bash
git add data/bradfordgrams/synthesis data/oliviachow/synthesis 2>/dev/null
git status --short data/
git commit -m "chore: initial synthesis outputs (bradford + chow × 10 topics)"
```

(No `data/beybradford/synthesis/` because beybradford is an alias — it has no slug and the batch driver only iterates primaries.)

## Task 5: `build_site.py` — fold synthesis into dossier (TDD)

**Files:**
- Modify: `scripts/build_site.py`
- Create: `tests/test_build_site_synthesis.py`

- [ ] **Step 1:** Write failing tests.

`tests/test_build_site_synthesis.py`:

```python
"""Tests for build_site.py synthesis integration."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _seed_synthesis(handle_dir: Path, topic: str, **fields):
    sd = handle_dir / "synthesis"
    sd.mkdir(parents=True, exist_ok=True)
    (sd / f"{topic}.json").write_text(json.dumps(fields))


def test_dossier_exposes_synthesis_under_meta(tmp_repo, run_build):
    """When a synthesis cell exists, build_site folds it into meta.synthesis."""
    # Add a synthesis cell to bradfordgrams (the existing tmp_repo seed only has
    # records, not synthesis output yet).
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    candidate_handle="bradfordgrams", candidate_slug="bradford",
                    topic="transit",
                    summary="Bradford supports TTC expansion.",
                    consistency={"label": "consistent", "stable_since": "2024-01", "changes": []},
                    key_positions=[{"stance": "TTC funding", "supporting_records": ["X"]}],
                    key_actions=[],
                    input_record_count=7,
                    synthesis_skipped_reason=None)
    # Re-run build (run_build fixture has already run once; do it again with fresh state)
    from scripts import build_site
    build_site.main([])
    bradford = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    assert "synthesis" in bradford["meta"]
    assert "transit" in bradford["meta"]["synthesis"]
    assert bradford["meta"]["synthesis"]["transit"]["summary"] == "Bradford supports TTC expansion."


def test_landing_card_has_consistency_dot_color(tmp_repo, run_build):
    """The landing card includes a consistency_dot computed from per-topic labels."""
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    consistency={"label": "consistent", "stable_since": "2024-01", "changes": []},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "housing",
                    consistency={"label": "evolving", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "safety_crime",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    # 3 topics with data, one is "evolving", none "shifted" → "yellow"
    assert bradford_card["consistency_dot"] == "yellow"


def test_landing_card_dot_red_when_any_topic_shifted(tmp_repo, run_build):
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    consistency={"label": "shifted", "stable_since": None,
                                 "changes": [{"from_stance": "x", "to_stance": "y",
                                              "approximate_date": "2024",
                                              "supporting_records": ["A", "B"]}]},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "housing",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "safety_crime",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    assert bradford_card["consistency_dot"] == "red"


def test_landing_card_dot_gray_when_too_few_topics(tmp_repo, run_build):
    """Fewer than 3 topics with data → gray."""
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    # Only one topic with synthesis data; rest are absent.
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    assert bradford_card["consistency_dot"] == "gray"


def test_skipped_synthesis_is_excluded_from_dot_calculation(tmp_repo, run_build):
    """Topics with synthesis_skipped_reason='insufficient_data' don't count toward
    the dot threshold."""
    for topic in ("transit", "housing", "safety_crime"):
        _seed_synthesis(tmp_repo / "data" / "bradfordgrams", topic,
                        consistency=None, synthesis_skipped_reason="insufficient_data")
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    assert bradford_card["consistency_dot"] == "gray"
```

- [ ] **Step 2:** Run tests; verify failure.

```bash
.venv/bin/python -m pytest tests/test_build_site_synthesis.py -v
```

Expected: AttributeError or KeyError on missing `synthesis` field / missing `consistency_dot`.

- [ ] **Step 3:** Edit `scripts/build_site.py`. Add a synthesis loader near the top (after `_load_matches`):

```python
SYNTHESIS_DIR_NAME = "synthesis"


def _load_synthesis_for_handle(handle: str) -> dict[str, dict]:
    """Return {topic: synthesis_object} for a handle. Empty if no synthesis dir."""
    synth_dir = DATA_DIR / handle / SYNTHESIS_DIR_NAME
    if not synth_dir.is_dir():
        return {}
    out: dict[str, dict] = {}
    for path in sorted(synth_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        topic = data.get("topic") or path.stem
        out[topic] = data
    return out


def _consistency_dot_color(synthesis_by_topic: dict[str, dict]) -> str:
    """Compute the landing-card dot color from per-topic consistency labels.

    - "green"  — all topics with synthesis data are "consistent"
    - "yellow" — at least one is "evolving"; none are "shifted"
    - "red"    — at least one is "shifted"
    - "gray"   — fewer than 3 topics meet the data threshold (i.e. fewer than 3
                 topics have non-skipped synthesis).
    """
    with_data = [s for s in synthesis_by_topic.values()
                 if not s.get("synthesis_skipped_reason")
                 and s.get("consistency")]
    if len(with_data) < 3:
        return "gray"
    labels = [s["consistency"]["label"] for s in with_data]
    if any(l == "shifted" for l in labels):
        return "red"
    if any(l == "evolving" for l in labels):
        return "yellow"
    return "green"
```

- [ ] **Step 4:** Wire it into `_candidate_dossier(...)` and `_landing_card(...)`. Inside `_candidate_dossier`, after the `triages.append(t)` loop and before the `return {...}`, add:

```python
    synthesis_by_topic = _load_synthesis_for_handle(handle)
```

Then in the `meta` dict assembly inside `_candidate_dossier`, add:

```python
            "synthesis": synthesis_by_topic,
            "consistency_dot": _consistency_dot_color(synthesis_by_topic),
```

In `_landing_card(...)`, add `consistency_dot`:

```python
def _landing_card(dossier: dict) -> dict:
    m = dossier["meta"]
    return {
        "slug": m["slug"],
        ...existing fields...,
        "consistency_dot": m.get("consistency_dot", "gray"),
    }
```

- [ ] **Step 5:** Run tests.

```bash
.venv/bin/python -m pytest tests/test_build_site_synthesis.py tests/test_build_site.py -v
```

Expected: all (4 + 5 = 9) pass.

- [ ] **Step 6:** Run the full test suite to confirm nothing else broke.

```bash
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -5
```

Expected: 25 tests pass (14 prior + 11 helper tests + 5 synthesize tests + 5 new synthesis-build tests = 35... actually counts vary; just verify 0 failures).

- [ ] **Step 7:** Commit.

```bash
git add scripts/build_site.py tests/test_build_site_synthesis.py
git commit -m "feat: build_site folds synthesis into dossier + computes landing dot"
```

---

# Phase 7B: Frontend (Tasks 6–8)

## Task 6: Render synthesis in the candidate template

**Files:**
- Modify: `site/candidate-template.html`

The template's `renderSaidDone(...)` already iterates per-topic blocks. We add three things INSIDE each topic block, BEFORE the existing two-column "Said" / "Done" cols:
1. The synthesis paragraph (`summary`).
2. The consistency badge (pill in topic header).
3. Clickable `[N]` superscripts for citations (only on `key_positions` / `key_actions` items, since `summary` is plain prose).

If `record.synthesis_skipped_reason === "insufficient_data"` for the topic, render nothing.

- [ ] **Step 1:** Locate the topic-block construction.

```bash
grep -n "renderSaidDone\|byTopic\[t\]\|topic block" /Users/aramammo/thebradfordfiles/site/candidate-template.html
```

- [ ] **Step 2:** In `renderSaidDone(...)`, find where each topic's `block` element is created and just before `block.appendChild(cols)`, insert a call to a new helper `appendTopicSynthesis(block, topic)`.

The exact edit (use `Edit` tool with sufficient context). Find:

```javascript
    block.appendChild(cols);
    block.appendChild(renderTopicVoteWidget(t));
    wrap.appendChild(block);
```

Replace with:

```javascript
    appendTopicSynthesis(block, t);
    block.appendChild(cols);
    block.appendChild(renderTopicVoteWidget(t));
    wrap.appendChild(block);
```

- [ ] **Step 3:** Add the `appendTopicSynthesis` helper. Insert immediately before the `function renderTopicVoteWidget(...)` definition:

```javascript
function appendTopicSynthesis(blockEl, topic) {
  // DATA.meta.synthesis is the per-topic dict folded in by build_site.py.
  const all = (DATA.meta && DATA.meta.synthesis) || {};
  const s = all[topic];
  if (!s) return;
  if (s.synthesis_skipped_reason) return;  // insufficient_data: hide the block
  const wrap = el("div", {style:"background:#fcfcfd;border-left:3px solid #1a4480;padding:14px 18px;margin:12px 0"});
  // Consistency badge
  if (s.consistency && s.consistency.label) {
    const badge = renderConsistencyBadge(s.consistency);
    wrap.appendChild(badge);
  }
  // Summary paragraph
  if (s.summary) {
    wrap.appendChild(el("p", {style:"font-size:14px;line-height:1.55;color:#1b1b1b;margin-top:8px"},
      s.summary));
  }
  // Key positions and actions, with superscript citations
  if (s.key_positions && s.key_positions.length) {
    wrap.appendChild(renderCitedList("Key positions", s.key_positions, "stance"));
  }
  if (s.key_actions && s.key_actions.length) {
    wrap.appendChild(renderCitedList("Key actions", s.key_actions, "action"));
  }
  // Detected stance change subsection
  if (s.consistency && s.consistency.label === "shifted" && s.consistency.changes) {
    wrap.appendChild(renderStanceChanges(s.consistency.changes));
  }
  blockEl.appendChild(wrap);
}

function renderConsistencyBadge(consistency) {
  const styles = {
    consistent: "background:#d3eecd;color:#1a5b1a;border-color:#1a5b1a",
    evolving:   "background:#fff4d3;color:#8a5a00;border-color:#b58a32",
    shifted:    "background:#f8d7d7;color:#7a1212;border-color:#b50909",
  };
  const labels = {
    consistent: "✓ Consistent",
    evolving:   "↻ Evolving",
    shifted:    "⚠ Shifted",
  };
  const lbl = labels[consistency.label] || consistency.label;
  const since = consistency.stable_since ? ` since ${consistency.stable_since}` : "";
  const text = consistency.label === "consistent" ? lbl + since : lbl;
  return el("span", {
    style: `display:inline-block;padding:3px 9px;font:700 11px ui-monospace,monospace;letter-spacing:0.05em;border:1px solid ${styles[consistency.label] || ""};` + (styles[consistency.label] || ""),
  }, text);
}

function renderCitedList(title, items, claimKey) {
  const wrap = el("div", {style:"margin-top:10px"});
  wrap.appendChild(el("div", {style:"font:700 10px ui-monospace,monospace;letter-spacing:0.1em;color:#666;text-transform:uppercase;margin-bottom:4px"}, title));
  const ul = el("ul", {style:"margin:0;padding-left:18px;font-size:13px;color:#1b1b1b"});
  for (const item of items) {
    const li = el("li", {style:"margin-bottom:3px"});
    li.appendChild(document.createTextNode(item[claimKey] || ""));
    li.appendChild(document.createTextNode(" "));
    for (const sc of (item.supporting_records || [])) {
      const sup = el("a", {
        href: "#record-" + sc,
        style: "color:#0050d8;font-size:10px;text-decoration:none;margin-right:2px",
        title: "shortcode " + sc,
      }, "[" + sc.slice(0, 6) + "]");
      sup.addEventListener("click", e => {
        e.preventDefault();
        const target = document.getElementById("record-" + sc);
        if (target) {
          target.scrollIntoView({behavior:"smooth", block:"center"});
          target.style.outline = "2px solid #da291c";
          setTimeout(() => target.style.outline = "", 1800);
        }
      });
      li.appendChild(sup);
    }
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}

function renderStanceChanges(changes) {
  const wrap = el("div", {style:"margin-top:10px;padding:8px 10px;background:#fff4f4;border:1px dashed #b50909;font-size:12.5px"});
  wrap.appendChild(el("div", {style:"font:700 10px ui-monospace,monospace;color:#b50909;letter-spacing:0.05em;text-transform:uppercase"},
    "Detected stance change"));
  const ul = el("ul", {style:"margin:6px 0 0;padding-left:18px;color:#1b1b1b"});
  for (const c of changes) {
    const li = el("li", {style:"margin-bottom:4px"});
    li.appendChild(document.createTextNode(`From: "${c.from_stance}" → To: "${c.to_stance}" (${c.approximate_date}) `));
    for (const sc of (c.supporting_records || [])) {
      const sup = el("a", {
        href: "#record-" + sc,
        style: "color:#b50909;font-size:10px;text-decoration:none;margin-right:2px",
      }, "[" + sc.slice(0, 6) + "]");
      sup.addEventListener("click", e => {
        e.preventDefault();
        const target = document.getElementById("record-" + sc);
        if (target) target.scrollIntoView({behavior:"smooth", block:"center"});
      });
      li.appendChild(sup);
    }
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  return wrap;
}
```

- [ ] **Step 4:** The citations target elements with `id="record-<shortcode>"`. The existing record-card render needs to set that id. Find the function that builds a record card (search for `class:"card"` near where individual records render — likely `renderCard` or similar). Add the id attribute. Find the existing `el("div", {class: "card", ...},` (or similar) inside the record-card-builder function. Add `id: "record-" + record.shortcode,` to its attrs.

If the existing function uses a parent wrapper instead of the card itself, set the id on the wrapper. The minimum requirement: each record's DOM has a stable id derived from its shortcode.

- [ ] **Step 5:** Smoke-test build. After this edit the build should still work and the rendered page should reference the synthesis content.

```bash
.venv/bin/python scripts/build_site.py 2>&1 | tail -5
grep -c "appendTopicSynthesis\|renderConsistencyBadge\|Key positions" site/bradford/index.html
```

Expected: ≥3 (the helpers and section labels are present in the rendered HTML — substring search finds them in the script body).

- [ ] **Step 6:** **NO `innerHTML`** — verify.

```bash
grep -c "innerHTML" site/candidate-template.html
```

Expected: `0`.

- [ ] **Step 7:** Commit.

```bash
git add site/candidate-template.html
git commit -m "feat: render synthesis paragraph + consistency badge + cited claims in Said-vs-Done"
```

## Task 7: Landing card consistency dot

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1:** Find the card render code in `site/index.html`.

```bash
grep -n "card-name\|card-cta" /Users/aramammo/thebradfordfiles/site/index.html
```

- [ ] **Step 2:** In the card-rendering loop (the `for (const c of d.candidates)` block), insert a small consistency dot beside the candidate name. Find:

```javascript
    card.appendChild(el("div", {class:"card-name"}, c.display_name));
```

Replace with:

```javascript
    const nameWrap = el("div", {class:"card-name", style:"display:flex;align-items:center;gap:8px"});
    nameWrap.appendChild(document.createTextNode(c.display_name));
    if (c.consistency_dot) nameWrap.appendChild(renderConsistencyDot(c.consistency_dot));
    card.appendChild(nameWrap);
```

- [ ] **Step 3:** Add the `renderConsistencyDot` helper. Insert it after the existing `function fmt2023(...)` definition (or anywhere near the other small helpers in the script):

```javascript
function renderConsistencyDot(state) {
  const colors = {
    green:  "#1a5b1a",
    yellow: "#b58a32",
    red:    "#b50909",
    gray:   "#999",
  };
  const tooltips = {
    green:  "Consistent across all topics with sufficient data",
    yellow: "Some topics show evolving stances",
    red:    "At least one topic shows a contradicted prior stance",
    gray:   "Insufficient data on enough topics for an overall reading",
  };
  const dot = document.createElement("span");
  dot.title = (tooltips[state] || "") + " — see methodology";
  dot.setAttribute("aria-label", tooltips[state] || state);
  dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${colors[state] || "#ccc"};cursor:help`;
  return dot;
}
```

- [ ] **Step 4:** Smoke-test build and inspect.

```bash
.venv/bin/python scripts/build_site.py 2>&1 | tail -3
.venv/bin/python -c "
import json
d = json.load(open('site/landing.json'))
for c in d['candidates']:
    print(f'  {c[\"surname\"]}: dot={c.get(\"consistency_dot\", \"<missing>\")}')"
```

Expected: each candidate prints a dot color (one of `green`, `yellow`, `red`, `gray`).

- [ ] **Step 5:** **NO `innerHTML`** — verify.

```bash
grep -c "innerHTML" site/index.html
```

Expected: `0`.

- [ ] **Step 6:** Commit.

```bash
git add site/index.html
git commit -m "feat: landing-card consistency dot (4-state semaphore)"
```

## Task 8: Methodology page — synthesis disclosure

**Files:**
- Modify: `site/methodology/index.html`

- [ ] **Step 1:** Read the current methodology page.

```bash
cat /Users/aramammo/thebradfordfiles/site/methodology/index.html
```

- [ ] **Step 2:** Append a Synthesis section. Use `Edit` to find `<h2>Corrections</h2>` and replace with the synthesis section + the corrections section (preserving the original):

```html
<h2>Synthesis (per topic, per candidate)</h2>
<p>Each candidate's <em>Said vs. Done</em> tab includes an LLM-generated synthesis paragraph per policy topic, plus a consistency label and cited evidence. The system prompt that generates these is reproduced in full so anyone can audit how syntheses are derived:</p>
<pre style="background:#f3f3f3;padding:12px;font-size:11.5px;line-height:1.4;overflow-x:auto;white-space:pre-wrap">You are synthesizing a Toronto mayoral candidate's positions on a single
public-policy topic, based on their public Instagram content.

RULES:
1. Synthesize POSITIONS only. Do NOT characterize the candidate's intent,
   motivation, character, sincerity, or political identity.
2. Every claim about a stance, position, or change must cite at least one
   shortcode from the input records (in `supporting_records`).
3. If you detect a stance change, classify it as "shifted" only when the new
   stance directly contradicts the prior stance. Refinement or specificity
   is "evolving", not "shifted". The `changes` array is required for
   "shifted" and each entry must cite at least 2 supporting records.
4. If fewer than 5 substantive records exist on this topic, return
   synthesis_skipped_reason="insufficient_data" and null fields for
   summary and consistency.
5. Use the candidate's name (not pronouns) in the first sentence of summary.
6. The summary is 80–150 words, plain prose. No headers, no lists.
7. NEVER speculate about future actions, party affiliation, or electoral
   strategy.

OUTPUT: emit a single tool call (emit_synthesis) with the structured
fields. No prose outside the tool call.</pre>
<ul>
<li><strong>Model</strong>: Claude Opus 4.7</li>
<li><strong>Insufficient-data threshold</strong>: 5 records (kind = position/pledge/action) for a topic. Below this, no synthesis is shown.</li>
<li><strong>Stance-change bar</strong>: a "shifted" label requires at least 2 supporting records that demonstrate the contradiction.</li>
<li><strong>Cache rule</strong>: synthesis regenerates only when the underlying records change, the system prompt changes, or the model changes. The cache key is sha256(records) + sha256(prompt) + model.</li>
<li><strong>Bradford alias</strong>: records from <code>@beybradford</code> (his councillor archive account) are merged into Bradford's main dossier and participate in synthesis input.</li>
<li><strong>Always verify against sources</strong>: synthesis is generated by an LLM; cited shortcodes are the primary source. If a synthesis claim doesn't match its cited record, the record wins.</li>
</ul>

<h2>Landing-card consistency dot</h2>
<p>Each candidate's card on the landing page shows a small dot encoding overall consistency:</p>
<ul>
<li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1a5b1a"></span> <strong>Green</strong> — all topics with synthesis data are consistent.</li>
<li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#b58a32"></span> <strong>Yellow</strong> — at least one topic is evolving; none are shifted.</li>
<li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#b50909"></span> <strong>Red</strong> — at least one topic shows a contradicted prior stance.</li>
<li><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#999"></span> <strong>Gray</strong> — fewer than 3 topics have synthesis data.</li>
</ul>

<h2>Corrections</h2>
```

- [ ] **Step 3:** Smoke-test.

```bash
grep -c "synthesis_skipped_reason\|stance change" site/methodology/index.html
```

Expected: ≥3.

- [ ] **Step 4:** Commit.

```bash
git add site/methodology/index.html
git commit -m "docs: methodology page discloses synthesis prompt + dot rules"
```

---

# Phase 7C: Pipeline + verify (Tasks 9–10)

## Task 9: Wire `synthesize_all` into `build_all.sh`

**Files:**
- Modify: `scripts/build_all.sh`

- [ ] **Step 1:** Edit the script. Insert the synthesis step between `match_votes` and `build_site`. Read current content first:

```bash
cat /Users/aramammo/thebradfordfiles/scripts/build_all.sh
```

- [ ] **Step 2:** Replace the contents:

```bash
#!/usr/bin/env bash
# Full build: ingest votes -> match -> synthesize -> build site. Run from repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
echo "==> ingest_votes"
.venv/bin/python scripts/ingest_votes.py
echo "==> match_votes"
.venv/bin/python scripts/match_votes.py
echo "==> synthesize_all"
.venv/bin/python scripts/synthesize_all.py
echo "==> build_site"
.venv/bin/python scripts/build_site.py
echo "==> done"
```

- [ ] **Step 3:** Verify it's still executable and runs end-to-end. Synthesis step should be a near-no-op since Task 4 already ran (cache hit).

```bash
chmod +x scripts/build_all.sh
./scripts/build_all.sh 2>&1 | tail -25
```

Expected: synthesize_all reports `total: 20 cells, 0 synthesized, ...` (because everything is cached) — actually it will report N synthesized even on cache hits because the printout doesn't distinguish; just confirm no errors.

- [ ] **Step 4:** Commit.

```bash
git add scripts/build_all.sh
git commit -m "feat: build_all.sh runs synthesize_all between match and build"
```

## Task 10: Final verification + Phase 7 preview deploy

**Files:** none (deploy + visual check).

- [ ] **Step 1:** Confirm the full test suite still passes.

```bash
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: all tests pass (count varies; should be ~30 after this plan, no failures).

- [ ] **Step 2:** Inspect a real synthesis output and confirm citations validate.

```bash
.venv/bin/python -c "
import json
d = json.load(open('data/bradfordgrams/synthesis/transit.json'))
print('summary:', (d.get('summary') or '')[:200])
print('label:', (d.get('consistency') or {}).get('label'))
print('record_count:', d.get('input_record_count'))
print('skipped:', d.get('synthesis_skipped_reason'))
"
```

Expected: a coherent 1-sentence-ish preview, a label set, record count > 5, skipped is None.

- [ ] **Step 3:** Smoke-test the candidate page locally.

```bash
cd site && python3 -m http.server 8765 >/dev/null 2>&1 &
SRV=$!
sleep 1
/usr/bin/curl -s http://localhost:8765/bradford/ | grep -c "Detected stance change\|Key positions\|Consistent" || true
kill $SRV 2>/dev/null
cd ..
```

Expected: ≥1 (synthesis content visible in the rendered HTML, or none if no shifted topics — at minimum the helper code is bundled and "Key positions" or "Consistent" appears as a label in the static HTML body).

- [ ] **Step 4:** Commit the rebuilt site files (the Task-9 build run modified them).

```bash
git status site/
git add site/landing.json site/data.json site/candidates site/bradford site/chow
git diff --cached --stat | tail -3
git commit -m "chore: rebuild site/ with synthesis layer"
```

- [ ] **Step 5:** Deploy as Vercel preview (matches your "no prod until domain ready" preference).

```bash
cd site && vercel --yes 2>&1 | tail -8
cd ..
```

- [ ] **Step 6:** Manual review checklist (you, the operator). For at least 5 synthesis outputs:
  - Open the preview URL → click into a candidate → scroll to a topic block in `Said vs. Done`.
  - Confirm: synthesis paragraph reads as positions-only (no character claims).
  - Confirm: the consistency badge label matches the prose ("Consistent since 2019" should not contradict the summary).
  - Click a `[shortcode]` superscript → confirm it scrolls to a real record card.
  - On the landing page → confirm the dot color makes sense given what you see on the candidate page.
  - If anything looks off, file an issue against the spec — synthesis content is the single most editorially-loaded part of this site.

- [ ] **Step 7:** Push.

```bash
git push origin main
```

**Phase 7 milestone reached.** Synthesis layer live as preview. Production deploy bundled with Phase 4-6 when domain is ready.

---

## Self-review

**Spec coverage check:**
- ✅ Output schema (Task 1: `SYNTHESIS_TOOL_SCHEMA`, Task 2: synthesize_one writes the dossier file)
- ✅ Insufficient-data short-circuit (Task 2 / Step 3 in synthesize_one + tests)
- ✅ Cache by (records_hash, prompt_hash, model) (Task 1: `is_cache_valid`, Task 2: `synthesize_one` uses it)
- ✅ Anti-bias system prompt (Task 1: `SYSTEM_PROMPT` constant, used in Task 2)
- ✅ Tool-use schema enforcement (Task 1: `SYNTHESIS_TOOL_SCHEMA`, Task 2: `tool_choice={"type":"tool","name":"emit_synthesis"}`)
- ✅ Bradford alias merging (Task 1: `collect_records_for_topic` reads `alias_handles`)
- ✅ Build pipeline integration (Task 5: `build_site.py` folds synthesis; Task 9: `build_all.sh` adds the step)
- ✅ Said-vs-Done synthesis paragraph + badge + citations (Task 6)
- ✅ Landing-card 4-state consistency dot (Task 5: pure-function tests; Task 7: render)
- ✅ Methodology page disclosure (Task 8)
- ✅ Final ~$10 / ~10 min batch run (Task 4)

**Placeholder scan:**
- No "TBD", "TODO", "implement later", "fill in details".
- Every code block contains complete code.
- Every command has expected output.
- Manual UI checks in Task 10 are explicit and specific.

**Type consistency:**
- `MODEL = "claude-opus-4-7"` defined in `scripts/lib/synthesis.py` and consumed by `scripts/synthesize.py` via `_s.MODEL`.
- `SYSTEM_PROMPT_HASH` computed once in lib, used in synthesize.py and tests.
- Cache key shape: `(input_records_hash, system_prompt_hash, model)` is consistent across `is_cache_valid`, the synthesis output dict, and the spec.
- `synthesis_skipped_reason` enum: only `"insufficient_data"` defined; consistent in spec, lib, synthesize.py, tests, and frontend (which checks for truthy value to hide).
- Consistency label enum: `consistent` / `evolving` / `shifted` consistent in spec, schema, methodology page, frontend renderConsistencyBadge.
- Consistency dot states: `green` / `yellow` / `red` / `gray` consistent in `_consistency_dot_color`, `renderConsistencyDot`, and methodology page.
- Topic slug list: same 10 topics in `synthesize_all.TOPICS`, spec, and `site/api/issue-vote.js` `VALID_TOPICS`.
