#!/usr/bin/env python3
"""Convert City of Toronto council voting record JSON files into JSONL +
per-councillor index. Source files: data/votes/raw-source. Output: data/votes/."""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "City Council Member Voting Record 2006-2026"
OUT_DIR = ROOT / "data" / "votes"


def _slug(text: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in (text or "")).strip("-")


def _ingest_file(path: Path, raw_out: Path) -> list[dict]:
    rows = json.loads(path.read_text())
    raw_out.parent.mkdir(parents=True, exist_ok=True)
    with raw_out.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.parse_args(argv)
    if not SOURCE_DIR.exists():
        print(f"FATAL: source dir not found: {SOURCE_DIR}")
        return 1
    raw_dir = OUT_DIR / "raw"
    by_councillor_dir = OUT_DIR / "by-councillor"
    by_councillor_dir.mkdir(parents=True, exist_ok=True)
    by_councillor: dict[str, list[dict]] = defaultdict(list)
    total = 0
    for src in sorted(SOURCE_DIR.glob("member-voting-record-*.json")):
        term = src.stem.replace("member-voting-record-", "")
        out = raw_dir / f"{term}.jsonl"
        rows = _ingest_file(src, out)
        print(f"  {term}: {len(rows):,} votes")
        total += len(rows)
        for r in rows:
            first, last = r.get("First Name", ""), r.get("Last Name", "")
            if not last:
                continue
            by_councillor[f"{_slug(last)}-{_slug(first)}"].append(r)
    for key, votes in by_councillor.items():
        with (by_councillor_dir / f"{key}.jsonl").open("w", encoding="utf-8") as f:
            for v in votes:
                f.write(json.dumps(v, ensure_ascii=False) + "\n")
    print(f"\n  total: {total:,} votes, {len(by_councillor)} unique councillors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
