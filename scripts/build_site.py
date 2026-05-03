#!/usr/bin/env python3
"""
build_site.py — assemble site/data.json for The Bradford Files dashboard.

Reads:
  data/<account>/records.jsonl    — structured records from extract.py
  data/<account>/posts.jsonl      — full post metadata
  data/<account>/triage.jsonl     — per-post triage decisions
  data/<account>/extracted.jsonl  — per-post completion log

Writes:
  site/data.json — single source of truth for the dashboard

Run:
  python scripts/build_site.py
  python scripts/build_site.py --accounts bradfordgrams beybradford
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SITE_DIR = ROOT / "site"
SITE_DIR.mkdir(exist_ok=True)
OUT = SITE_DIR / "data.json"


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            pass
    return rows


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--accounts",
        nargs="+",
        default=["bradfordgrams", "beybradford"],
        help="Account directories under data/ to merge",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    all_records: list[dict] = []
    posts_by_code: dict[str, dict] = {}
    triage_by_code: dict[str, dict] = {}
    extracted_by_code: dict[str, dict] = {}
    skip_log: list[dict] = []

    per_account_stats: dict[str, dict] = {}

    for account in args.accounts:
        acc_dir = DATA_DIR / account
        if not acc_dir.exists():
            print(f"  [skip] {account}: data dir not present")
            continue

        records = load_jsonl(acc_dir / "records.jsonl")
        posts = load_jsonl(acc_dir / "posts.jsonl")
        triages = load_jsonl(acc_dir / "triage.jsonl")
        extracted = load_jsonl(acc_dir / "extracted.jsonl")

        # Tag every record with its source account so the UI can split if needed
        for r in records:
            r.setdefault("source_account", account)
        all_records.extend(records)

        # Index posts by shortcode (account-qualified key in case of collision —
        # IG shortcodes are globally unique but be defensive)
        for p in posts:
            sc = p.get("shortcode")
            if not sc:
                continue
            posts_by_code[sc] = {**p, "source_account": account}

        # Index triage decisions
        triage_buckets = Counter()
        for t in triages:
            sc = t.get("shortcode")
            if not sc:
                continue
            triage_by_code[sc] = {**t, "source_account": account}
            triage_buckets[t.get("triage", {}).get("bucket", "unknown")] += 1
            # Skipped posts get logged for transparency
            if t.get("triage", {}).get("bucket") == "skip":
                skip_log.append({
                    "shortcode": sc,
                    "source_account": account,
                    "date": t.get("date", ""),
                    "url": t.get("url", ""),
                    "type": t.get("type", ""),
                    "caption_excerpt": t.get("caption_excerpt", ""),
                    "reason": t.get("triage", {}).get("reason", ""),
                })

        for e in extracted:
            sc = e.get("shortcode")
            if sc:
                extracted_by_code[sc] = {**e, "source_account": account}

        per_account_stats[account] = {
            "total_posts": len(triages),
            "buckets": dict(triage_buckets),
            "extracted_posts": len(extracted),
            "records": len(records),
            "earliest": min((t["date"][:10] for t in triages), default=None),
            "latest": max((t["date"][:10] for t in triages), default=None),
        }

    # Aggregate stats across accounts
    record_kinds = Counter(r.get("kind", "?") for r in all_records)
    record_topics = Counter(r.get("topic") for r in all_records if r.get("topic"))

    # Sort all records newest first by post_date
    all_records.sort(key=lambda r: r.get("post_date", ""), reverse=True)

    # Sort skip log newest first
    skip_log.sort(key=lambda r: r.get("date", ""), reverse=True)

    out = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "accounts": args.accounts,
            "per_account": per_account_stats,
            "record_count": len(all_records),
            "record_kinds": dict(record_kinds.most_common()),
            "record_topics": dict(record_topics.most_common()),
        },
        "records": all_records,
        "posts": posts_by_code,
        "skip_log": skip_log,
    }

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=None) + "\n")

    size_kb = OUT.stat().st_size / 1024
    print(f"  wrote site/data.json ({size_kb:.1f} KB, {len(all_records):,} records)")
    print(f"  per-account:")
    for acc, s in per_account_stats.items():
        print(f"    @{acc}: {s['records']:,} records · {s['extracted_posts']:,} posts extracted · {s['total_posts']:,} triaged · {s['earliest']} → {s['latest']}")
    print(f"  record kinds: {dict(record_kinds.most_common(7))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
