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
import json as _json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.synthesize import synthesize_one, _default_client  # type: ignore  # noqa: E402
from scripts.lib import candidates as _candidates  # type: ignore  # noqa: E402

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
