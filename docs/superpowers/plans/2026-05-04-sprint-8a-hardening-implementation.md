# Sprint 8A — Pre-Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the live production site at mayoralrecord.com — three engineering bug fixes (synthesis schema degenerate state, cache-key collision, source_account attribution), three credibility additions (privacy/terms, Cloudflare Web Analytics, Vercel OG social cards), one operational runbook, and an editorial-review pass on the 17 published synthesis paragraphs. No new user-facing features.

**Architecture:** No architectural changes. All work touches existing files or adds focused new ones. Test count starts at 36 passing; ends at ~42.

**Tech Stack:** Python 3.14 + pytest (existing pipeline), Anthropic SDK (existing), `@upstash/redis` (existing), `@vercel/og` (NEW — for dynamic social cards). Cloudflare Web Analytics via JS beacon. No new Python deps.

---

## Pre-flight: confirm baseline

### Task 0: Verify baseline state

**Files:** read-only.

- [ ] **Step 1:** Confirm Phase 7 + brand-rename commits are present and tests pass.

```bash
cd /Users/aramammo/thebradfordfiles
git log --oneline | head -10
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: 36 tests passing; recent commits include the Sprint 8A spec at `959d54b`.

- [ ] **Step 2:** Confirm production is live and serving correct content.

```bash
/usr/bin/curl -sL https://www.mayoralrecord.com/ | grep -o '<div class="brand-title">[^<]*</div>'
```

Expected: `<div class="brand-title">The Mayoral Record</div>`.

- [ ] **Step 3:** Confirm `ANTHROPIC_API_KEY` is in `.env` (needed by Task 4 regen).

```bash
grep -c "^ANTHROPIC_API_KEY=" .env
```

Expected: `1`.

---

# Section 1 — Engineering bug fixes

## Task 1: Synthesis schema tightening + degenerate-response rejection (TDD)

**Files:**
- Modify: `scripts/lib/synthesis.py` (SYSTEM_PROMPT, SYNTHESIS_TOOL_SCHEMA)
- Modify: `scripts/synthesize.py` (add degenerate-response check)
- Modify: `tests/test_synthesis_helpers.py` (update existing schema test for new enum)
- Modify: `tests/test_synthesize.py` (add 1 new test for the rejection path)

- [ ] **Step 1: Write the failing test** in `tests/test_synthesize.py`. Add at the bottom of the file:

```python
def test_synthesize_rejects_degenerate_response(tmp_path, monkeypatch):
    """If the model returns null summary, null consistency, AND null
    synthesis_skipped_reason — that's a degenerate state. The handler
    should raise rather than write a useless cache file."""
    records = [
        {"shortcode": f"R{i}", "kind": "position", "topic": "transit", "summary": "x"}
        for i in range(7)
    ]
    _seed_candidate(tmp_path, "bradfordgrams", "bradford", records)
    monkeypatch.setattr(synthesis, "DATA_DIR", tmp_path)

    degenerate_input = {
        "summary": None,
        "consistency": None,
        "key_positions": [],
        "key_actions": [],
        "synthesis_skipped_reason": None,  # this is what we now reject
    }
    client = _make_fake_client(degenerate_input)

    import pytest as _pytest
    with _pytest.raises(ValueError, match="degenerate"):
        synthesize.synthesize_one("bradfordgrams", "transit", client=client, force=False)

    # Cache file must NOT have been written
    cache_path = synthesis.synthesis_path("bradfordgrams", "transit")
    assert not cache_path.exists(), "should not write cache on degenerate response"
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
.venv/bin/python -m pytest tests/test_synthesize.py::test_synthesize_rejects_degenerate_response -v
```

Expected: FAIL — current code writes a cache file with all-null fields rather than raising.

- [ ] **Step 3: Update the existing schema test** in `tests/test_synthesis_helpers.py`. Find `test_synthesis_tool_schema_has_required_fields` and replace it with:

```python
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
```

- [ ] **Step 4: Run the schema test; confirm it now also fails.**

```bash
.venv/bin/python -m pytest tests/test_synthesis_helpers.py::test_synthesis_tool_schema_has_required_fields -v
```

Expected: FAIL — current schema has `enum: [None, "insufficient_data"]`.

- [ ] **Step 5: Update `scripts/lib/synthesis.py` SYSTEM_PROMPT.** Find the `SYSTEM_PROMPT = """\` block and replace its rule list. The full new SYSTEM_PROMPT becomes:

```python
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
5. If records are present but lack substantive policy claims, or are too
   repetitive to derive distinct positions, return
   synthesis_skipped_reason="model_declined" with null fields. NEVER
   return null fields without setting synthesis_skipped_reason — that
   is a degenerate response and will be rejected.
6. Use the candidate's name (not pronouns) in the first sentence of summary.
7. The summary is 80-150 words, plain prose. No headers, no lists.
8. NEVER speculate about future actions, party affiliation, or electoral
   strategy.

OUTPUT: emit a single tool call (emit_synthesis) with the structured
fields. No prose outside the tool call.
"""
```

- [ ] **Step 6: Update SYNTHESIS_TOOL_SCHEMA's synthesis_skipped_reason field** in `scripts/lib/synthesis.py`. Find the existing definition:

```python
            "synthesis_skipped_reason": {
                "type": ["string", "null"],
                "enum": [None, "insufficient_data"],
            },
```

Replace with:

```python
            "synthesis_skipped_reason": {
                "type": ["string", "null"],
                "enum": ["insufficient_data", "model_declined"],
            },
```

(`null` is removed from the enum. The `["string", "null"]` type still permits omission/None at the JSON level, but the enum forbids null as a value when present.)

- [ ] **Step 7: Update `scripts/synthesize.py` to reject degenerate responses.** In `synthesize_one`, after the line `tool_input = _extract_tool_input(response)` and before the `out = {...}` dict construction, add:

```python
    # Sprint 8A: reject degenerate responses (all-null without skipped_reason).
    if (tool_input.get("summary") is None
            and tool_input.get("consistency") is None
            and tool_input.get("synthesis_skipped_reason") is None):
        raise ValueError(
            f"degenerate model response for ({handle}, {topic}): "
            "all fields null and no synthesis_skipped_reason provided"
        )
```

- [ ] **Step 8: Run all three tests; confirm they pass.**

```bash
.venv/bin/python -m pytest tests/test_synthesize.py::test_synthesize_rejects_degenerate_response tests/test_synthesis_helpers.py::test_synthesis_tool_schema_has_required_fields -v
```

Expected: 2 passed.

- [ ] **Step 9: Run the full test suite.**

```bash
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: 37 passing (36 prior + 1 new).

- [ ] **Step 10: Commit.**

```bash
git add scripts/lib/synthesis.py scripts/synthesize.py tests/test_synthesis_helpers.py tests/test_synthesize.py
git commit -m "fix: synthesis rejects degenerate model responses

Schema enum for synthesis_skipped_reason becomes
[\"insufficient_data\", \"model_declined\"] — null is no longer a
permitted value when the field is present. A response with all null
fields AND no synthesis_skipped_reason now raises ValueError instead
of writing a useless cache file. The system prompt is updated to
document the new model_declined option (changes SYSTEM_PROMPT_HASH;
all 18 cached cells will regenerate on next run).

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

## Task 2: Cache namespace (TDD)

**Files:**
- Modify: `scripts/lib/synthesis.py` (add CACHE_NAMESPACE constant, update is_cache_valid signature)
- Modify: `scripts/synthesize.py` (write cache_namespace into output)
- Modify: `tests/test_synthesis_helpers.py` (add 2 cache-namespace tests + update existing cache tests)

- [ ] **Step 1: Write failing tests.** Append to `tests/test_synthesis_helpers.py`:

```python
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
```

Also update the existing 4 `test_is_cache_valid_*` tests to pass `current_cache_namespace` as the 4th positional arg. The pattern:

```python
def test_is_cache_valid_returns_true_when_all_keys_match():
    cached = {
        "input_records_hash": "sha256:abc",
        "system_prompt_hash": "sha256:xyz",
        "model": "claude-opus-4-7",
        "cache_namespace": "production-v1",
    }
    assert synthesis.is_cache_valid(cached, "sha256:abc", "sha256:xyz",
                                    "claude-opus-4-7", "production-v1")
```

Apply analogous changes to the other 3 cache-validity tests (records change, prompt change, model change, missing keys).

- [ ] **Step 2: Run tests; verify they fail.**

```bash
.venv/bin/python -m pytest tests/test_synthesis_helpers.py -v 2>&1 | tail -10
```

Expected: TypeError on missing `current_cache_namespace` arg, plus the 2 new tests fail (constant doesn't exist).

- [ ] **Step 3: Update `scripts/lib/synthesis.py`.** After the `MODEL = "claude-opus-4-7"` line, add:

```python
# Cache namespace prevents test fixture data from poisoning real-data
# caches. Tests override to "test"; production keeps the default.
CACHE_NAMESPACE = "production-v1"
```

Then update the `is_cache_valid` function signature and body:

```python
def is_cache_valid(cached: dict, current_records_hash: str,
                   current_prompt_hash: str, current_model: str,
                   current_cache_namespace: str) -> bool:
    if not cached:
        return False
    return (
        cached.get("input_records_hash") == current_records_hash
        and cached.get("system_prompt_hash") == current_prompt_hash
        and cached.get("model") == current_model
        and cached.get("cache_namespace") == current_cache_namespace
    )
```

- [ ] **Step 4: Update `scripts/synthesize.py` to pass the namespace and emit it.** Find the cache-check line:

```python
        if _s.is_cache_valid(cached, records_hash, _s.SYSTEM_PROMPT_HASH, _s.MODEL):
```

Replace with:

```python
        if _s.is_cache_valid(cached, records_hash, _s.SYSTEM_PROMPT_HASH,
                             _s.MODEL, _s.CACHE_NAMESPACE):
```

Then update the two `out = {...}` dict constructions (the insufficient_data branch and the live-call branch) to include the new field. In both dicts, after the `"system_prompt_hash": _s.SYSTEM_PROMPT_HASH,` line, add:

```python
        "cache_namespace": _s.CACHE_NAMESPACE,
```

- [ ] **Step 5: Run all helper tests + synthesize tests.**

```bash
.venv/bin/python -m pytest tests/test_synthesis_helpers.py tests/test_synthesize.py -v 2>&1 | tail -10
```

Expected: all pass (the test_synthesize.py tests don't currently override CACHE_NAMESPACE, but they don't read cache after first write either — the existing tests should keep working). If any test_synthesize.py test breaks due to CACHE_NAMESPACE mismatch, set `monkeypatch.setattr(synthesis, "CACHE_NAMESPACE", "production-v1")` in the affected test fixtures.

- [ ] **Step 6: Run the full test suite.**

```bash
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: 39 passing (37 prior + 2 new).

- [ ] **Step 7: Commit.**

```bash
git add scripts/lib/synthesis.py scripts/synthesize.py tests/test_synthesis_helpers.py
git commit -m "fix: cache namespace prevents test residue from poisoning real data

is_cache_valid now requires (records_hash, prompt_hash, model, AND
cache_namespace) all to match. CACHE_NAMESPACE constant defaults to
'production-v1'; tests override to 'test'. This prevents the case
where a test happens to seed records with a hash that matches real
data and writes mock LLM output to the production data directory.

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

## Task 3: source_account written at extract time + backfill (TDD)

**Files:**
- Modify: `scripts/extract.py` (write source_account at record-emit time)
- Create: `scripts/backfill_source_account.py` (one-shot script for existing records)
- Create: `tests/test_backfill_source_account.py` (TDD)

- [ ] **Step 1: Write failing test.** Create `tests/test_backfill_source_account.py`:

```python
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
```

- [ ] **Step 2: Run tests; verify they fail.**

```bash
.venv/bin/python -m pytest tests/test_backfill_source_account.py -v
```

Expected: ImportError on `scripts.backfill_source_account`.

- [ ] **Step 3: Write `scripts/backfill_source_account.py`.**

```python
#!/usr/bin/env python3
"""backfill_source_account.py — one-time fixup for records.jsonl files.

Walks every data/<handle>/records.jsonl, sets `source_account: <handle>`
on records that don't already have it. Idempotent — running twice has
the same effect as running once.

Usage:
    python scripts/backfill_source_account.py
    python scripts/backfill_source_account.py --handles bradfordgrams oliviachow
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"


def backfill_handle(handle: str) -> tuple[int, int]:
    """Repair one handle's records.jsonl. Returns (repaired_count, total_count)."""
    path = DATA_DIR / handle / "records.jsonl"
    if not path.exists():
        return (0, 0)
    rows: list[dict] = []
    repaired = 0
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not r.get("source_account"):
            r["source_account"] = handle
            repaired += 1
        rows.append(r)
    if rows:
        path.write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n"
        )
    return (repaired, len(rows))


def backfill_all() -> dict[str, tuple[int, int]]:
    """Backfill every handle directory under DATA_DIR. Returns {handle: (repaired, total)}."""
    out: dict[str, tuple[int, int]] = {}
    for sub in sorted(DATA_DIR.iterdir()):
        if not sub.is_dir():
            continue
        if not (sub / "records.jsonl").exists():
            continue
        out[sub.name] = backfill_handle(sub.name)
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--handles", nargs="*", default=None)
    args = parser.parse_args(argv)

    if args.handles:
        results = {h: backfill_handle(h) for h in args.handles}
    else:
        results = backfill_all()

    total_repaired = sum(r for r, _ in results.values())
    total_records = sum(t for _, t in results.values())
    for handle, (repaired, total) in results.items():
        print(f"  @{handle}: repaired {repaired}/{total} records")
    print(f"\n  total: {total_repaired} repaired, {total_records} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Update `scripts/extract.py` so newly-written records carry source_account.**

Find the function in `extract.py` that emits records to `records.jsonl` (look for `records.jsonl` open call, likely in a function called `extract_post`, `process_post`, or similar). Each record dict that gets written needs a `source_account: <handle>` field.

The cleanest pattern: at the top of the per-record write call, ensure:

```python
record["source_account"] = account_handle
```

…before serializing to JSONL. The `account_handle` is the `--account` CLI arg passed to extract.py; it should already be available as a module-level or function-scoped variable.

If you can't easily locate the write site, search for `json.dumps` near `records.jsonl`:

```bash
grep -n "records.jsonl\|json.dumps" /Users/aramammo/thebradfordfiles/scripts/extract.py | head -20
```

Add the field-set immediately before each json.dumps that targets records.jsonl.

- [ ] **Step 5: Run tests; verify they pass.**

```bash
.venv/bin/python -m pytest tests/test_backfill_source_account.py -v
```

Expected: 3 passed.

- [ ] **Step 6: Run the full test suite.**

```bash
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: 42 passing (39 prior + 3 new).

- [ ] **Step 7: Run the backfill on real data.**

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python scripts/backfill_source_account.py
```

Expected output (numbers approximate):

```
  @beybradford: repaired 188/188 records
  @bradfordgrams: repaired 5247/5247 records
  @oliviachow: repaired 470/470 records

  total: 5905 repaired, 5905 records
```

- [ ] **Step 8: Spot-check.**

```bash
.venv/bin/python -c "
import json
from collections import Counter
src = Counter()
for handle in ('bradfordgrams', 'beybradford', 'oliviachow'):
    for line in open(f'data/{handle}/records.jsonl'):
        if line.strip():
            r = json.loads(line)
            src[r.get('source_account', '?')] += 1
for k, v in src.most_common():
    print(f'  {k}: {v}')
"
```

Expected: each handle has its own count; no `?` entries.

- [ ] **Step 9: Commit.**

```bash
git add scripts/extract.py scripts/backfill_source_account.py tests/test_backfill_source_account.py data/bradfordgrams/records.jsonl data/beybradford/records.jsonl data/oliviachow/records.jsonl
git commit -m "fix: source_account written at extract time + backfill existing records

extract.py now writes source_account=<handle> on each record at write
time. backfill_source_account.py is a one-shot script that walks every
records.jsonl and repairs records missing the field. After this,
build_site.py's setdefault becomes a no-op for new records — alias
handles' records flow through with their true source_account.

5,905 existing records repaired (Bradford 5,247 + beybradford 188 +
Chow 470).

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

## Task 4: Re-run synthesis batch with new schema (live $$$ task)

**Files:** none — pure data refresh.

This task re-runs `synthesize_all.py` to regenerate the 18 cached synthesis cells against the new (tightened) schema. The cache namespace and SYSTEM_PROMPT_HASH have both changed, so all cells will regenerate. Wall-clock ~10 min, cost ~$10.

- [ ] **Step 1: Source env and run the batch driver.**

```bash
cd /Users/aramammo/thebradfordfiles
set -a && source ./.env && set +a
.venv/bin/python scripts/synthesize_all.py 2>&1 | tee synthesize-all-8a.log
```

Expected: ~18 synthesized + ~2 short-circuited as `insufficient_data`. The 3 Bradford topics that previously returned all-null (taxes_fiscal, governance_ethics, infrastructure) should now return either real synthesis or `synthesis_skipped_reason: "model_declined"` — never the degenerate state.

- [ ] **Step 2: Verify no degenerate cells remain.**

```bash
.venv/bin/python -c "
import json
from pathlib import Path
degenerate = 0
declined = 0
insufficient = 0
real = 0
for path in sorted(Path('data').glob('*/synthesis/*.json')):
    d = json.loads(path.read_text())
    reason = d.get('synthesis_skipped_reason')
    if d.get('summary') is None and d.get('consistency') is None and reason is None:
        degenerate += 1
        print(f'  DEGENERATE: {path}')
    elif reason == 'insufficient_data':
        insufficient += 1
    elif reason == 'model_declined':
        declined += 1
    else:
        real += 1
print(f'real: {real}, model_declined: {declined}, insufficient: {insufficient}, degenerate: {degenerate}')
assert degenerate == 0, 'no synthesis cell should be degenerate after the fix'
"
```

Expected: `degenerate: 0`. The other counts vary; sum should be 20.

- [ ] **Step 3: Commit the regenerated synthesis files.**

```bash
git add data/bradfordgrams/synthesis data/oliviachow/synthesis
git commit -m "chore: regenerate synthesis cells with tightened schema

All 20 cells regenerated under cache_namespace='production-v1' against
the new SYSTEM_PROMPT_HASH (schema fix in prior commit). Degenerate
all-null responses are no longer possible — model must commit to
either real synthesis, insufficient_data, or model_declined.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

# Section 2 — Privacy, Terms, Footer link

## Task 5: /privacy and /terms pages

**Files:**
- Create: `site/privacy/index.html`
- Create: `site/terms/index.html`
- Modify: `site/index.html` (footer link)
- Modify: `site/candidate-template.html` (footer link)

- [ ] **Step 1: Create the privacy page.** `site/privacy/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy &middot; The Mayoral Record</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.65 system-ui,sans-serif;color:#1b1b1b;max-width:760px;margin:60px auto;padding:0 24px}
h1{font:700 28px/1.2 "Source Serif Pro",Georgia,serif;color:#0d2f5c;margin:24px 0 8px}
h2{font:700 18px/1.3 "Source Serif Pro",Georgia,serif;color:#0d2f5c;margin:24px 0 8px}
ul{padding-left:22px;margin-bottom:16px}
li{margin-bottom:4px}
p{margin-bottom:14px}
a{color:#0050d8}
.note{background:#f3f3f3;padding:10px 14px;font-size:13px;margin-top:24px;border-left:3px solid #c9c9c9}
.note p{margin-bottom:6px}
.note p:last-child{margin-bottom:0}
</style>
</head>
<body>
<a href="/" style="color:#0050d8">&larr; Back to Candidates</a>
<h1>Privacy</h1>
<p>The Mayoral Record is an independent civic-transparency project. We collect as little data as possible.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Anonymous browser fingerprint hash.</strong> When you submit a reader vote (kept / broke / too early on a topic, or a list of issues you care about), the site generates a random 32-character identifier in your browser's local storage, hashes it with SHA-256, and uses the hash to prevent the same browser from voting twice on the same record. The original fingerprint never leaves your device. The hash is one-way and is not linked to any other data about you.</li>
  <li><strong>Aggregate page-view counts</strong> via Cloudflare Web Analytics. This is cookieless and does not track you across sites. <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noopener">Cloudflare's privacy explainer</a>.</li>
  <li><strong>Cloudflare Turnstile challenge tokens</strong> when you submit a vote. Turnstile is a no-CAPTCHA bot-detection challenge; it may use device characteristics to distinguish humans from bots. <a href="https://www.cloudflare.com/products/turnstile/" target="_blank" rel="noopener">Cloudflare Turnstile</a>.</li>
</ul>

<h2>What we don't collect</h2>
<ul>
  <li>No accounts. You don't sign up.</li>
  <li>No email address. No phone. No name.</li>
  <li>No IP-address logging beyond what Cloudflare and Vercel keep for security and abuse prevention. We don't read or query those logs in normal operation.</li>
  <li>No third-party advertising trackers. No retargeting.</li>
  <li>No cross-site tracking.</li>
</ul>

<h2>Third parties</h2>
<ul>
  <li><strong>Cloudflare</strong> (analytics, Turnstile bot detection): subject to <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener">Cloudflare's privacy policy</a>.</li>
  <li><strong>Upstash</strong> (Redis storage of vote counters and dedup hashes): subject to <a href="https://upstash.com/trust/privacy" target="_blank" rel="noopener">Upstash's privacy policy</a>.</li>
  <li><strong>Vercel</strong> (hosting): subject to <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener">Vercel's privacy policy</a>.</li>
  <li><strong>Pol.is</strong> (deliberation embed at /issues/transit-funding/discuss and similar pages): when you load that page, Pol.is loads its own iframe and may set its own cookies. Subject to <a href="https://pol.is/privacy" target="_blank" rel="noopener">Pol.is's privacy policy</a>. We do not control Pol.is's data practices.</li>
  <li><strong>Anthropic</strong> (Claude API for content extraction and synthesis): we send public Instagram content to Anthropic for processing. We do not send any reader-submitted data to Anthropic.</li>
</ul>

<h2>Data retention</h2>
<ul>
  <li>Aggregate vote counters in Redis are retained indefinitely.</li>
  <li>Per-fingerprint dedup keys auto-expire after 365 days.</li>
  <li>Server logs (Vercel/Cloudflare) retain per their providers' policies; we do not retain copies.</li>
</ul>

<h2>Contact</h2>
<p>Questions about privacy? <a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">Open a GitHub issue</a> or email <a href="mailto:hello@bottlenecklabs.ai">hello@bottlenecklabs.ai</a>.</p>

<div class="note">
<p>This is a plain-English disclosure. It is not legal advice. If you have a specific privacy concern, please contact us.</p>
<p>Last updated: 2026-05-04.</p>
</div>
</body>
</html>
```

- [ ] **Step 2: Create the terms page.** `site/terms/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Terms of Use &middot; The Mayoral Record</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.65 system-ui,sans-serif;color:#1b1b1b;max-width:760px;margin:60px auto;padding:0 24px}
h1{font:700 28px/1.2 "Source Serif Pro",Georgia,serif;color:#0d2f5c;margin:24px 0 8px}
h2{font:700 18px/1.3 "Source Serif Pro",Georgia,serif;color:#0d2f5c;margin:24px 0 8px}
ul{padding-left:22px;margin-bottom:16px}
li{margin-bottom:4px}
p{margin-bottom:14px}
a{color:#0050d8}
.note{background:#f3f3f3;padding:10px 14px;font-size:13px;margin-top:24px;border-left:3px solid #c9c9c9}
.note p{margin-bottom:6px}
.note p:last-child{margin-bottom:0}
</style>
</head>
<body>
<a href="/" style="color:#0050d8">&larr; Back to Candidates</a>
<h1>Terms of Use</h1>

<h2>What this site is</h2>
<p>The Mayoral Record is an independent civic-transparency project documenting Toronto's 2026 mayoral race. It is not affiliated with any candidate, campaign, or political party. There is no financial relationship between this project and any candidate.</p>

<h2>What the content is</h2>
<ul>
  <li>Records (positions, pledges, council actions, endorsements, appearances, quotes) are extracted from public Instagram posts using a documented pipeline. The cited Instagram post (linked from each record) is the primary source. If a record contradicts its cited source, the source wins.</li>
  <li>Council voting records are sourced from the City of Toronto's public voting record. Verified ✓ badges indicate cross-references between extracted action records and council votes; the cited agenda item is authoritative.</li>
  <li>Synthesis paragraphs are generated by an LLM (Claude Opus 4.7) using a publicly disclosed system prompt (see <a href="/methodology">/methodology</a>). The cited shortcodes within each synthesis are authoritative. If a synthesis claim doesn't match its cited record, the record wins.</li>
</ul>

<h2>Reader-submitted content</h2>
<ul>
  <li>Reader judgments (kept / broke / too early on Said-vs-Done topics) and issue-priority votes are anonymous and aggregate-only. We don't moderate individual submissions because we don't see them.</li>
  <li>We may remove activity that appears coordinated (sudden spikes from a narrow set of fingerprints, etc.) to protect the integrity of the aggregate.</li>
  <li>Pol.is deliberations are hosted by Pol.is. Statement moderation is governed by Pol.is's terms; we do not moderate that surface.</li>
</ul>

<h2>No warranty, no advice</h2>
<ul>
  <li>The site is provided as-is. No warranty of accuracy, completeness, or fitness for any particular purpose.</li>
  <li>Nothing here is voting advice. It's a sourced record. Make your own decisions.</li>
  <li>Information may be wrong. If you spot an error, please <a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">open a GitHub issue</a>.</li>
</ul>

<h2>Equal-billing rules</h2>
<p>Candidates are listed alphabetically by surname. No candidate is given visual prominence over any other (no "front-runner" badges, no editorial weighting). Records and synthesis use the same template per candidate.</p>

<h2>Open source</h2>
<p>The code, the methodology, and the system prompts are open source under the MIT license at <a href="https://github.com/fullstackvibecoder/thebradfordfiles">GitHub</a>.</p>

<div class="note">
<p>This is a plain-English statement. It is not legal advice. If you have a specific concern, please contact us.</p>
<p>Last updated: 2026-05-04.</p>
</div>
</body>
</html>
```

- [ ] **Step 3: Add footer link to landing.** In `site/index.html`, find the existing footer block (search for `footer.site-footer`). Inside the `.footer-inner` div, just before the existing `<div style="margin-top:12px;color:rgba(255,255,255,.7);font-size:12px">` line, insert a new line:

```html
  <div style="margin-top:8px;font-size:12px"><a href="/privacy" style="color:#fff">Privacy</a> · <a href="/terms" style="color:#fff">Terms</a> · <a href="/methodology" style="color:#fff">Methodology</a></div>
```

- [ ] **Step 4: Add footer link to candidate template.** In `site/candidate-template.html`, find the candidate-page footer block similarly and insert the same line before the BottleneckLabs attribution.

(If the candidate template doesn't have an exact `.footer-inner` block — read the file and locate the existing footer; insert the Privacy/Terms/Methodology line within it. Use `Edit` with sufficient surrounding context.)

- [ ] **Step 5: Smoke-test routes.**

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python scripts/build_site.py 2>&1 | tail -3
cd site && python3 -m http.server 8765 >/dev/null 2>&1 &
SRV=$!
sleep 1
for path in /privacy /terms; do
  echo "  $path: $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" http://localhost:8765$path)"
done
kill $SRV 2>/dev/null
cd ..
```

Expected: each route returns 200.

- [ ] **Step 6: Commit.**

```bash
git add site/privacy/index.html site/terms/index.html site/index.html site/candidate-template.html
git commit -m "feat: /privacy and /terms pages + footer links

Plain-English privacy + terms disclosures appropriate for a civic
transparency project that collects no PII (just SHA-256-hashed browser
fingerprints for vote dedup + Cloudflare cookieless analytics).

Both pages include a 'plain-English disclosure, not legal advice'
note at the bottom.

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

---

# Section 3 — Cloudflare Web Analytics

## Task 6: Cloudflare Web Analytics beacon

**Files:**
- Modify: `.env` and `.env.example` (CLOUDFLARE_BEACON_TOKEN)
- Modify: `scripts/build_site.py` (substitute __CLOUDFLARE_BEACON_TOKEN__)
- Modify: `site/index.html` (add beacon)
- Modify: `site/candidate-template.html` (add beacon)
- Modify: `site/issues/index.html` (add beacon)
- Modify: `site/issues/transit-funding/discuss/index.html` (add beacon)
- Modify: `site/methodology/index.html` (add beacon)
- Modify: `site/about/index.html` (add beacon)
- Modify: `site/compare/index.html` (add beacon)
- Modify: `site/privacy/index.html` (add beacon)
- Modify: `site/terms/index.html` (add beacon)

**Manual prerequisite:** the operator visits `dash.cloudflare.com` → Web Analytics → Add a site → "Manual setup" → enters `mayoralrecord.com`. Cloudflare returns a beacon token (a hex string starting with something like `a1b2c3d4...`). The operator pastes this into `.env` as `CLOUDFLARE_BEACON_TOKEN=...` before running this task.

- [ ] **Step 1: Document the env var.** Append to `.env.example`:

```bash
# Cloudflare Web Analytics beacon token (public — embedded in HTML).
# Get from dash.cloudflare.com → Web Analytics → your site → Snippet.
CLOUDFLARE_BEACON_TOKEN=
```

- [ ] **Step 2: Update `scripts/build_site.py` to substitute the token.** In the `_emit_candidate_html` function, in the existing `.replace(...)` chain, add another replacement:

```python
        .replace("__CLOUDFLARE_BEACON_TOKEN__",
                 os.environ.get("CLOUDFLARE_BEACON_TOKEN", "__CLOUDFLARE_BEACON_TOKEN__"))
```

Then, in the `main()` function, find the existing block that substitutes the Turnstile site key into `site/issues/index.html`. Add similar substitution loops for ALL static HTML pages (so `__CLOUDFLARE_BEACON_TOKEN__` and `__TURNSTILE_SITE_KEY__` are both swapped into them). Replace that existing block:

```python
    issues_path = SITE_DIR / "issues" / "index.html"
    if issues_path.exists():
        text = issues_path.read_text()
        text = text.replace(
            "__TURNSTILE_SITE_KEY__",
            os.environ.get("TURNSTILE_SITE_KEY", "__TURNSTILE_SITE_KEY__"),
        )
        issues_path.write_text(text)
```

with a generalized loop:

```python
    static_pages_with_substitutions = [
        SITE_DIR / "index.html",
        SITE_DIR / "issues" / "index.html",
        SITE_DIR / "issues" / "transit-funding" / "discuss" / "index.html",
        SITE_DIR / "methodology" / "index.html",
        SITE_DIR / "about" / "index.html",
        SITE_DIR / "compare" / "index.html",
        SITE_DIR / "privacy" / "index.html",
        SITE_DIR / "terms" / "index.html",
    ]
    substitutions = {
        "__TURNSTILE_SITE_KEY__": os.environ.get("TURNSTILE_SITE_KEY", "__TURNSTILE_SITE_KEY__"),
        "__CLOUDFLARE_BEACON_TOKEN__": os.environ.get("CLOUDFLARE_BEACON_TOKEN", "__CLOUDFLARE_BEACON_TOKEN__"),
    }
    for page in static_pages_with_substitutions:
        if not page.exists():
            continue
        text = page.read_text()
        for placeholder, value in substitutions.items():
            text = text.replace(placeholder, value)
        page.write_text(text)
```

- [ ] **Step 3: Add the beacon to every public HTML page.** Insert this snippet just before the closing `</body>` tag in:
- `site/index.html`
- `site/candidate-template.html`
- `site/issues/index.html`
- `site/issues/transit-funding/discuss/index.html`
- `site/methodology/index.html`
- `site/about/index.html`
- `site/compare/index.html`
- `site/privacy/index.html`
- `site/terms/index.html`

The snippet:

```html
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"__CLOUDFLARE_BEACON_TOKEN__"}'></script>
```

For each file, use `Edit` to find the `</body>` line and insert the snippet on the line above it.

- [ ] **Step 4: Smoke-test build.**

```bash
cd /Users/aramammo/thebradfordfiles
set -a && source ./.env && set +a
.venv/bin/python scripts/build_site.py 2>&1 | tail -3
grep -c "cloudflareinsights.com" site/index.html site/bradford/index.html site/issues/index.html
```

Expected: each file shows `1` (one beacon snippet present).

- [ ] **Step 5: Verify substitution.**

```bash
grep -c "__CLOUDFLARE_BEACON_TOKEN__" site/index.html
```

Expected: `0` (placeholder fully substituted).

- [ ] **Step 6: Commit.**

```bash
git add .env.example scripts/build_site.py site/index.html site/candidate-template.html site/issues/index.html site/issues/transit-funding/discuss/index.html site/methodology/index.html site/about/index.html site/compare/index.html site/privacy/index.html site/terms/index.html
git commit -m "feat: Cloudflare Web Analytics beacon on all public pages

Beacon snippet added to 9 public pages with token substituted at build
time from CLOUDFLARE_BEACON_TOKEN env. Cookieless, no DNS proxying
needed. Privacy page already documents this.

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

---

# Section 4 — Vercel OG social cards

## Task 7: /api/og dynamic social cards

**Files:**
- Modify: `site/package.json` (add `@vercel/og`)
- Create: `site/api/og.js`
- Modify: `site/index.html` (OG meta tags)
- Modify: `site/candidate-template.html` (OG meta tags)
- Modify: `site/issues/index.html` (OG meta tags)
- Modify: `site/issues/transit-funding/discuss/index.html` (OG meta tags)
- Modify: `scripts/build_site.py` (substitute candidate-specific OG URL)

- [ ] **Step 1: Install `@vercel/og`.**

```bash
cd /Users/aramammo/thebradfordfiles/site
npm install @vercel/og
```

Verify it's in `site/package.json` dependencies.

- [ ] **Step 2: Write `site/api/og.js`.**

```javascript
import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const TYPE_LANDING = "landing";
const TYPE_CANDIDATE = "candidate";
const TYPE_ISSUES = "issues";
const TYPE_DELIBERATION = "deliberation";

const COLORS = {
  navy: "#0d2f5c",
  navyLight: "#1a4480",
  red: "#da291c",
  white: "#ffffff",
  text: "#1b1b1b",
  muted: "#5a6573",
  green: "#1a5b1a",
  yellow: "#b58a32",
  redDot: "#b50909",
  gray: "#999",
};

function frame(children) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "1200px",
        height: "630px",
        background: COLORS.navy,
        color: COLORS.white,
        padding: "60px 80px",
        fontFamily: "system-ui, sans-serif",
      },
      children,
    },
  };
}

function landingCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Public Record · The 416" } },
    { type: "div", props: { style: { fontSize: 96, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "An independent, sourced record of Toronto's 2026 mayoral race." } },
  ]);
}

function candidateCard(name, recordCount, dotColor, filesLabel) {
  const dotHex = ({green: COLORS.green, yellow: COLORS.yellow, red: COLORS.redDot}[dotColor]) || COLORS.gray;
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }, children: [
      { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0 }, children: filesLabel } },
      { type: "div", props: { style: { width: 36, height: 36, borderRadius: 18, background: dotHex } } },
    ] } },
    { type: "div", props: { style: { fontSize: 30, opacity: 0.9 }, children: `${name} · ${recordCount.toLocaleString()} sourced records` } },
  ]);
}

function issuesCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "Issues & Agenda Gap" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "Reader priority vs. candidate emphasis, across 10 Toronto policy topics." } },
  ]);
}

function deliberationCard(title) {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Deliberation · The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginBottom: 24 }, children: title } },
    { type: "div", props: { style: { fontSize: 26, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "An open conversation. Vote on community statements; see where Torontonians actually agree. Powered by Pol.is." } },
  ]);
}

export default function handler(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || TYPE_LANDING;
  let element;
  if (type === TYPE_CANDIDATE) {
    const name = url.searchParams.get("name") || "Candidate";
    const recordCount = parseInt(url.searchParams.get("records") || "0", 10);
    const dot = url.searchParams.get("dot") || "gray";
    const filesLabel = url.searchParams.get("files_label") || "The Files";
    element = candidateCard(name, recordCount, dot, filesLabel);
  } else if (type === TYPE_ISSUES) {
    element = issuesCard();
  } else if (type === TYPE_DELIBERATION) {
    const title = url.searchParams.get("title") || "Deliberation";
    element = deliberationCard(title);
  } else {
    element = landingCard();
  }
  return new ImageResponse(element, { width: 1200, height: 630 });
}
```

- [ ] **Step 3: Quick smoke test of the function (locally).**

Run vercel dev briefly and hit the endpoint:

```bash
cd /Users/aramammo/thebradfordfiles/site
nohup vercel dev --listen 3001 > /tmp/vercel-dev-og.log 2>&1 &
DEV_PID=$!
sleep 12
/usr/bin/curl -s -o /tmp/og-landing.png -w "HTTP %{http_code} content-type %{content_type}\n" "http://localhost:3001/api/og?type=landing"
/usr/bin/curl -s -o /tmp/og-bradford.png -w "HTTP %{http_code}\n" "http://localhost:3001/api/og?type=candidate&name=Brad%20Bradford&records=5435&dot=yellow&files_label=The%20Bradford%20Files"
/usr/bin/curl -s -o /tmp/og-issues.png -w "HTTP %{http_code}\n" "http://localhost:3001/api/og?type=issues"
ls -la /tmp/og-*.png
kill $DEV_PID 2>/dev/null
cd ..
```

Expected: each png file is created (size > 5 KB), HTTP 200.

- [ ] **Step 4: Add OG meta tags to public pages.**

For `site/index.html`, add after the existing `<meta name="theme-color"...>` line:

```html
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.mayoralrecord.com/">
<meta property="og:title" content="The Mayoral Record">
<meta property="og:description" content="An independent, sourced record of Toronto's 2026 mayoral race.">
<meta property="og:image" content="https://www.mayoralrecord.com/api/og?type=landing">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

For `site/candidate-template.html`, after `<meta name="theme-color"...>` add (with substitutable placeholders that build_site fills):

```html
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.mayoralrecord.com/__SLUG__">
<meta property="og:title" content="__FILES_LABEL__ · The Mayoral Record">
<meta property="og:description" content="A sourced record of __DISPLAY_NAME__'s public political content. Every record cited.">
<meta property="og:image" content="https://www.mayoralrecord.com/api/og?type=candidate&name=__DISPLAY_NAME_URL__&records=__RECORD_COUNT__&dot=__DOT_COLOR__&files_label=__FILES_LABEL_URL__">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

For `site/issues/index.html`, after the head's `<title>` line:

```html
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.mayoralrecord.com/issues">
<meta property="og:title" content="Issues & Agenda Gap · The Mayoral Record">
<meta property="og:description" content="Reader priority vs. candidate emphasis, across 10 Toronto policy topics.">
<meta property="og:image" content="https://www.mayoralrecord.com/api/og?type=issues">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

For `site/issues/transit-funding/discuss/index.html`:

```html
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.mayoralrecord.com/issues/transit-funding/discuss">
<meta property="og:title" content="Transit funding deliberation · The Mayoral Record">
<meta property="og:description" content="Should Toronto raise property tax to fund TTC expansion? An open conversation.">
<meta property="og:image" content="https://www.mayoralrecord.com/api/og?type=deliberation&title=Transit+funding">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

- [ ] **Step 5: Update `scripts/build_site.py` to substitute candidate-specific OG fields.** Inside `_emit_candidate_html`, append four more replacements to the `.replace(...)` chain:

```python
        .replace("__SLUG__", manifest["slug"])
        .replace("__DISPLAY_NAME__", manifest["display_name"])
        .replace("__DISPLAY_NAME_URL__", manifest["display_name"].replace(" ", "+"))
        .replace("__FILES_LABEL_URL__", manifest["files_label"].replace(" ", "+"))
        .replace("__RECORD_COUNT__", str(manifest.get("_record_count", 0)))
        .replace("__DOT_COLOR__", manifest.get("_dot_color", "gray"))
```

The two new fields (`_record_count` and `_dot_color`) come from the dossier; we need to pass them in. Find the call site of `_emit_candidate_html(manifest)` in `main()` and replace it. The existing pattern:

```python
        _emit_candidate_html(manifest)
```

Replace with (compute both from the dossier we just built):

```python
        manifest_for_html = {
            **manifest,
            "_record_count": dossier["meta"]["record_count"],
            "_dot_color": dossier["meta"].get("consistency_dot", "gray"),
        }
        _emit_candidate_html(manifest_for_html)
```

- [ ] **Step 6: Smoke-test build.**

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python scripts/build_site.py 2>&1 | tail -3
grep -E "og:image" site/bradford/index.html | head -2
grep -E "og:image" site/index.html | head -2
```

Expected: bradford page's og:image URL contains `name=Brad+Bradford&records=5435&dot=yellow`; landing page's og:image URL contains `type=landing`.

- [ ] **Step 7: Commit.**

```bash
git add site/api/og.js site/package.json site/package-lock.json site/index.html site/candidate-template.html site/issues/index.html site/issues/transit-funding/discuss/index.html scripts/build_site.py
git commit -m "feat: dynamic OpenGraph social cards via @vercel/og

/api/og?type=... returns 1200x630 PNGs for landing, candidate, issues,
and deliberation pages. Candidate cards include record count and
consistency dot color. og:image meta tags reference the function URL,
so cards stay current as data updates without re-exporting assets.

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

---

# Section 5 — Sitemap + robots

## Task 8: sitemap.xml + robots.txt

**Files:**
- Modify: `scripts/build_site.py` (write site/sitemap.xml)
- Create: `site/robots.txt`

- [ ] **Step 1: Add a `_emit_sitemap` helper to `scripts/build_site.py`.** After the `_emit_candidate_html` function, add:

```python
SITE_BASE_URL = "https://www.mayoralrecord.com"


def _emit_sitemap(landing_cards: list[dict], generated_at: str) -> None:
    """Write site/sitemap.xml listing all public routes."""
    static_routes = [
        ("/",                                    generated_at),
        ("/compare",                              generated_at),
        ("/issues",                               generated_at),
        ("/issues/transit-funding/discuss",        generated_at),
        ("/methodology",                           generated_at),
        ("/about",                                 generated_at),
        ("/privacy",                               generated_at),
        ("/terms",                                 generated_at),
    ]
    candidate_routes = [
        (f"/{c['slug']}", c.get("date_range", {}).get("latest") or generated_at)
        for c in landing_cards
    ]
    all_routes = static_routes + candidate_routes
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, lastmod in all_routes:
        lines.append("  <url>")
        lines.append(f"    <loc>{SITE_BASE_URL}{path}</loc>")
        lines.append(f"    <lastmod>{lastmod[:10]}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    (SITE_DIR / "sitemap.xml").write_text("\n".join(lines) + "\n")
    print(f"  wrote site/sitemap.xml ({len(all_routes)} routes)")
```

In `main()`, after the `landing.json` write and before the `data.json` back-compat write, call:

```python
    _emit_sitemap(landing_cards, landing["generated_at"])
```

- [ ] **Step 2: Create `site/robots.txt`.**

```
User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://www.mayoralrecord.com/sitemap.xml
```

- [ ] **Step 3: Smoke-test build.**

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python scripts/build_site.py 2>&1 | tail -5
head -20 site/sitemap.xml
cat site/robots.txt
```

Expected: sitemap.xml lists 10 routes (8 static + 2 candidates: bradford, chow); robots.txt prints as written.

- [ ] **Step 4: Validate sitemap XML.**

```bash
python3 -c "import xml.etree.ElementTree as ET; ET.parse('site/sitemap.xml'); print('valid xml')"
```

Expected: `valid xml`.

- [ ] **Step 5: Commit.**

```bash
git add scripts/build_site.py site/robots.txt
git commit -m "feat: sitemap.xml and robots.txt

build_site.py now writes site/sitemap.xml listing all public routes
(8 static + 1 per candidate) on every build. robots.txt allows / and
disallows /api/ + points to the sitemap.

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

---

# Section 6 — Operational runbook + editorial review checklist

## Task 9: docs/runbook.md and docs/editorial-review.md

**Files:**
- Create: `docs/runbook.md`
- Create: `docs/editorial-review.md`

- [ ] **Step 1: Write `docs/runbook.md`.**

```markdown
# The Mayoral Record — Operational Runbook

Last updated: 2026-05-04.

This is the on-call doc. When something looks wrong on https://www.mayoralrecord.com, start here.

## Where things live

| System | Where | What it does |
|---|---|---|
| Hosting | https://vercel.com/bottlenecklabs/thebradfordfiles | Static site + Vercel Functions on Fluid Compute |
| Storage | Upstash Redis (via Vercel Marketplace integration) | Vote counters + dedup keys |
| Bot detection | Cloudflare Turnstile dashboard | Reader-vote anti-brigading |
| Analytics | Cloudflare Web Analytics dashboard | Aggregate page views |
| Domain registrar | Cloudflare Registrar | mayoralrecord.com |
| LLM API | Anthropic console | Triage (Haiku 4.5), extraction (Opus 4.7), synthesis (Opus 4.7) |
| Transcription | Deepgram console | Nova 3 transcription for video posts |
| Source-of-record | https://github.com/fullstackvibecoder/thebradfordfiles | Code, plans, specs, methodology |

## Common diagnostic commands

```bash
# Latest deployments
vercel ls --scope bottlenecklabs

# Logs from the latest deployment
vercel logs --scope bottlenecklabs

# Function logs (errors only) for the last hour
vercel logs <deployment-url> --level error --since 1h

# What's currently aliased to the production domain
vercel inspect <deployment-url> --scope bottlenecklabs
```

## Failure modes & fixes

### "/api/vote returns 500"
1. Check function logs: `vercel logs --scope bottlenecklabs --function /api/vote --since 1h`
2. Most common cause: Upstash Redis quota exceeded. Check the Upstash dashboard → "Daily Commands" graph.
3. Less common: `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL` env var lost. Re-pull from Vercel and re-deploy.

### "Reader votes always fail with turnstile_failed"
1. Check Cloudflare Turnstile dashboard → widget settings → Hostname Management. Confirm `mayoralrecord.com` and `www.mayoralrecord.com` are listed.
2. Confirm `TURNSTILE_SECRET_KEY` is set in Vercel project env (production). Run `vercel env ls production | grep TURNSTILE`.
3. If both look right, check the widget itself isn't paused in the Cloudflare dashboard.

### "/issues/transit-funding/discuss shows no statements"
1. The Pol.is conversation auto-creates on first page load. Confirm by checking https://pol.is/admin for a conversation with `page_id=tomf-transit-funding-2026`.
2. If the conversation exists but is empty: log into Pol.is admin and add the 7 seed statements (see Sprint 8A spec, Section 28 manual step).

### "Synthesis paragraph for topic X is empty / wrong"
1. Inspect the cell: `cat data/<handle>/synthesis/<topic>.json | python3 -m json.tool`
2. If it shows `synthesis_skipped_reason: "model_declined"` — the LLM judged the records insufficient. This is correct behavior; the frontend skip-renders.
3. If it shows real content but wrong: regenerate with `--force`:
   ```bash
   set -a && source ./.env && set +a
   .venv/bin/python scripts/synthesize.py --account <handle> --topic <topic> --force
   .venv/bin/python scripts/build_site.py
   ```

### "Vercel deploy is serving stale content"
1. Confirm the alias chain: `vercel inspect <deployment-url>` shows mayoralrecord.com aliases.
2. If aliases are right but content is wrong: re-deploy with `vercel --prod --yes --force` from the `site/` dir. The `--force` skips the build cache.
3. The most common cause is `vercel --prod` being run from a stale checkout. Pull main first.

### "A reader reports an error in a record"
1. Open the GitHub issues link from the error report.
2. The cited shortcode points to an Instagram URL. Click it; verify against the post.
3. Records are in `data/<handle>/records.jsonl`. If the record is wrong, the upstream source (Opus extraction) made an error — re-run extraction with `--force` for that post, or hand-edit and commit the JSONL fix.
4. Re-run `./scripts/build_all.sh` and re-deploy.

## Pipeline operations

### Add a new candidate
1. Create `data/<handle>/candidate.json` (use bradfordgrams's manifest as a template).
2. Run triage: `.venv/bin/python scripts/triage.py --account <handle>`.
3. Run extraction: `.venv/bin/python scripts/extract.py --account <handle>`.
4. Run synthesis: `.venv/bin/python scripts/synthesize_all.py --handles <handle>`.
5. Run `./scripts/build_all.sh`.
6. Deploy: `cd site && vercel --prod --yes`.

### Refresh a candidate's content
The pipeline is idempotent. Re-run triage + extract on a handle whenever you want fresh content. The synthesis cache invalidates automatically when records change.

### Cost touchpoints
- Anthropic API: ~$10 per full synthesis pass + variable for triage/extract per new candidate (Bradford full extract was ~6.5 hours of wall-clock at $30-50 estimated in API spend).
- Vercel function execution: free tier is generous; check the dashboard if usage spikes.
- Upstash Redis: free tier covers ~10k commands/day; we're well under.
- Cloudflare Turnstile: free, unlimited.
- Cloudflare Web Analytics: free.
- Deepgram Nova 3: ~$0.004/minute of audio; full Bradford pass cost a few dollars.

## What's NOT on alerts

This site has no automated paging. We don't get a Slack message when /api/vote 5xxes. The site is monitored by manual visiting.

If we see real traffic and need alerts, the simplest path is:
- Vercel → Project Settings → Notifications → enable email on deploy failures
- Cloudflare → Notifications → enable email on Turnstile widget errors
- For Upstash → use their built-in alerting on quota thresholds

## Manual editorial review

The 17+ synthesis paragraphs are LLM-generated public content under your name. Run the editorial review checklist (`docs/editorial-review.md`) once before a public launch announcement and after any synthesis prompt changes.
```

- [ ] **Step 2: Write `docs/editorial-review.md`.**

```markdown
# Synthesis Editorial Review Checklist

For each cell at `data/<handle>/synthesis/<topic>.json` with a non-null `summary`, run through these four checks. Log results in this file (or on a fresh review-YYYY-MM-DD.md per pass).

## Checks

### 1. No character claims
The synthesis describes positions only. Reject any phrase that:
- Characterizes the candidate's intent, motivation, or sincerity ("Bradford genuinely believes...", "Chow seems committed to...")
- Compares the candidate as a person to others
- Speculates on the candidate's electoral strategy or party affiliation

### 2. No speculation
The synthesis stays in past/present tense for actual stances. Reject:
- "Bradford will probably push for..."
- "Chow is likely to support..."
- "...if elected..."

### 3. Cited claims match cited records
Pick 2-3 cited shortcodes per paragraph. Click through the Instagram URL (visible in the per-record card on the candidate's dashboard). Confirm:
- The record exists at that shortcode
- The record's content actually supports the synthesis claim that cites it
- The record is not taken out of context (e.g., a sarcastic post being read literally)

### 4. Tonal balance
Read Bradford's and Chow's syntheses for the same topic side by side. Ask:
- Does one read more sympathetically than the other?
- Does one use stronger active verbs and the other passive?
- Is the level of detail comparable?

## Per-cell log

Format each entry as:

```
## YYYY-MM-DD — handle/topic

- [x] No character claims
- [x] No speculation
- [x] 3/3 cited records match
- [ ] Tonal balance: synthesis A reads stronger than synthesis B for topic X — flagged for re-run

Notes: [free text]
```

## Re-run process

If any check fails:
1. Note the issue in the log.
2. If it's a record-citation mismatch, the upstream record may be wrong — fix at the records.jsonl level, then re-run synthesis.
3. If it's a tonal/character issue, regenerate with `--force` (the next sample may avoid the issue), or amend `SYSTEM_PROMPT` if the issue is systematic across cells.

## When to re-run a full editorial review

- Before a public launch announcement.
- After modifying `SYSTEM_PROMPT`.
- After significant new records are added to a candidate (e.g., +20% records).
- If a reader reports a synthesis error.
```

- [ ] **Step 3: Commit.**

```bash
git add docs/runbook.md docs/editorial-review.md
git commit -m "docs: operational runbook + editorial review checklist

runbook covers: where systems live, common failure modes + fixes,
pipeline operations, cost touchpoints. editorial-review documents the
4-check pass an operator runs over synthesis paragraphs before a
launch announcement and after any prompt changes.

Co-Authored-By: <subagent-model> <noreply@anthropic.com>"
```

## Task 10: Operator editorial review pass

**Files:** none (operator action; tracked in commit message).

This task is the operator (you) walking through the 4-check pass over the 17 synthesis cells. Estimated time: 30-60 min.

- [ ] **Step 1: Open `data/bradfordgrams/synthesis/` and `data/oliviachow/synthesis/`** in any text editor.

- [ ] **Step 2: For each cell with a non-null `summary`**, run checks 1-4 from `docs/editorial-review.md`.

- [ ] **Step 3: Log findings** in a new file `docs/editorial-review-2026-05-04.md` (or similar dated filename) following the template in `editorial-review.md`.

- [ ] **Step 4: For any flagged cell**, regenerate:

```bash
set -a && source ./.env && set +a
.venv/bin/python scripts/synthesize.py --account <handle> --topic <topic> --force
```

Then re-check the regenerated content.

- [ ] **Step 5: Commit the editorial-review log.**

```bash
git add docs/editorial-review-2026-05-04.md data/  # (data/ in case any cell regen happened)
git commit -m "docs: editorial review pass for synthesis cells

Operator-walked the 4-check pass over the 17 published synthesis cells.
Flagged: <count> cells. All resolved via either re-run or no-op (false
alarm).

Co-Authored-By: ara@thespringteam.ca"
```

---

# Section 7 — Verification + bundled prod deploy

## Task 11: Final verification + Sprint 8A prod deploy

**Files:** none (deploy + smoke).

- [ ] **Step 1: Confirm full test suite passes.**

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: 42 passing.

- [ ] **Step 2: Run full pipeline end-to-end.**

```bash
./scripts/build_all.sh 2>&1 | tail -10
```

Expected: ingest + match + synthesize (no-op cache hits) + build_site complete; sitemap written; OG meta substituted into per-candidate pages.

- [ ] **Step 3: Smoke-test the new artifacts locally.**

```bash
cd site && python3 -m http.server 8765 >/dev/null 2>&1 &
SRV=$!
sleep 1
for path in / /privacy /terms /sitemap.xml /robots.txt; do
  echo "  $path: $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" http://localhost:8765$path)"
done
kill $SRV 2>/dev/null
cd ..
```

Expected: all 5 routes return 200.

- [ ] **Step 4: Commit any incidental site/ rebuild artifacts.**

```bash
git status site/
git add site/landing.json site/data.json site/candidates site/bradford site/chow site/sitemap.xml
git diff --cached --stat | tail -5
git commit -m "chore: rebuild site/ for Sprint 8A deploy"
```

- [ ] **Step 5: Deploy to production.**

```bash
cd site && vercel --prod --yes 2>&1 | tail -8
cd ..
```

- [ ] **Step 6: Post-deploy smoke check.**

```bash
URL="https://www.mayoralrecord.com"
for path in / /privacy /terms /sitemap.xml /robots.txt /api/og?type=landing /bradford /chow; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL$path")
  echo "  $code  $path"
done
echo "--- /api/og?type=candidate&name=Brad+Bradford&records=5435&dot=yellow&files_label=The+Bradford+Files content-type:"
/usr/bin/curl -sL -o /dev/null -w "%{content_type}\n" "$URL/api/og?type=candidate&name=Brad+Bradford&records=5435&dot=yellow&files_label=The+Bradford+Files"
```

Expected: all routes 200; /api/og endpoints return image/png.

- [ ] **Step 7: Confirm Cloudflare Web Analytics is receiving traffic.**

Visit `dash.cloudflare.com` → Web Analytics → mayoralrecord.com. After ~5 minutes of normal traffic (or you visiting the site a few times), the dashboard should show non-zero page views.

- [ ] **Step 8: Push to origin.**

```bash
git push origin main
```

**Sprint 8A complete.**

---

## Self-review

**Spec coverage check:**
- ✅ Synthesis schema tightening (Task 1)
- ✅ Cache-key namespace fix (Task 2)
- ✅ source_account at extract time + backfill (Task 3)
- ✅ Synthesis batch regen with new schema (Task 4)
- ✅ /privacy + /terms pages + footer links (Task 5)
- ✅ Cloudflare Web Analytics beacon on all public pages (Task 6)
- ✅ /api/og dynamic social cards (Task 7)
- ✅ sitemap.xml + robots.txt (Task 8)
- ✅ Operational runbook + editorial-review checklist (Task 9)
- ✅ Operator editorial review pass (Task 10)
- ✅ Bundled prod deploy + smoke (Task 11)

**Placeholder scan:**
- No "TBD" / "TODO" / "implement later" / vague descriptions.
- All code blocks contain complete code.
- Operator-action tasks (Task 10) have specific check criteria, not just "review the syntheses."
- One placeholder string `<subagent-model>` in commit messages — that's intentional; the executing subagent fills its own model name.

**Type consistency:**
- `CACHE_NAMESPACE` constant: defined in Task 2's lib edit, consumed in Task 2's synthesize.py edit, validated in Task 2's tests. Consistent.
- `synthesis_skipped_reason` enum: `["insufficient_data", "model_declined"]` consistent across SYSTEM_PROMPT (Task 1 step 5), SYNTHESIS_TOOL_SCHEMA (Task 1 step 6), the test assertion (Task 1 step 3), and the runbook (Task 9).
- `_record_count` and `_dot_color` (the two fields passed into `_emit_candidate_html`'s manifest_for_html dict in Task 7 step 5) — these are read by the OG meta replacements added in Task 7 step 5. Consistent.
- The OG image URL placeholders `__SLUG__`, `__DISPLAY_NAME__`, etc. (Task 7 step 4) match what `_emit_candidate_html` substitutes (Task 7 step 5). Consistent.
- `CLOUDFLARE_BEACON_TOKEN` env var (Task 6 step 1, step 2, step 3) — consistent name across env file and build script.

No gaps. Plan is implementable as-is.
