# YouTube Ingestion Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest candidate-owned YouTube channels as alias sources that merge into the same per-candidate dossier as Instagram, reusing the existing triage/extract pipeline and candidate-aware prompts.

**Architecture:** A YouTube channel is an `alias_of` a primary candidate. A new `scrape_youtube.py` writes a normalized `posts.jsonl` and pre-caches transcripts; `triage.py` gains `--no-fetch` to triage that file without touching Instagram; triage/extract resolve an alias source's prompt framing to its primary via a new `resolve_prompt_manifest`; `build_site.py` threads `source_platform`. The Instagram scrape path is left untouched.

**Tech Stack:** Python 3, pytest, `requests` (YouTube Data API v3), `youtube-transcript-api`, `yt-dlp`, existing Whisper. Tests run with `.venv/bin/python -m pytest`; all external services are mocked.

---

### Task 1: Add dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add the three deps**

Append to `requirements.txt`:

```
youtube-transcript-api>=0.6
yt-dlp>=2024.0
requests>=2.31
```

- [ ] **Step 2: Install**

Run: `.venv/bin/pip install -r requirements.txt`
Expected: installs cleanly (or "Requirement already satisfied").

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add requirements.txt
git commit -m "deps(sprint-17): youtube-transcript-api, yt-dlp, requests"
```

---

### Task 2: `resolve_prompt_manifest` helper

**Files:**
- Modify: `scripts/lib/candidates.py` (append)
- Test: `tests/test_resolve_prompt_manifest.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_resolve_prompt_manifest.py`:

```python
"""Tests for alias-source prompt framing resolution."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import candidates


def _seed(dirpath, **fields):
    dirpath.mkdir(parents=True, exist_ok=True)
    (dirpath / "candidate.json").write_text(json.dumps(fields))


def test_alias_resolves_to_primary(tmp_path, monkeypatch):
    _seed(tmp_path / "oliviachow", handle="oliviachow", display_name="Olivia Chow",
          surname="Chow", pronouns="she/her", incumbency="incumbent")
    _seed(tmp_path / "oliviachow-yt", handle="oliviachow-yt", alias_of="oliviachow",
          source_platform="youtube", youtube_channel_id="UC123")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    m = candidates.resolve_prompt_manifest("oliviachow-yt")
    assert m["display_name"] == "Olivia Chow"
    assert m["incumbency"] == "incumbent"


def test_primary_resolves_to_self(tmp_path, monkeypatch):
    _seed(tmp_path / "oliviachow", handle="oliviachow", display_name="Olivia Chow",
          surname="Chow", pronouns="she/her", incumbency="incumbent")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    m = candidates.resolve_prompt_manifest("oliviachow")
    assert m["display_name"] == "Olivia Chow"


def test_missing_handle_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    assert candidates.resolve_prompt_manifest("nobody") is None


def test_alias_with_missing_primary_falls_back_to_alias(tmp_path, monkeypatch):
    _seed(tmp_path / "orphan-yt", handle="orphan-yt", alias_of="ghost",
          source_platform="youtube")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    m = candidates.resolve_prompt_manifest("orphan-yt")
    assert m["handle"] == "orphan-yt"  # graceful: never crashes on misconfig
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_resolve_prompt_manifest.py -v`
Expected: FAIL — `AttributeError: ... has no attribute 'resolve_prompt_manifest'`

- [ ] **Step 3: Implement**

Append to `scripts/lib/candidates.py`:

```python
def resolve_prompt_manifest(handle: str) -> dict | None:
    """Return the manifest whose framing should drive triage/extraction prompts
    for `handle`. If `handle` is an alias source (has `alias_of`), return the
    PRIMARY candidate's manifest so the alias inherits the primary's pronouns/
    incumbency/framing. Otherwise return the handle's own manifest. Falls back
    to the alias's own manifest if the named primary is missing (graceful on
    misconfig); returns None only if `handle` itself has no manifest."""
    own = load_candidate(handle)
    if own is None:
        return None
    primary_handle = own.get("alias_of")
    if primary_handle:
        return load_candidate(primary_handle) or own
    return own
```

- [ ] **Step 4: Run it, verify PASS**

Run: `.venv/bin/python -m pytest tests/test_resolve_prompt_manifest.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/candidates.py tests/test_resolve_prompt_manifest.py
git commit -m "feat(sprint-17): resolve_prompt_manifest for alias-source framing"
```

---

### Task 3: `youtube_post_to_record` normalizer

**Files:**
- Create: `scripts/scrape_youtube.py` (the pure normalizer + module skeleton)
- Test: `tests/test_youtube_normalize.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_youtube_normalize.py`:

```python
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_youtube as yt


def test_normalizes_api_video_to_post_record():
    video = {
        "id": "abc123",
        "title": "My plan for transit",
        "description": "Full speech on transit. #transit @torontocity",
        "published_at": "2026-05-01T14:30:00Z",
        "duration_seconds": 612.0,
        "like_count": 42,
        "comment_count": 7,
    }
    rec = yt.youtube_post_to_record(video)
    assert rec["shortcode"] == "abc123"
    assert rec["url"] == "https://www.youtube.com/watch?v=abc123"
    assert rec["date"] == "2026-05-01T14:30:00+00:00"
    assert rec["type"] == "video"
    assert rec["product_type"] == "youtube"
    assert rec["is_video"] is True
    assert rec["video_duration"] == 612.0
    assert rec["caption"].startswith("My plan for transit\n\nFull speech")
    assert rec["caption_length"] == len(rec["caption"])
    assert rec["likes"] == 42 and rec["comments"] == 7
    assert "transit" in rec["hashtags"]
    assert "torontocity" in rec["mentions"]
    assert rec["location"] is None
    assert rec["source_platform"] == "youtube"


def test_handles_missing_optional_fields():
    rec = yt.youtube_post_to_record({"id": "x", "title": "T", "published_at": "2026-01-01T00:00:00Z"})
    assert rec["caption"] == "T"
    assert rec["likes"] == 0 and rec["comments"] == 0
    assert rec["video_duration"] is None
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_youtube_normalize.py -v`
Expected: FAIL — `ModuleNotFoundError` or `AttributeError: ... 'youtube_post_to_record'`

- [ ] **Step 3: Implement the module skeleton + normalizer**

Create `scripts/scrape_youtube.py`:

```python
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
```

- [ ] **Step 4: Run it, verify PASS**

Run: `.venv/bin/python -m pytest tests/test_youtube_normalize.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_youtube.py tests/test_youtube_normalize.py
git commit -m "feat(sprint-17): scrape_youtube.py skeleton + youtube_post_to_record"
```

---

### Task 4: `scrape_youtube.py` scraper (listing + transcript + write loop)

**Files:**
- Modify: `scripts/scrape_youtube.py` (add I/O functions + `main`)
- Test: `tests/test_scrape_youtube.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_scrape_youtube.py`:

```python
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_youtube as yt


def _seed_source(data_dir, handle="oliviachow-yt", channel="UC123"):
    d = data_dir / handle
    d.mkdir(parents=True)
    (d / "candidate.json").write_text(json.dumps({
        "handle": handle, "alias_of": "oliviachow",
        "source_platform": "youtube", "youtube_channel_id": channel,
    }))
    return d


def test_main_writes_normalized_posts_and_transcripts(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    src = _seed_source(data_dir)
    transcripts = tmp_path / "transcripts"
    transcripts.mkdir()
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    monkeypatch.setattr(yt, "TRANSCRIPTS_DIR", transcripts)
    monkeypatch.setenv("YOUTUBE_API_KEY", "fake")

    videos = [
        {"id": "v1", "title": "Speech 1", "description": "on housing",
         "published_at": "2026-05-01T10:00:00Z", "duration_seconds": 100.0,
         "like_count": 5, "comment_count": 1},
        {"id": "v2", "title": "Speech 2", "description": "on transit",
         "published_at": "2026-04-01T10:00:00Z", "duration_seconds": 200.0,
         "like_count": 9, "comment_count": 2},
    ]
    monkeypatch.setattr(yt, "list_channel_videos", lambda cid, key, limit=None: list(videos))
    monkeypatch.setattr(yt, "fetch_transcript",
                        lambda vid, date: f"transcript for {vid}")

    rc = yt.main(["--account", "oliviachow-yt"])
    assert rc == 0

    posts = [json.loads(l) for l in (src / "posts.jsonl").read_text().splitlines() if l.strip()]
    assert {p["shortcode"] for p in posts} == {"v1", "v2"}
    assert all(p["source_platform"] == "youtube" for p in posts)
    # transcripts cached under {date}_{videoId}.txt
    assert (transcripts / "2026-05-01_v1.txt").read_text() == "transcript for v1"


def test_main_is_resumable(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    src = _seed_source(data_dir)
    (src / "posts.jsonl").write_text(json.dumps({"shortcode": "v1"}) + "\n")
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    monkeypatch.setattr(yt, "TRANSCRIPTS_DIR", tmp_path / "t"); (tmp_path / "t").mkdir()
    monkeypatch.setenv("YOUTUBE_API_KEY", "fake")
    seen = []
    monkeypatch.setattr(yt, "list_channel_videos",
                        lambda cid, key, limit=None: [
                            {"id": "v1", "title": "a", "published_at": "2026-05-01T10:00:00Z"},
                            {"id": "v2", "title": "b", "published_at": "2026-04-01T10:00:00Z"}])
    monkeypatch.setattr(yt, "fetch_transcript", lambda vid, date: (seen.append(vid) or "t"))
    yt.main(["--account", "oliviachow-yt"])
    assert seen == ["v2"]  # v1 already present -> skipped, no transcript fetch


def test_main_fatals_without_api_key(tmp_path, monkeypatch, capsys):
    data_dir = tmp_path / "data"
    _seed_source(data_dir)
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    assert yt.main(["--account", "oliviachow-yt"]) == 1
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_scrape_youtube.py -v`
Expected: FAIL — `AttributeError: ... 'main'` / `'list_channel_videos'`

- [ ] **Step 3: Implement the I/O functions + main**

Append to `scripts/scrape_youtube.py`:

```python
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

    manifest = _candidates.load_candidate(args.account) if hasattr(_candidates, "load_candidate") else None
    if manifest is None:
        manifest = json.loads((DATA_DIR / args.account / "candidate.json").read_text()) \
            if (DATA_DIR / args.account / "candidate.json").exists() else None
    if manifest is None:
        log(f"FATAL: no candidate.json for {args.account}")
        return 1
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
            fetch_transcript(v["id"], rec["date"])
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            written += 1
            log(f"  + {rec['date'][:10]} {v['id']} · {rec['caption_length']} chars")
    log(f"done. wrote {written} new posts -> {posts_file.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run it, verify PASS**

Run: `.venv/bin/python -m pytest tests/test_scrape_youtube.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape_youtube.py tests/test_scrape_youtube.py
git commit -m "feat(sprint-17): scrape_youtube.py listing + transcript + write loop"
```

---

### Task 5: `triage.py --no-fetch` + alias framing

**Files:**
- Modify: `scripts/triage.py` (`parse_args`, `main`)
- Test: `tests/test_triage_no_fetch.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_triage_no_fetch.py`:

```python
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import triage


def test_no_fetch_triages_existing_posts_without_ig(tmp_path, monkeypatch):
    data = tmp_path / "data"
    acc = data / "oliviachow-yt"
    acc.mkdir(parents=True)
    (acc / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow-yt", "alias_of": "oliviachow",
        "source_platform": "youtube"}))
    (data / "oliviachow").mkdir()
    (data / "oliviachow" / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow", "display_name": "Olivia Chow", "surname": "Chow",
        "pronouns": "she/her", "incumbency": "incumbent"}))
    (acc / "posts.jsonl").write_text(json.dumps({
        "shortcode": "v1", "url": "u", "date": "2026-05-01T10:00:00+00:00",
        "type": "video", "is_video": True, "caption": "On transit", "caption_length": 10,
        "mentions": [], "hashtags": [], "location": None, "source_platform": "youtube"}) + "\n")

    monkeypatch.setattr(triage, "DATA_DIR", data)
    monkeypatch.setattr(triage._candidates, "DATA_DIR", data)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake")

    # IG client must never be constructed in --no-fetch mode
    def _boom():
        raise AssertionError("get_client must not be called in --no-fetch mode")
    monkeypatch.setattr(triage, "get_client", _boom)
    # Stub the model call + Anthropic client
    monkeypatch.setattr(triage, "Anthropic", lambda: object())
    captured = {}
    def fake_triage_one(rec, client, system_prompt):
        captured["prompt"] = system_prompt
        return {"bucket": "substantive", "reason": "r", "topics": ["transit"],
                "is_video": True, "needs_transcript": True}
    monkeypatch.setattr(triage, "triage_one", fake_triage_one)

    rc = triage.main_argv(["--account", "oliviachow-yt", "--no-fetch"])
    assert rc == 0
    rows = [json.loads(l) for l in (acc / "triage.jsonl").read_text().splitlines() if l.strip()]
    assert rows and rows[0]["shortcode"] == "v1"
    # framing resolved to the PRIMARY (Chow), not the contentless alias
    assert "Olivia Chow" in captured["prompt"]
    assert "incumbent" in captured["prompt"].lower()
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_triage_no_fetch.py -v`
Expected: FAIL — `AttributeError: ... 'main_argv'` (and `--no-fetch` unknown)

- [ ] **Step 3a: Make `main` argv-testable + add the flag**

In `scripts/triage.py`, change `parse_args` to accept argv and add the flag. Replace the `parse_args` signature line and add the argument:

```python
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
```
add inside `parse_args` (next to the other `add_argument` calls):
```python
    p.add_argument("--no-fetch", action="store_true",
                   help="triage the existing posts.jsonl without fetching from Instagram "
                        "(used for non-IG sources scraped by another tool, e.g. YouTube)")
```
and change its final line to `return p.parse_args(argv)`.

Add a thin argv wrapper next to `main` (so `main()` keeps working for the CLI and tests can pass argv):
```python
def main_argv(argv: list[str] | None = None) -> int:
    return _main(parse_args(argv))
```

- [ ] **Step 3b: Split `main` into `_main(args)` and route the prompt + no-fetch branch**

In `scripts/triage.py`, rename `def main() -> int:` to `def _main(args) -> int:` and DELETE its first line `args = parse_args()`. Then keep the existing `if __name__ == "__main__"` working by adding at the bottom (or updating it):
```python
def main() -> int:
    return _main(parse_args())
```

Change the manifest/prompt lines in `_main` (the Sprint-16 block) from `load_candidate` to `resolve_prompt_manifest`:
```python
    manifest = _candidates.resolve_prompt_manifest(account)
    if manifest is None:
        log(f"FATAL: no candidate.json for @{account}; create data/{account}/candidate.json first")
        return 1
```
(leave the incumbency warn + `system_prompt = build_system_prompt(manifest)` as-is.)

Immediately AFTER `system_prompt = build_system_prompt(manifest)` and the `triage_file, posts_file, _acc_dir = account_paths(account)` line, insert the no-fetch branch BEFORE `client = Anthropic()` / `cl = get_client()`:

```python
    client = Anthropic()
    if args.no_fetch:
        seen_triage = existing_shortcodes(triage_file)
        counts = {"substantive": 0, "contextual": 0, "skip": 0, "errors": 0}
        rows = [json.loads(l) for l in posts_file.read_text().splitlines() if l.strip()] \
            if posts_file.exists() else []
        log(f"--no-fetch: {len(rows)} posts on file, {len(seen_triage)} already triaged")
        for rec in rows:
            if rec["shortcode"] in seen_triage:
                continue
            try:
                triage = normalize_triage(triage_one(rec, client, system_prompt))
            except Exception as e:
                log(f"triage error on {rec['shortcode']}: {e!r}; skipping")
                counts["errors"] += 1
                continue
            append_jsonl(triage_file, {
                "shortcode": rec["shortcode"], "date": rec["date"], "url": rec["url"],
                "type": rec["type"], "is_video": rec["is_video"],
                "caption_excerpt": (rec.get("caption") or "")[:200],
                "triage": triage,
                "triaged_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "model": HAIKU_MODEL,
            })
            seen_triage.add(rec["shortcode"])
            counts[triage.get("bucket", "skip")] = counts.get(triage.get("bucket", "skip"), 0) + 1
            log(f"{rec['date'][:10]} {rec['shortcode']:<14} → {triage.get('bucket','skip')}")
        log(f"done (no-fetch). sub={counts['substantive']} ctx={counts['contextual']} "
            f"skip={counts['skip']} err={counts['errors']}")
        return 0

    cl = get_client()
```

(The existing IG `cl = get_client()` line and everything below it stays — it now runs only in the default fetch mode.)

- [ ] **Step 4: Run it, verify PASS (and no regressions)**

Run: `.venv/bin/python -m pytest tests/test_triage_no_fetch.py tests/test_triage_prompt.py -v`
Expected: PASS. Then full suite: `.venv/bin/python -m pytest tests/ -q` → all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/triage.py tests/test_triage_no_fetch.py
git commit -m "feat(sprint-17): triage.py --no-fetch + alias-source prompt framing"
```

---

### Task 6: `extract.py` alias framing + non-IG transcription guard

**Files:**
- Modify: `scripts/extract.py` (`main` manifest load ~line 550; transcription block ~lines 618-625)
- Test: `tests/test_extract_youtube.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_extract_youtube.py`:

```python
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import extract


def test_youtube_post_uses_cached_transcript_not_instagrapi(tmp_path, monkeypatch):
    monkeypatch.setattr(extract, "TRANSCRIPTS_DIR", tmp_path)
    (tmp_path / "2026-05-01_v1.txt").write_text("cached yt transcript")

    def _boom(*a, **k):
        raise AssertionError("instagrapi must not be used for a YouTube post")
    monkeypatch.setattr(extract, "get_client", _boom)
    monkeypatch.setattr(extract, "download_audio", _boom)

    post = {"shortcode": "v1", "date": "2026-05-01T10:00:00+00:00", "is_video": True,
            "source_platform": "youtube", "url": "u", "caption": "c"}
    transcript = extract.resolve_transcript_for_post(post, cl_holder={"cl": None},
                                                     no_transcribe=False)
    assert transcript == "cached yt transcript"


def test_missing_cache_for_youtube_returns_none_with_warning(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(extract, "TRANSCRIPTS_DIR", tmp_path)
    post = {"shortcode": "v9", "date": "2026-05-01T10:00:00+00:00", "is_video": True,
            "source_platform": "youtube", "url": "u", "caption": "c"}
    t = extract.resolve_transcript_for_post(post, cl_holder={"cl": None}, no_transcribe=False)
    assert t is None
    assert "no cached transcript" in capsys.readouterr().out.lower()
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_extract_youtube.py -v`
Expected: FAIL — `AttributeError: ... 'resolve_transcript_for_post'`

- [ ] **Step 3a: Extract the transcription decision into a guarded helper**

In `scripts/extract.py`, add this function just above `def main`:

```python
def resolve_transcript_for_post(post: dict, cl_holder: dict, no_transcribe: bool) -> str | None:
    """Return the transcript for a substantive video. For non-Instagram sources
    (e.g. YouTube) use ONLY the pre-cached transcript written by the platform
    scraper — never call instagrapi. For Instagram, download audio + Whisper as
    before. `cl_holder` is a 1-key dict {'cl': <client-or-None>} so the IG client
    is lazily created and reused across calls."""
    sc = post["shortcode"]
    date_iso = post.get("date", "")
    if no_transcribe:
        return None
    platform = post.get("source_platform", "instagram")
    if platform != "instagram":
        tp = transcript_path(sc, date_iso)
        if tp.exists():
            return tp.read_text().strip() or None
        log(f"warn: no cached transcript for {platform} post {sc}; caption-only")
        return None
    if cl_holder["cl"] is None:
        cl_holder["cl"] = get_client()
    audio = download_audio(cl_holder["cl"], sc, date_iso)
    if audio:
        return transcribe(audio, sc, date_iso)
    return None
```

- [ ] **Step 3b: Call the helper from the main loop**

In `scripts/extract.py`, replace the transcription block (currently):

```python
        transcript = None
        # Belt-and-suspenders: transcribe ALL substantive videos, ...
        if bucket == "substantive" and is_video and not args.no_transcribe:
            if cl is None:
                cl = get_client()
            audio = download_audio(cl, sc, date_iso)
            if audio:
                transcript = transcribe(audio, sc, date_iso)
                if transcript:
                    counts["videos_transcribed"] += 1
```

with:

```python
        transcript = None
        if bucket == "substantive" and is_video and not args.no_transcribe:
            transcript = resolve_transcript_for_post(post, _cl_holder, args.no_transcribe)
            if transcript:
                counts["videos_transcribed"] += 1
```

And replace the local `cl` variable initialization in `main` (the `cl = None` near the top of `main`) with `_cl_holder = {"cl": None}` so the helper can lazily create + reuse the IG client. (Search `main` for `cl = None` and any other `cl` uses; the only remaining direct use was the transcription block just replaced.)

- [ ] **Step 3c: Resolve alias framing in `main`**

In `scripts/extract.py` `main`, change the manifest load (the Sprint-16 block, ~line 550) from `load_candidate` to `resolve_prompt_manifest`:

```python
    manifest = _candidates.resolve_prompt_manifest(args.account)
    if manifest is None:
        log(f"FATAL: no candidate.json for @{args.account}; create data/{args.account}/candidate.json first")
        return 1
    system_prompt = build_system_prompt(manifest)
```

(Note: `extract_contextual(post, client, manifest)` continues to receive this resolved `manifest`, which is correct — contextual notes for a YouTube source should be framed for the primary candidate.)

- [ ] **Step 4: Run it, verify PASS (and no regressions)**

Run: `.venv/bin/python -m pytest tests/test_extract_youtube.py tests/test_extract_prompt.py -v`
Expected: PASS. Then `.venv/bin/python -m pytest tests/ -q` → all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract.py tests/test_extract_youtube.py
git commit -m "feat(sprint-17): extract.py alias framing + non-IG transcription guard"
```

---

### Task 7: Thread `source_platform` through `build_site.py`

**Files:**
- Modify: `scripts/build_site.py` (the merge loop, ~lines 112-145)
- Test: `tests/test_build_site_source_platform.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_build_site_source_platform.py`:

```python
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_merged_records_carry_source_platform(tmp_repo, run_build, monkeypatch):
    # tmp_repo seeds bradfordgrams + oliviachow (see conftest). Add a YT alias of Chow.
    data = tmp_repo / "data"
    yt = data / "oliviachow-yt"
    yt.mkdir(parents=True)
    (yt / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow-yt", "alias_of": "oliviachow",
        "source_platform": "youtube"}))
    (yt / "posts.jsonl").write_text(json.dumps({
        "shortcode": "v1", "url": "https://www.youtube.com/watch?v=v1",
        "date": "2026-05-01T10:00:00+00:00", "type": "video", "is_video": True,
        "caption": "c", "source_platform": "youtube"}) + "\n")
    (yt / "triage.jsonl").write_text("")
    (yt / "records.jsonl").write_text(json.dumps({
        "kind": "position", "shortcode": "v1",
        "post_url": "https://www.youtube.com/watch?v=v1",
        "post_date": "2026-05-01T10:00:00+00:00", "topic": "transit",
        "summary": "s", "stance": "supports", "source_quote": "q",
        "source_account": "oliviachow-yt", "source_platform": "youtube"}) + "\n")
    (yt / "extracted.jsonl").write_text("")
    # wire the alias into Chow's manifest
    chow = json.loads((data / "oliviachow" / "candidate.json").read_text())
    chow["alias_handles"] = ["oliviachow-yt"]
    (data / "oliviachow" / "candidate.json").write_text(json.dumps(chow))

    # rebuild with the alias present
    from scripts import build_site
    build_site.main([])

    dossier = json.loads((tmp_repo / "site" / "candidates" / "chow.json").read_text())
    yt_recs = [r for r in dossier["records"] if r.get("source_platform") == "youtube"]
    assert len(yt_recs) == 1
    # IG-origin records default to "instagram"
    assert all(r.get("source_platform") for r in dossier["records"])
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `.venv/bin/python -m pytest tests/test_build_site_source_platform.py -v`
Expected: FAIL — records lack `source_platform` (KeyError/assertion).

- [ ] **Step 3: Thread `source_platform` in the merge loop**

In `scripts/build_site.py`, the per-handle merge loop (~lines 112-145) builds `posts_index` and record dicts. For each loaded source handle `h`, read its manifest's `source_platform` (default `"instagram"`) and stamp it onto every post and record from that handle. Concretely:

After the line that determines `handles_to_load` (~line 112), and inside the per-handle loop where records/posts are read (where `source_account: h` is already set, ~lines 128 & 134 & 145), add the platform. Find the manifest for `h` once per handle:

```python
        h_manifest = _candidates.load_candidate(h) or {}
        h_platform = h_manifest.get("source_platform", "instagram")
```

Then everywhere a post or record dict from handle `h` is built/tagged with `source_account`, also set `source_platform`:
- where `posts_index[sc] = {**p, "source_account": h}` → `{**p, "source_account": h, "source_platform": p.get("source_platform", h_platform)}`
- where the record dict sets `"source_account": h,` → add `"source_platform": r.get("source_platform", h_platform),`
- the `r.setdefault("source_account", handle)` line → also `r.setdefault("source_platform", "instagram")`

- [ ] **Step 4: Run it, verify PASS (and no regressions)**

Run: `.venv/bin/python -m pytest tests/test_build_site_source_platform.py tests/test_build_site.py -v`
Expected: PASS. Then `.venv/bin/python -m pytest tests/ -q` → all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_site.py tests/test_build_site_source_platform.py
git commit -m "feat(sprint-17): thread source_platform through build_site merge"
```

---

## Self-Review

- **Spec coverage:** source manifest + alias wiring (Task 7 test wires `alias_handles`; manifest shape documented) ✓; `resolve_prompt_manifest` (Task 2) ✓; `scrape_youtube.py` normalizer + listing + transcript fallback + resumable + FATAL on missing key/channel (Tasks 3, 4) ✓; `triage --no-fetch` + alias framing (Task 5) ✓; extract alias framing + non-IG transcription guard (Task 6) ✓; build_site `source_platform` threading w/ `"instagram"` default (Task 7) ✓; all external services mocked in tests (Tasks 4, 5, 6) ✓; deps (Task 1) ✓. Operational channel-discovery is a non-goal (correctly absent).
- **Placeholder scan:** No TBD/TODO; every code step shows full code or exact old→new blocks.
- **Type/name consistency:** `youtube_post_to_record(video)->dict`, `list_channel_videos(channel_id, api_key, limit=None)->list[dict]`, `fetch_transcript(video_id, date)->str|None`, `resolve_prompt_manifest(handle)->dict|None`, `resolve_transcript_for_post(post, cl_holder, no_transcribe)->str|None`, `main_argv(argv)`/`_main(args)` in triage — names used identically across tasks and their tests. `source_platform` string is consistent ("youtube"/"instagram") everywhere.
