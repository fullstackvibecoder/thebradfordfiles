#!/usr/bin/env python3
"""build_site.py: assemble per-candidate dossiers + landing JSON.

Reads candidate manifests under data/<handle>/candidate.json plus their
triage/records/posts/extracted data, and writes:

  site/landing.json                  -- one row per candidate for the card grid
  site/candidates/<slug>.json        -- full dossier per candidate
  site/<slug>/index.html             -- per-candidate page from the template
  site/data.json                     -- back-compat aggregate (kept for now)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import candidates as _candidates  # type: ignore  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SITE_DIR = ROOT / "site"
MATCHES_FILE = DATA_DIR / "votes" / "matches.jsonl"


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


def _load_matches() -> dict[str, dict]:
    if not MATCHES_FILE.exists():
        return {}
    out: dict[str, dict] = {}
    for line in MATCHES_FILE.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            m = json.loads(line)
        except json.JSONDecodeError:
            continue
        sc = m.get("record_shortcode")
        if not sc:
            continue
        existing = out.get(sc)
        if not existing or m.get("confidence", 0) > existing.get("confidence", 0):
            out[sc] = m
    return out


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


def _candidate_dossier(manifest: dict, matches_by_sc: dict[str, dict]) -> dict:
    handle = manifest["handle"]
    handles_to_load = [handle] + manifest.get("alias_handles", [])

    records: list[dict] = []
    posts_index: dict[str, dict] = {}
    triages: list[dict] = []
    skip_log: list[dict] = []
    extracted: list[dict] = []

    for h in handles_to_load:
        d = DATA_DIR / h
        if not d.exists():
            continue
        records.extend(_load_jsonl(d / "records.jsonl"))
        for p in _load_jsonl(d / "posts.jsonl"):
            sc = p.get("shortcode")
            if sc:
                posts_index[sc] = {**p, "source_account": h}
        for t in _load_jsonl(d / "triage.jsonl"):
            triages.append(t)
            if t.get("triage", {}).get("bucket") == "skip":
                skip_log.append({
                    "shortcode": t.get("shortcode"),
                    "source_account": h,
                    "date": t.get("date", ""),
                    "url": t.get("url", ""),
                    "type": t.get("type", ""),
                    "caption_excerpt": t.get("caption_excerpt", ""),
                    "reason": t.get("triage", {}).get("reason", ""),
                })
        extracted.extend(_load_jsonl(d / "extracted.jsonl"))

    for r in records:
        r.setdefault("candidate_slug", manifest["slug"])
        r.setdefault("source_account", handle)
        if r.get("kind") == "action":
            sc = r.get("shortcode")
            if sc and sc in matches_by_sc:
                r["council_verification"] = matches_by_sc[sc]

    records.sort(key=lambda r: r.get("post_date", ""), reverse=True)
    skip_log.sort(key=lambda r: r.get("date", ""), reverse=True)

    triage_buckets = Counter(t.get("triage", {}).get("bucket", "?") for t in triages)
    record_kinds = Counter(r.get("kind", "?") for r in records)
    record_topics = Counter(r.get("topic") for r in records if r.get("topic"))

    substantive_posts = {t["shortcode"] for t in triages
                         if t.get("triage", {}).get("bucket") == "substantive" and t.get("shortcode")}
    emphasis: dict[str, float] = {}
    if substantive_posts:
        topic_post_count: dict[str, set[str]] = {}
        for r in records:
            sc = r.get("shortcode")
            t = r.get("topic")
            if not (sc and t and sc in substantive_posts):
                continue
            topic_post_count.setdefault(t, set()).add(sc)
        for topic, scs in topic_post_count.items():
            emphasis[topic] = round(100 * len(scs) / len(substantive_posts), 1)

    dates = sorted(t["date"][:10] for t in triages if t.get("date"))
    earliest = dates[0] if dates else None
    latest = dates[-1] if dates else None

    synthesis_by_topic = _load_synthesis_for_handle(handle)

    return {
        "meta": {
            **manifest,
            "post_count": len(triages),
            "extracted_count": len(extracted),
            "record_count": len(records),
            "buckets": dict(triage_buckets),
            "record_kinds": dict(record_kinds.most_common()),
            "record_topics": dict(record_topics.most_common()),
            "emphasis": emphasis,
            "synthesis": synthesis_by_topic,
            "consistency_dot": _consistency_dot_color(synthesis_by_topic),
            "date_range": {"earliest": earliest, "latest": latest},
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "records": records,
        "posts": posts_index,
        "skip_log": skip_log,
    }


def _landing_card(dossier: dict) -> dict:
    m = dossier["meta"]
    return {
        "slug": m["slug"],
        "surname": m["surname"],
        "display_name": m["display_name"],
        "files_label": m["files_label"],
        "current_role": m.get("current_role", ""),
        "candidacy_status": m.get("candidacy_status", "unknown"),
        "declared_date": m.get("declared_date"),
        "result_2023": m.get("result_2023"),
        "platform_pillars": m.get("platform_pillars", []),
        "post_count": m["post_count"],
        "record_count": m["record_count"],
        "extracted_count": m["extracted_count"],
        "emphasis": m.get("emphasis", {}),
        "date_range": m["date_range"],
        "consistency_dot": m.get("consistency_dot", "gray"),
    }


def _build_tagline(manifest: dict) -> str:
    name = manifest["display_name"]
    role = manifest.get("current_role", "")
    return (
        f"{name} — {role}. A sourced record of their public political "
        f"content on Instagram: positions, pledges, council actions, "
        f"endorsements, and appearances."
    )


def _emit_candidate_html(manifest: dict) -> None:
    slug = manifest["slug"]
    template_path = SITE_DIR / "candidate-template.html"
    if not template_path.exists():
        print(f"  WARN: candidate-template.html not found; skipping HTML for {slug}")
        return
    template = template_path.read_text()
    rendered = (
        template
        .replace("__CANDIDATE_DOSSIER__", f"/candidates/{slug}.json")
        .replace("__FILES_LABEL__", manifest["files_label"])
        .replace("__BRAND_TAGLINE__", _build_tagline(manifest))
        .replace("__TURNSTILE_SITE_KEY__",
                 os.environ.get("TURNSTILE_SITE_KEY", "__TURNSTILE_SITE_KEY__"))
    )
    out_dir = SITE_DIR / slug
    out_dir.mkdir(exist_ok=True)
    (out_dir / "index.html").write_text(rendered)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.parse_args(argv)

    SITE_DIR.mkdir(exist_ok=True)
    (SITE_DIR / "candidates").mkdir(exist_ok=True)

    primaries = _candidates.load_all_candidates()
    if not primaries:
        print("[build] no candidates found in data/")
        return 0

    matches_by_sc = _load_matches()

    landing_cards: list[dict] = []
    combined_records: list[dict] = []
    combined_posts: dict[str, dict] = {}
    combined_skip: list[dict] = []

    for manifest in primaries:
        dossier = _candidate_dossier(manifest, matches_by_sc)
        slug = manifest["slug"]
        out_path = SITE_DIR / "candidates" / f"{slug}.json"
        out_path.write_text(json.dumps(dossier, ensure_ascii=False))
        size_kb = out_path.stat().st_size / 1024
        print(f"  wrote site/candidates/{slug}.json ({size_kb:.1f} KB, "
              f"{dossier['meta']['record_count']} records)")
        landing_cards.append(_landing_card(dossier))
        combined_records.extend(dossier["records"])
        combined_posts.update(dossier["posts"])
        combined_skip.extend(dossier["skip_log"])
        _emit_candidate_html(manifest)

    landing = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "candidates": landing_cards,
    }
    (SITE_DIR / "landing.json").write_text(json.dumps(landing, ensure_ascii=False, indent=2))
    print(f"  wrote site/landing.json ({len(landing_cards)} candidates)")

    combined = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "accounts": [c["slug"] for c in landing_cards],
            "record_count": len(combined_records),
        },
        "records": combined_records,
        "posts": combined_posts,
        "skip_log": combined_skip,
    }
    (SITE_DIR / "data.json").write_text(json.dumps(combined, ensure_ascii=False))
    print(f"  wrote site/data.json (back-compat, {len(combined_records)} records)")

    issues_path = SITE_DIR / "issues" / "index.html"
    if issues_path.exists():
        text = issues_path.read_text()
        text = text.replace(
            "__TURNSTILE_SITE_KEY__",
            os.environ.get("TURNSTILE_SITE_KEY", "__TURNSTILE_SITE_KEY__"),
        )
        issues_path.write_text(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
