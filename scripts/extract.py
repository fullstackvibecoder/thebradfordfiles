#!/usr/bin/env python3
"""
extract.py — second-pass structured extraction for The Bradford Files.

Reads data/triage.jsonl (built by triage.py) and for every post that triage
flagged as substantive, asks Claude Opus (tool-use) to extract zero or more
structured records of the following kinds:

  position       — a stated stance on a topic
  pledge         — a future-tense commitment ("I will…", "If elected I will…")
  action         — a past-tense action (council motion, vote, project)
  endorsement    — a named public endorsement (received or given)
  appearance     — a public event with location and named attendees
  quote          — a citable line worth surfacing on its own

For posts that triage flagged as "contextual" (personal-but-civic-framing),
runs a much lighter extraction via Haiku to capture a single background note.

If a post is a video and triage flagged needs_transcript=true, the audio is
downloaded and transcribed locally with whisper before extraction. Caption
alone is sent if the post is image/carousel or transcription is unneeded.

Resumable: every record is appended to data/records.jsonl, and the script
skips any shortcode that already has at least one record there or that's
listed in data/extracted.jsonl as completed (including zero-record posts).

Usage:
  python scripts/extract.py --limit 25       # pilot pass
  python scripts/extract.py                  # full run on substantive set
  python scripts/extract.py --include-contextual   # also do light extraction
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
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
RECORDS_FILE = DATA_DIR / "records.jsonl"
EXTRACTED_FILE = DATA_DIR / "extracted.jsonl"   # one row per post processed (success or no-records)
SETTINGS_FILE = DATA_DIR / ".ig-session.json"

MEDIA_DIR = ROOT / "media"
MEDIA_DIR.mkdir(exist_ok=True)
TRANSCRIPTS_DIR = ROOT / "transcripts"
TRANSCRIPTS_DIR.mkdir(exist_ok=True)

OPUS_MODEL = "claude-opus-4-7"
HAIKU_MODEL = "claude-haiku-4-5"

# Topic vocabulary — kept in sync with triage.py
TOPICS = [
    "housing", "transit", "safety_crime", "taxes_fiscal",
    "parks_environment", "infrastructure", "civic_engagement",
    "governance_ethics", "small_business_economy", "social_services",
    "campaign_logistics", "endorsements", "personal_context", "other",
]


def log(msg: str) -> None:
    print(f"[extract] {msg}", flush=True)


# ---------------------------------------------------------------------------
# tool schema
# ---------------------------------------------------------------------------

EXTRACTION_TOOL = {
    "name": "extract_records",
    "description": (
        "Read an Instagram post (caption + optional video transcript) and "
        "extract structured civic-political records. Return zero, one, or "
        "many records across the listed kinds. Be neutral, accurate, and "
        "literal — only extract what the post actually says, not inference."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "positions": {
                "type": "array",
                "description": "Stated stances on topics. A 'Position' is anything the author has explicitly said they think, support, oppose, or observe about a policy/governance issue.",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "enum": TOPICS},
                        "summary": {"type": "string", "description": "Concise summary of the position (under 200 chars). Neutral language."},
                        "stance": {"type": "string", "enum": ["supports", "opposes", "announces", "conditional", "neutral_observation"]},
                        "source_quote": {"type": "string", "description": "Direct quote from the caption or transcript supporting this. Verbatim. May be lightly trimmed for length but never paraphrased."},
                        "source_origin": {"type": "string", "enum": ["caption", "transcript", "both"]},
                    },
                    "required": ["topic", "summary", "stance", "source_quote", "source_origin"],
                },
            },
            "pledges": {
                "type": "array",
                "description": "Future-tense commitments. 'I will…', 'If elected I will…', 'We will keep pushing for…', etc. Pledges are always forward-looking.",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "enum": TOPICS},
                        "pledge_text": {"type": "string", "description": "What is being promised, in concise neutral language."},
                        "conditional_on_election": {"type": "boolean"},
                        "specifics": {"type": "string", "description": "Any concrete details: deliverable, deadline, mechanism. Empty if vague."},
                        "source_quote": {"type": "string"},
                        "source_origin": {"type": "string", "enum": ["caption", "transcript", "both"]},
                    },
                    "required": ["topic", "pledge_text", "conditional_on_election", "source_quote", "source_origin"],
                },
            },
            "actions": {
                "type": "array",
                "description": "Past-tense actions taken: motions brought to council, votes cast, projects supported, interventions made. Anything where the author already DID something verifiable.",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "enum": TOPICS},
                        "summary": {"type": "string", "description": "What was done, neutrally. Under 200 chars."},
                        "action_type": {"type": "string", "enum": ["motion", "vote", "groundbreaking_attended", "ribbon_cutting", "report_authored", "intervention", "letter_signed", "policy_announced", "other"]},
                        "outcome": {"type": "string", "enum": ["passed", "failed", "passed_unanimously", "ongoing", "completed", "unknown"]},
                        "approximate_date": {"type": ["string", "null"], "description": "When the action happened, if statable. ISO date, year-only, or null. May differ from post_date."},
                        "source_quote": {"type": "string"},
                        "source_origin": {"type": "string", "enum": ["caption", "transcript", "both"]},
                    },
                    "required": ["topic", "summary", "action_type", "outcome", "source_quote", "source_origin"],
                },
            },
            "endorsements": {
                "type": "array",
                "description": "Named public endorsements — either Brad endorsing someone else, or someone endorsing Brad.",
                "items": {
                    "type": "object",
                    "properties": {
                        "direction": {"type": "string", "enum": ["received", "given"]},
                        "party_name": {"type": "string", "description": "Person, org, or association giving/receiving the endorsement."},
                        "party_role": {"type": "string", "description": "Their relevant role/title, if stated."},
                        "context": {"type": "string", "description": "Brief context if stated (e.g., 'transit policy', 'mayoral campaign')."},
                        "source_quote": {"type": "string"},
                    },
                    "required": ["direction", "party_name", "source_quote"],
                },
            },
            "appearances": {
                "type": "array",
                "description": "Public appearances: town halls, community events, ribbon cuttings, photo ops at named locations.",
                "items": {
                    "type": "object",
                    "properties": {
                        "event_label": {"type": "string", "description": "Name of the event or visit."},
                        "location": {"type": "string", "description": "Place or neighborhood, if statable."},
                        "neighborhood": {"type": "string", "description": "Toronto neighborhood/ward if identifiable, else empty string."},
                        "with_persons": {"type": "array", "items": {"type": "string"}, "description": "Other named people present."},
                        "topic_focus": {"type": "string", "description": "What civic topic the appearance focused on, if any."},
                        "source_quote": {"type": "string"},
                    },
                    "required": ["event_label", "source_quote"],
                },
            },
            "quotes": {
                "type": "array",
                "description": "Standalone notable quotes worth surfacing on their own. Use sparingly — only quotes that crystallize a position or vision.",
                "items": {
                    "type": "object",
                    "properties": {
                        "quote_text": {"type": "string"},
                        "speaker": {"type": "string", "description": "Usually 'Brad Bradford' but could be a guest in the post."},
                        "topic": {"type": "string", "enum": TOPICS},
                    },
                    "required": ["quote_text", "speaker", "topic"],
                },
            },
        },
        "required": ["positions", "pledges", "actions", "endorsements", "appearances", "quotes"],
    },
}


SYSTEM_PROMPT = """You are an extraction assistant for The Bradford Files, an \
independent civic-transparency project documenting the public political record \
of Brad Bradford (@bradfordgrams), a Toronto City Councillor running for Mayor \
of Toronto in 2026. The project is neutral — neither advocacy nor opposition. \
Records you extract will be displayed publicly with sourcing back to the \
original post.

Your job is to read one Instagram post's caption (and optional video \
transcript) and extract zero or more structured records of these kinds: \
positions, pledges, actions, endorsements, appearances, quotes.

Extraction rules:

1. LITERAL ONLY. Extract only what the post actually says. Do not infer, \
extrapolate, or add commentary. If the post is silent on a detail, leave it \
empty.

2. NEUTRAL LANGUAGE. Use words like 'states', 'pledges', 'announces', \
'attended', 'voted'. Avoid loaded words: 'admits', 'claims', 'flip-flops', \
'admirable', 'controversial', 'troubling', etc.

3. SOURCE QUOTES VERBATIM. The source_quote field must be a direct quote \
from the caption or transcript, copied exactly. May be lightly trimmed for \
length but never paraphrased. Use it as the receipt for the record.

4. POSITION vs PLEDGE vs ACTION:
   • Position = stated belief or stance ('I think public safety should be \
the city's priority').
   • Pledge = future-tense commitment ('I will keep pushing for…', \
'If elected, I will…').
   • Action = past-tense action ('I brought a motion that passed \
unanimously', 'shovels hit the ground at 5507 Dundas').
   A single sentence can produce more than one record if it contains both a \
position and a pledge, or a pledge and a reference to a past action.

5. EMPTY ARRAYS ARE FINE. If a post has no records of a given kind, return an \
empty array for that kind. Don't manufacture content.

6. TOPIC TAXONOMY. Use only these topic values: housing, transit, safety_crime, \
taxes_fiscal, parks_environment, infrastructure, civic_engagement, \
governance_ethics, small_business_economy, social_services, campaign_logistics, \
endorsements, personal_context, other.

7. APPEARANCES need a clearly named event. Generic 'community visit' without \
a named location/event is not enough — skip those, or capture them as a \
position/pledge if substantive content was discussed."""


# ---------------------------------------------------------------------------
# instagrapi client (reuse from triage)
# ---------------------------------------------------------------------------

def get_client() -> IGClient:
    sessionid = os.environ.get("IG_SESSIONID", "").strip()
    if not sessionid:
        log("FATAL: IG_SESSIONID missing")
        sys.exit(1)
    cl = IGClient()
    if SETTINGS_FILE.exists():
        try:
            cl.load_settings(SETTINGS_FILE)
        except Exception:
            pass
    cl.login_by_sessionid(sessionid)
    if not cl.user_id:
        log("FATAL: not authenticated")
        sys.exit(1)
    log(f"authenticated as @{cl.username}")
    try:
        cl.dump_settings(SETTINGS_FILE)
    except Exception:
        pass
    return cl


# ---------------------------------------------------------------------------
# audio + transcript
# ---------------------------------------------------------------------------

def transcript_path(shortcode: str, date: str) -> Path:
    return TRANSCRIPTS_DIR / f"{date[:10]}_{shortcode}.txt"


def audio_path(shortcode: str, date: str) -> Path:
    return MEDIA_DIR / f"{date[:10]}_{shortcode}.m4a"


def download_audio(cl: IGClient, shortcode: str, date: str) -> Path | None:
    """Pull audio for a video post. instagrapi gives us a video_url; we curl
    it and let ffmpeg extract the audio track."""
    out = audio_path(shortcode, date)
    if out.exists():
        return out
    try:
        media_pk = cl.media_pk_from_code(shortcode)
        media = cl.media_info(media_pk)
    except Exception as e:
        log(f"  media_info failed for {shortcode}: {e!r}")
        return None
    video_url = getattr(media, "video_url", None)
    if not video_url:
        return None
    # Use ffmpeg to download + extract audio in one step
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video_url),
             "-vn", "-acodec", "copy", str(out)],
            check=True, timeout=180,
        )
    except subprocess.CalledProcessError:
        # Fallback: re-encode if -acodec copy fails (e.g. non-aac codec)
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(video_url),
                 "-vn", "-acodec", "aac", "-b:a", "96k", str(out)],
                check=True, timeout=240,
            )
        except Exception as e:
            log(f"  ffmpeg failed for {shortcode}: {e!r}")
            return None
    except Exception as e:
        log(f"  download failed for {shortcode}: {e!r}")
        return None
    return out if out.exists() else None


def transcribe(audio: Path, shortcode: str, date: str) -> str | None:
    """Run whisper small.en on the audio, return the transcript text."""
    out_txt = transcript_path(shortcode, date)
    if out_txt.exists():
        return out_txt.read_text().strip()
    try:
        subprocess.run(
            ["whisper", str(audio),
             "--model", "small.en",
             "--output_dir", str(TRANSCRIPTS_DIR),
             "--output_format", "txt",
             "--verbose", "False"],
            check=True, timeout=600,
        )
    except Exception as e:
        log(f"  whisper failed for {shortcode}: {e!r}")
        return None
    # whisper writes to <stem>.txt — rename to our convention if needed
    whisper_default = TRANSCRIPTS_DIR / (audio.stem + ".txt")
    if whisper_default.exists() and whisper_default != out_txt:
        whisper_default.rename(out_txt)
    return out_txt.read_text().strip() if out_txt.exists() else None


# ---------------------------------------------------------------------------
# extraction
# ---------------------------------------------------------------------------

def extract_substantive(post: dict, transcript: str | None, client: Anthropic) -> dict:
    """Send caption + optional transcript to Opus, get structured records."""
    blocks = [
        f"Date: {post['date'][:10]}",
        f"Type: {post['type']}",
        f"URL: {post['url']}",
        f"Mentions: {', '.join(post.get('mentions') or []) or '(none)'}",
        f"Hashtags: {', '.join('#' + h for h in (post.get('hashtags') or [])) or '(none)'}",
        f"Location: {post.get('location') or '(none)'}",
        "",
        "Caption:",
        post.get("caption") or "(no caption)",
    ]
    if transcript:
        blocks += ["", "Transcript:", transcript]
    user = "\n".join(blocks)

    response = client.messages.create(
        model=OPUS_MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        tools=[EXTRACTION_TOOL],
        tool_choice={"type": "tool", "name": "extract_records"},
        messages=[{"role": "user", "content": user}],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return block.input
    return {k: [] for k in ["positions", "pledges", "actions", "endorsements", "appearances", "quotes"]}


CONTEXTUAL_TOOL = {
    "name": "extract_background_note",
    "description": "Capture a single short character/context note from a personal post that has civic framing.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "One sentence, neutral, under 200 chars."},
            "topics": {"type": "array", "items": {"type": "string", "enum": TOPICS}},
            "source_quote": {"type": "string"},
        },
        "required": ["summary", "topics", "source_quote"],
    },
}


def extract_contextual(post: dict, client: Anthropic) -> dict:
    """One Haiku call for a one-line background note. No transcript needed."""
    user = (
        f"Date: {post['date'][:10]}\n"
        f"Caption:\n{post.get('caption') or '(no caption)'}\n\n"
        f"Capture a single short context note about Brad Bradford's "
        f"character/values, in neutral language."
    )
    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        tools=[CONTEXTUAL_TOOL],
        tool_choice={"type": "tool", "name": "extract_background_note"},
        messages=[{"role": "user", "content": user}],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return block.input
    return {"summary": "", "topics": [], "source_quote": ""}


# ---------------------------------------------------------------------------
# IO
# ---------------------------------------------------------------------------

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


def append_jsonl(path: Path, row: dict) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def already_extracted_shortcodes() -> set[str]:
    out = {row["shortcode"] for row in load_jsonl(EXTRACTED_FILE) if "shortcode" in row}
    return out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=None,
                   help="cap number of posts processed this run")
    p.add_argument("--include-contextual", action="store_true",
                   help="also do light extraction on contextual posts (more API spend)")
    p.add_argument("--no-transcribe", action="store_true",
                   help="skip whisper transcription (caption-only extraction)")
    p.add_argument("--shortcode", type=str, default=None,
                   help="extract a single post by shortcode (debugging)")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        log("FATAL: ANTHROPIC_API_KEY missing")
        return 1
    if not TRIAGE_FILE.exists():
        log(f"FATAL: triage file missing — run scripts/triage.py first")
        return 1

    triages = load_jsonl(TRIAGE_FILE)
    posts_by_code = {row["shortcode"]: row for row in load_jsonl(POSTS_FILE)}
    extracted = already_extracted_shortcodes()
    log(f"triage rows: {len(triages):,} · posts: {len(posts_by_code):,} · already extracted: {len(extracted):,}")

    # Filter to candidates
    if args.shortcode:
        candidates = [t for t in triages if t["shortcode"] == args.shortcode]
        if not candidates:
            log(f"FATAL: shortcode {args.shortcode} not in triage.jsonl")
            return 1
    else:
        wanted = {"substantive"}
        if args.include_contextual:
            wanted.add("contextual")
        candidates = [
            t for t in triages
            if t["triage"]["bucket"] in wanted and t["shortcode"] not in extracted
        ]
    log(f"candidates this run: {len(candidates):,}")

    if not candidates:
        log("nothing to do")
        return 0

    client = Anthropic()
    cl = None  # lazy — only init instagrapi if we need a video download

    counts = {"posts": 0, "records": 0, "videos_transcribed": 0, "errors": 0}
    started = time.time()

    for i, t in enumerate(candidates, 1):
        if args.limit is not None and counts["posts"] >= args.limit:
            break

        sc = t["shortcode"]
        post = posts_by_code.get(sc)
        if not post:
            log(f"skip {sc}: post metadata missing in posts.jsonl")
            counts["errors"] += 1
            continue

        bucket = t["triage"]["bucket"]
        is_video = post.get("is_video", False)
        needs_transcript = bool(t["triage"].get("needs_transcript", False))
        date_iso = post.get("date", "")

        log(f"[{i}/{len(candidates)}] {date_iso[:10]} {sc} · {bucket} · "
            f"{'video' if is_video else 'still'}{' (transcribe)' if needs_transcript and not args.no_transcribe else ''}")

        transcript = None
        if bucket == "substantive" and is_video and needs_transcript and not args.no_transcribe:
            if cl is None:
                cl = get_client()
            audio = download_audio(cl, sc, date_iso)
            if audio:
                transcript = transcribe(audio, sc, date_iso)
                if transcript:
                    counts["videos_transcribed"] += 1

        records_this_post = 0
        try:
            if bucket == "substantive":
                result = extract_substantive(post, transcript, client)
                # Walk each kind, append individual records
                for kind, items in result.items():
                    if not isinstance(items, list):
                        continue
                    for item in items:
                        record = {
                            "kind": kind[:-1] if kind.endswith("s") else kind,  # positions -> position
                            "shortcode": sc,
                            "post_url": post["url"],
                            "post_date": date_iso,
                            "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                            "model": OPUS_MODEL,
                            "source_text": "transcript+caption" if transcript else "caption",
                            **item,
                        }
                        append_jsonl(RECORDS_FILE, record)
                        records_this_post += 1
            elif bucket == "contextual":
                result = extract_contextual(post, client)
                if result.get("summary"):
                    record = {
                        "kind": "background_note",
                        "shortcode": sc,
                        "post_url": post["url"],
                        "post_date": date_iso,
                        "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "model": HAIKU_MODEL,
                        "source_text": "caption",
                        **result,
                    }
                    append_jsonl(RECORDS_FILE, record)
                    records_this_post += 1
        except Exception as e:
            log(f"  extraction error: {e!r}")
            counts["errors"] += 1
            # Don't mark as extracted — let next run retry
            continue

        # Mark as completed (even if zero records — so we don't retry)
        append_jsonl(EXTRACTED_FILE, {
            "shortcode": sc,
            "post_date": date_iso,
            "bucket": bucket,
            "records": records_this_post,
            "had_transcript": bool(transcript),
            "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
        counts["posts"] += 1
        counts["records"] += records_this_post
        log(f"  → {records_this_post} record(s)")

        if counts["posts"] % 25 == 0:
            elapsed = time.time() - started
            log(f"--- progress: {counts['posts']} posts processed in {elapsed/60:.1f}min · "
                f"{counts['records']} records · {counts['videos_transcribed']} transcribed ---")
        time.sleep(0.4)

    dur = time.time() - started
    log("")
    log(f"done. processed {counts['posts']} posts in {dur/60:.1f}min")
    log(f"  records written: {counts['records']}")
    log(f"  videos transcribed: {counts['videos_transcribed']}")
    log(f"  errors: {counts['errors']}")
    log(f"output: {RECORDS_FILE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
