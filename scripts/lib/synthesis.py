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

# Cache namespace prevents test fixture data from poisoning real-data
# caches. Tests override to "test"; production keeps the default.
CACHE_NAMESPACE = "production-v1"

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
                "enum": ["insufficient_data", "model_declined"],
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
