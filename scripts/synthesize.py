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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.lib import synthesis as _s  # type: ignore  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
# Load .env so direct `python scripts/synthesize_all.py` runs get ANTHROPIC_API_KEY
# (matches triage.py/extract.py; build_all.sh also sources .env for belt-and-suspenders).
load_dotenv(ROOT / ".env")


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
            "cache_namespace": _s.CACHE_NAMESPACE,
            "synthesis_generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "synthesis_skipped_reason": "insufficient_data",
        }
        out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
        return out_path

    # Cache check.
    if not force:
        cached = _s.load_cached_synthesis(handle, topic)
        if _s.is_cache_valid(cached, records_hash, _s.SYSTEM_PROMPT_HASH,
                             _s.MODEL, _s.CACHE_NAMESPACE):
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

    # Sprint 8A: reject degenerate responses (all-null without skipped_reason).
    if (tool_input.get("summary") is None
            and tool_input.get("consistency") is None
            and tool_input.get("synthesis_skipped_reason") is None):
        raise ValueError(
            f"degenerate model response for ({handle}, {topic}): "
            "all fields null and no synthesis_skipped_reason provided"
        )

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
        "cache_namespace": _s.CACHE_NAMESPACE,
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
