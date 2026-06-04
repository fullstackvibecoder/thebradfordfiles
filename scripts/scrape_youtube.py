#!/usr/bin/env python3
"""scrape_youtube.py — ingest a candidate's YouTube channel into a normalized
posts.jsonl (+ a pre-populated transcript cache), so the existing triage.py
(--no-fetch) and extract.py can process it exactly like Instagram.

Usage:
  python scripts/scrape_youtube.py --account oliviachow-yt
  python scripts/scrape_youtube.py --account oliviachow-yt --limit 20
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import candidates as _candidates  # noqa: E402

DATA_DIR = ROOT / "data"
TRANSCRIPTS_DIR = ROOT / "transcripts"
TRANSCRIPTS_DIR.mkdir(exist_ok=True)

_HASHTAG_RE = re.compile(r"#([\w][\w._]*)")
_MENTION_RE = re.compile(r"(?:^|[^\w])@([A-Za-z0-9._]{1,60})")


def log(msg: str) -> None:
    print(f"[yt] {msg}", flush=True)


def _iso_utc(published_at: str) -> str:
    """Normalize an RFC3339 'Z' timestamp to UTC ISO with seconds precision."""
    dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def youtube_post_to_record(video: dict) -> dict:
    """Map a YouTube Data API video dict (already flattened by list_channel_videos)
    to the normalized posts.jsonl schema shared with the Instagram path."""
    title = video.get("title", "") or ""
    desc = video.get("description", "") or ""
    caption = (title + ("\n\n" + desc if desc else ""))[:6000]
    return {
        "shortcode": video["id"],
        "url": f"https://www.youtube.com/watch?v={video['id']}",
        "date": _iso_utc(video["published_at"]),
        "type": "video",
        "product_type": "youtube",
        "is_video": True,
        "video_duration": (float(video["duration_seconds"])
                           if video.get("duration_seconds") is not None else None),
        "caption": caption,
        "caption_length": len(caption),
        "likes": int(video.get("like_count") or 0),
        "comments": int(video.get("comment_count") or 0),
        "mentions": [m.group(1) for m in _MENTION_RE.finditer(desc)][:25],
        "hashtags": [m.group(1) for m in _HASHTAG_RE.finditer(desc)][:25],
        "location": None,
        "source_platform": "youtube",
    }
