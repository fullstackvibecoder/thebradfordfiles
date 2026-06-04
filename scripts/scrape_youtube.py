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

DATA_DIR = ROOT / "data"
TRANSCRIPTS_DIR = ROOT / "transcripts"
TRANSCRIPTS_DIR.mkdir(exist_ok=True)

_HASHTAG_RE = re.compile(r"#([\wÀ-￿][\wÀ-￿._]*)")
_MENTION_RE = re.compile(r"(?:^|[^\w])@([A-Za-z0-9._]{1,30})")


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
    caption = "\n\n".join(p for p in (title, desc) if p)[:6000]
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


import time

import requests  # noqa: E402

API_BASE = "https://www.googleapis.com/youtube/v3"


def _parse_iso8601_duration(s: str) -> float | None:
    """'PT10M12S' -> 612.0 seconds. Returns None if unparseable."""
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return None
    h, mi, se = (int(x) if x else 0 for x in m.groups())
    return float(h * 3600 + mi * 60 + se)


def _get(url: str, params: dict, retries: int = 3) -> dict:
    """GET with small fixed-backoff retry. Raises on final failure."""
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt < retries - 1:
                time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"YouTube API GET failed after {retries}: {last!r}")


def list_channel_videos(channel_id: str, api_key: str, limit: int | None = None) -> list[dict]:
    """Return flattened video dicts (id/title/description/published_at/duration_seconds/
    like_count/comment_count) for a channel's uploads, newest first."""
    ch = _get(f"{API_BASE}/channels",
              {"part": "contentDetails", "id": channel_id, "key": api_key})
    items = ch.get("items") or []
    if not items:
        raise RuntimeError(f"channel not found: {channel_id}")
    uploads = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]

    video_ids: list[str] = []
    page = ""
    while True:
        pl = _get(f"{API_BASE}/playlistItems",
                  {"part": "contentDetails", "playlistId": uploads,
                   "maxResults": 50, "pageToken": page, "key": api_key})
        video_ids += [it["contentDetails"]["videoId"] for it in pl.get("items", [])]
        if limit and len(video_ids) >= limit:
            video_ids = video_ids[:limit]
            break
        page = pl.get("nextPageToken", "")
        if not page:
            break
        time.sleep(0.2)

    out: list[dict] = []
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        vr = _get(f"{API_BASE}/videos",
                  {"part": "snippet,contentDetails,statistics",
                   "id": ",".join(batch), "key": api_key})
        for v in vr.get("items", []):
            sn, cd, st = v.get("snippet", {}), v.get("contentDetails", {}), v.get("statistics", {})
            out.append({
                "id": v["id"],
                "title": sn.get("title", ""),
                "description": sn.get("description", ""),
                "published_at": sn.get("publishedAt"),
                "duration_seconds": _parse_iso8601_duration(cd.get("duration", "")),
                "like_count": st.get("likeCount"),
                "comment_count": st.get("commentCount"),
            })
    return out


def fetch_transcript(video_id: str, date: str) -> str | None:
    """Try captions via youtube-transcript-api; fall back to yt-dlp audio + Whisper.
    Writes the result to the transcript cache and returns it (or None)."""
    out_txt = TRANSCRIPTS_DIR / f"{date[:10]}_{video_id}.txt"
    if out_txt.exists():
        return out_txt.read_text().strip() or None
    text = None
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        chunks = YouTubeTranscriptApi.get_transcript(video_id)
        text = " ".join(c["text"] for c in chunks).strip()
    except Exception as e:  # noqa: BLE001
        log(f"  no captions for {video_id} ({e!r}); will try audio")
    if not text:
        text = _whisper_from_audio(video_id, date)
    if text:
        out_txt.write_text(text)
    return text or None


def _whisper_from_audio(video_id: str, date: str) -> str | None:
    """yt-dlp downloads audio to a temp file; transcribe with Whisper. Returns
    None on any failure (caller proceeds caption-only)."""
    import subprocess
    import tempfile
    try:
        with tempfile.TemporaryDirectory() as td:
            audio = Path(td) / f"{video_id}.m4a"
            subprocess.run(
                ["yt-dlp", "-f", "bestaudio", "-o", str(audio),
                 f"https://www.youtube.com/watch?v={video_id}"],
                check=True, capture_output=True, timeout=600)
            import whisper
            model = whisper.load_model("small.en")
            return (model.transcribe(str(audio)).get("text") or "").strip() or None
    except Exception as e:  # noqa: BLE001
        log(f"  audio transcription failed for {video_id}: {e!r}")
        return None


def _existing_shortcodes(path: Path) -> set[str]:
    if not path.exists():
        return set()
    out = set()
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                out.add(json.loads(line)["shortcode"])
            except Exception:  # noqa: BLE001
                pass
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--account", required=True, help="YouTube source handle (data/<account>/)")
    p.add_argument("--limit", type=int, default=None, help="cap number of videos this run")
    args = p.parse_args(argv)

    manifest_path = DATA_DIR / args.account / "candidate.json"
    if not manifest_path.exists():
        log(f"FATAL: no candidate.json for {args.account}")
        return 1
    manifest = json.loads(manifest_path.read_text())
    channel_id = manifest.get("youtube_channel_id")
    if not channel_id:
        log(f"FATAL: {args.account} manifest has no youtube_channel_id")
        return 1
    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        log("FATAL: YOUTUBE_API_KEY not set in env / .env")
        return 1

    acc_dir = DATA_DIR / args.account
    acc_dir.mkdir(parents=True, exist_ok=True)
    posts_file = acc_dir / "posts.jsonl"
    seen = _existing_shortcodes(posts_file)
    log(f"channel {channel_id} · {len(seen)} videos already on file")

    videos = list_channel_videos(channel_id, api_key, limit=args.limit)
    written = 0
    with posts_file.open("a", encoding="utf-8") as f:
        for v in videos:
            if v["id"] in seen:
                continue
            rec = youtube_post_to_record(v)
            fetch_transcript(v["id"], rec["date"])  # caches transcript internally
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            written += 1
            log(f"  + {rec['date'][:10]} {v['id']} · {rec['caption_length']} chars")
    log(f"done. wrote {written} new posts -> {posts_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
