#!/usr/bin/env python3
"""
triage.py — first-pass classifier for The Bradford Files.

For each Instagram post on @bradfordgrams, send the caption + post-type
metadata to Claude Haiku and decide whether the post belongs in one of three
buckets:

  substantive  — contains a stated political position, pledge, council action,
                 endorsement, public appearance, or substantive critique.
                 Earns expensive Opus extraction in a later step.
  contextual   — personal framing that informs character/values without being
                 purely personal (e.g., "as a dad I worry about safety in our
                 parks"). Earns a light summary record.
  skip         — purely personal moment with no civic substance (birthdays,
                 vacation snaps). Logged but not extracted.

Why triage first:
  Triage is ~$0.005/post (Haiku 4.5). Full extraction is ~$0.08/post (Opus).
  Skipping the obviously-personal posts up front saves both API spend and
  whisper compute. Every triage decision is logged with a reason so the filter
  is auditable.

Usage:
  python scripts/triage.py --limit 50          # pilot run on most recent 50
  python scripts/triage.py                     # full backfill, all posts
  python scripts/triage.py --since 2025-01-01  # since a date
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from instagrapi import Client as IGClient
from anthropic import Anthropic

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
TRIAGE_FILE = DATA_DIR / "triage.jsonl"
POSTS_FILE = DATA_DIR / "posts.jsonl"

ACCOUNT = "bradfordgrams"
HAIKU_MODEL = "claude-haiku-4-5"

# Topic vocabulary — keep stable across runs so extraction can group by topic
TOPICS = [
    "housing",
    "transit",
    "safety_crime",
    "taxes_fiscal",
    "parks_environment",
    "infrastructure",
    "civic_engagement",
    "governance_ethics",
    "small_business_economy",
    "social_services",
    "campaign_logistics",
    "endorsements",
    "personal_context",
    "other",
]

TRIAGE_TOOL = {
    "name": "triage_post",
    "description": (
        "Classify an Instagram post by its civic-political relevance. "
        "Be neutral, accurate, and conservative."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "bucket": {
                "type": "string",
                "enum": ["substantive", "contextual", "skip"],
                "description": (
                    "substantive: contains a stated position, pledge, "
                    "council action, endorsement (received or given), "
                    "substantive critique, or public appearance with "
                    "civic content. "
                    "contextual: personal framing that informs character or "
                    "values relevant to civic identity (e.g., 'as a dad', "
                    "'as a city planner'), without being purely personal. "
                    "skip: purely personal — birthdays, vacation, family "
                    "selfies, generic life moments — no civic substance."
                ),
            },
            "reason": {
                "type": "string",
                "description": (
                    "One sentence explaining the classification. Keep "
                    "neutral. No editorial language."
                ),
            },
            "topics": {
                "type": "array",
                "items": {"type": "string", "enum": TOPICS},
                "description": (
                    "Topics referenced. Empty for 'skip'. May include "
                    "'personal_context' for the contextual bucket."
                ),
            },
            "is_video": {
                "type": "boolean",
                "description": "Whether this post contains video (reel or video post).",
            },
            "needs_transcript": {
                "type": "boolean",
                "description": (
                    "True if the post is a video AND triage suggests the "
                    "spoken content (not just the caption) likely contains "
                    "extractable substance. False for caption-only signal."
                ),
            },
        },
        "required": ["bucket", "reason", "topics", "is_video", "needs_transcript"],
    },
}

SYSTEM_PROMPT = """You are a classifier for an independent civic-transparency \
project documenting the public political record of Brad Bradford \
(@bradfordgrams), a Toronto City Councillor running for Mayor of Toronto in \
2026. The project is neutral — neither advocacy nor opposition. Every \
classification will be auditable and logged.

Your job is to decide which of three buckets a single post belongs in:

  • substantive — the post contains a stated POLITICAL POSITION, PLEDGE \
(future-tense commitment), past COUNCIL ACTION (motion, vote, project), \
ENDORSEMENT (given or received), substantive CRITIQUE of policy or governance, \
or PUBLIC APPEARANCE with civic content (town hall, community event, ribbon \
cutting). Anything a voter would reasonably want to know to evaluate him as a \
candidate.

  • contextual — the post is personal but the framing informs civic identity. \
Examples: 'as a dad I worry about park safety', 'as a city planner I know …', \
references to his neighborhood, references to his role at Council in passing. \
This bucket gets a light note for character context, not full extraction.

  • skip — purely personal: birthdays, vacation, family selfies, sports \
celebrations, generic life moments, jokes, food. No civic content, no civic \
framing.

Be conservative on 'substantive' — only mark it that way if there is concrete \
political signal. Be liberal on 'contextual' for ambiguous cases. Be honest \
about 'skip' when there is no substance.

Topic taxonomy (controlled vocabulary):
  housing, transit, safety_crime, taxes_fiscal, parks_environment, \
infrastructure, civic_engagement, governance_ethics, small_business_economy, \
social_services, campaign_logistics, endorsements, personal_context, other.

Use 'campaign_logistics' for purely organizational announcements (rallies, \
fundraisers, account changes). Use 'personal_context' only for the contextual \
bucket.

Reason field: one sentence, neutral, no editorial words like 'troubling' or \
'admirable'. Just describe what's in the post and why it fits the bucket."""


def log(msg: str) -> None:
    print(f"[triage] {msg}", flush=True)


SETTINGS_FILE = ROOT / "data" / ".ig-session.json"


def get_client() -> IGClient:
    """Return an instagrapi Client signed in via IG_SESSIONID. Caches device
    fingerprint + session to data/.ig-session.json so we don't re-login on
    every run (which would look more bot-like to IG)."""
    sessionid = os.environ.get("IG_SESSIONID", "").strip()
    if not sessionid:
        log("FATAL: IG_SESSIONID not set in environment / .env")
        sys.exit(1)

    cl = IGClient()
    # Reuse cached session settings if present
    if SETTINGS_FILE.exists():
        try:
            cl.load_settings(SETTINGS_FILE)
        except Exception as e:
            log(f"warn: could not load cached settings ({e}); continuing fresh")

    try:
        cl.login_by_sessionid(sessionid)
    except Exception as e:
        log(f"FATAL: login_by_sessionid failed: {e}")
        sys.exit(1)

    if not cl.user_id:
        log("FATAL: session cookie did not authenticate. Re-grab IG_SESSIONID.")
        sys.exit(1)

    log(f"authenticated as @{cl.username} (uid {cl.user_id})")

    # Save fresh settings for next run
    try:
        cl.dump_settings(SETTINGS_FILE)
    except Exception:
        pass
    return cl


_HASHTAG_RE = None
_MENTION_RE = None


def _extract_tags(caption: str) -> tuple[list[str], list[str]]:
    """Return (hashtags, mentions) from a caption string."""
    global _HASHTAG_RE, _MENTION_RE
    import re as _re
    if _HASHTAG_RE is None:
        _HASHTAG_RE = _re.compile(r"#([\wÀ-￿][\wÀ-￿._]*)")
        _MENTION_RE = _re.compile(r"(?:^|[^\w])@([A-Za-z0-9._]{1,30})")
    text = caption or ""
    return (
        [m.group(1) for m in _HASHTAG_RE.finditer(text)][:25],
        [m.group(1) for m in _MENTION_RE.finditer(text)][:25],
    )


# instagrapi media_type → human label
_MEDIA_TYPE = {1: "image", 2: "video", 8: "carousel"}


def post_to_record(media) -> dict:
    """Extract the fields we want from an instagrapi Media object."""
    caption = media.caption_text or ""
    hashtags, mentions = _extract_tags(caption)
    is_video = (media.media_type == 2) or (getattr(media, "product_type", "") in {"clips", "feed", "igtv"})
    location = None
    try:
        if media.location:
            location = media.location.name
    except Exception:
        pass
    return {
        "shortcode": media.code,
        "url": f"https://www.instagram.com/p/{media.code}/",
        "date": media.taken_at.replace(tzinfo=timezone.utc).isoformat(timespec="seconds")
                if media.taken_at.tzinfo is None
                else media.taken_at.astimezone(timezone.utc).isoformat(timespec="seconds"),
        "type": _MEDIA_TYPE.get(media.media_type, str(media.media_type)),
        "product_type": getattr(media, "product_type", None),
        "is_video": bool(is_video),
        "video_duration": float(media.video_duration) if is_video and media.video_duration else None,
        "caption": caption[:6000],
        "caption_length": len(caption),
        "likes": media.like_count or 0,
        "comments": media.comment_count or 0,
        "mentions": mentions,
        "hashtags": hashtags,
        "location": location,
    }


def existing_shortcodes(path: Path) -> set[str]:
    if not path.exists():
        return set()
    out = set()
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.add(json.loads(line)["shortcode"])
        except Exception:
            pass
    return out


VALID_BUCKETS = {"substantive", "contextual", "skip"}


def normalize_triage(triage: dict) -> dict:
    """Validate Haiku output. If the model returned a non-enum bucket value
    (e.g., a topic name leaking into the bucket field), coerce to 'contextual'
    and mark the row so it can be audited."""
    bucket = triage.get("bucket")
    if bucket not in VALID_BUCKETS:
        # Common slip: model returns a topic in the bucket slot. Be conservative —
        # mark as contextual (still visible in the transparency log) and flag.
        triage["_original_bucket"] = bucket
        triage["bucket"] = "contextual"
        triage["_coerced"] = True
    # Make sure topics is a list
    if not isinstance(triage.get("topics"), list):
        triage["topics"] = []
    return triage


def triage_one(post_record: dict, client: Anthropic) -> dict:
    """Send one post to Haiku for classification. Returns the tool input dict."""
    user = (
        f"Date: {post_record['date']}\n"
        f"Type: {post_record['type']}\n"
        f"Is video: {post_record['is_video']}\n"
        f"Likes: {post_record['likes']}, Comments: {post_record['comments']}\n"
        f"Mentions: {', '.join(post_record['mentions'][:10]) or '(none)'}\n"
        f"Hashtags: {', '.join('#' + h for h in post_record['hashtags'][:10]) or '(none)'}\n"
        f"Location: {post_record['location'] or '(none)'}\n\n"
        f"Caption:\n{post_record['caption'] or '(no caption)'}\n\n"
        f"Classify."
    )
    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        tools=[TRIAGE_TOOL],
        tool_choice={"type": "tool", "name": "triage_post"},
        messages=[{"role": "user", "content": user}],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return block.input
    return {
        "bucket": "skip",
        "reason": "(triage failed to return a tool_use block)",
        "topics": [],
        "is_video": post_record["is_video"],
        "needs_transcript": False,
    }


def append_jsonl(path: Path, row: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None,
                   help="max number of posts to process this run (oldest-skipped first)")
    p.add_argument("--since", type=str, default=None,
                   help="only process posts on or after this ISO date (YYYY-MM-DD)")
    p.add_argument("--dry-run", action="store_true",
                   help="enumerate + write posts.jsonl, but skip the Claude triage call")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        log("FATAL: ANTHROPIC_API_KEY not set in environment / .env")
        return 1

    client = Anthropic()
    cl = get_client()

    log(f"loading profile @{ACCOUNT}")
    user_id = cl.user_id_from_username(ACCOUNT)
    user_info = cl.user_info(user_id)
    log(
        f"profile: {user_info.full_name} · {user_info.media_count:,} posts · "
        f"{user_info.follower_count:,} followers"
    )

    seen_posts = existing_shortcodes(POSTS_FILE)
    seen_triage = existing_shortcodes(TRIAGE_FILE)
    log(f"already on file: {len(seen_posts):,} posts, {len(seen_triage):,} triaged")

    since_dt = None
    if args.since:
        since_dt = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)

    counts = {"substantive": 0, "contextual": 0, "skip": 0, "errors": 0}
    n_processed = 0
    started = time.time()

    # Pagination strategy:
    #   When --limit is given, fetch exactly that many newest posts (cheap,
    #   serves the pilot). Otherwise paginate in chunks of 50 until we run
    #   out (the full backfill).
    if args.limit is not None:
        log(f"fetching {args.limit} most recent posts")
        medias = cl.user_medias(user_id, amount=args.limit)
        posts_iter = iter(medias)
    else:
        log("paginating full account (this can take a while)")
        def _all():
            end_cursor = ""
            while True:
                chunk, end_cursor = cl.user_medias_paginated(user_id, amount=50, end_cursor=end_cursor)
                if not chunk:
                    break
                for m in chunk:
                    yield m
                if not end_cursor:
                    break
                time.sleep(2.0)  # polite pause between pages
        posts_iter = _all()

    for media in posts_iter:
        if args.limit is not None and n_processed >= args.limit:
            break

        rec_date = media.taken_at
        if rec_date.tzinfo is None:
            rec_date = rec_date.replace(tzinfo=timezone.utc)
        if since_dt and rec_date < since_dt:
            log(f"reached --since cutoff ({args.since}); stopping")
            break

        if media.code in seen_triage:
            continue

        try:
            rec = post_to_record(media)
        except Exception as e:
            log(f"skip {media.code}: extraction error {e!r}")
            counts["errors"] += 1
            continue

        if media.code not in seen_posts:
            append_jsonl(POSTS_FILE, rec)
            seen_posts.add(media.code)

        if args.dry_run:
            n_processed += 1
            log(f"[dry] {rec['date'][:10]} {rec['shortcode']} {rec['type']} · {rec['caption_length']} chars")
            continue

        try:
            triage = normalize_triage(triage_one(rec, client))
        except Exception as e:
            log(f"triage error on {rec['shortcode']}: {e!r}; skipping")
            counts["errors"] += 1
            continue

        triage_row = {
            "shortcode": rec["shortcode"],
            "date": rec["date"],
            "url": rec["url"],
            "type": rec["type"],
            "is_video": rec["is_video"],
            "caption_excerpt": (rec["caption"] or "")[:200],
            "triage": triage,
            "triaged_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": HAIKU_MODEL,
        }
        append_jsonl(TRIAGE_FILE, triage_row)
        seen_triage.add(rec["shortcode"])

        bucket = triage.get("bucket", "skip")
        counts[bucket] = counts.get(bucket, 0) + 1
        n_processed += 1

        log(
            f"{rec['date'][:10]} {rec['shortcode']:<14} {rec['type']:<10} "
            f"→ {bucket:<11} {triage.get('reason', '')[:80]}"
        )

        # Progress checkpoint every 100 posts
        if n_processed % 100 == 0:
            elapsed = time.time() - started
            rate = n_processed / elapsed
            log(
                f"--- progress: {n_processed} processed in {elapsed/60:.1f}min "
                f"(rate {rate:.1f}/sec) · "
                f"sub={counts['substantive']} ctx={counts['contextual']} "
                f"skip={counts['skip']} err={counts['errors']} ---"
            )

        # Polite pacing for both Anthropic and Instagram
        time.sleep(0.4)

    dur = time.time() - started
    log("")
    log(f"done. processed {n_processed} posts in {dur:.1f}s")
    log(f"  substantive: {counts['substantive']}")
    log(f"  contextual:  {counts['contextual']}")
    log(f"  skip:        {counts['skip']}")
    log(f"  errors:      {counts['errors']}")
    log(f"output: {TRIAGE_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
