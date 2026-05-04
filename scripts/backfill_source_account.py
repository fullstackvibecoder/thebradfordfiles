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
