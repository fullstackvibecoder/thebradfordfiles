# Sprint 17. YouTube Ingestion Adapter (Multi-Platform, Phase 1)

**Date:** 2026-06-04
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 16 (candidate-aware prompts; the `data/<handle>/` source model; the alias-merge in `build_site.py`).

## Goal

Add YouTube as a second ingestion source for the same candidates, alongside
Instagram. Candidate-owned YouTube channels (speeches, debates, ads, town halls)
are high-signal, long-form civic content, and YouTube exposes real transcripts.
This sprint ships a **platform-agnostic-leaning ingestion path** demonstrated
with one concrete adapter (`scrape_youtube.py`), reusing the existing
triage/extract pipeline and the alias-merge so YouTube records flow into the
same per-candidate dossier as Instagram records.

This is Phase 1 of the broader "same candidates, other platforms" axis. X,
Facebook, and TikTok are explicitly out of scope and become later cycles.

## Motivation

The pipeline is currently 100% Instagram-sourced. Candidates publish substantive
civic content on YouTube (full speeches, debate footage, campaign ads) that
Instagram's short-form captions don't capture. Two structural facts make
YouTube the right first non-IG adapter:

1. **Transcription is already solved.** YouTube exposes creator/auto captions,
   and where absent, `yt-dlp` + the existing Whisper step transcribes audio.
   `extract.py` already reads a `transcripts/{date}_{shortcode}.txt` cache.
2. **The downstream is already platform-agnostic.** Triage and extraction
   operate on caption text + transcript; Sprint 16's candidate-aware prompts
   work regardless of source. The alias-merge in `build_site.py` already turns
   "multiple sources → one dossier" (Bradford's `bradfordgrams` + `beybradford`).

So the only genuinely new work is **scraping + a normalized post schema**; the
rest is thin seams into proven code.

## Architecture (Approach 2: additive)

A YouTube channel is modeled as an **alias source** of a primary candidate,
reusing the existing alias-merge rather than introducing a parallel mechanism.
A new `scrape_youtube.py` writes a normalized `posts.jsonl` and pre-populates
the transcript cache; `triage.py` gains a `--no-fetch` mode to triage an
existing `posts.jsonl` without touching Instagram; `extract.py` and `triage.py`
resolve an alias source's prompt framing to its primary candidate. The
Instagram scrape path inside `triage.py` is left untouched (no regression risk).

The `--no-fetch` seam is deliberately the foundation a future full
scrape/triage decouple (other platforms, the news axis) would build on.

## Components

### 1. Source manifest + alias wiring

Each YouTube channel lives in its own `data/<yt_handle>/candidate.json`:

```json
{
  "handle": "oliviachow-yt",
  "alias_of": "oliviachow",
  "source_platform": "youtube",
  "youtube_channel_id": "UCxxxxxxxxxxxxxxxxxxxxxx",
  "display_name": "Olivia Chow (YouTube)",
  "note": "Official YouTube channel; records merge into Chow's dossier."
}
```

The primary candidate's manifest adds the YT handle to `alias_handles` (e.g.
`oliviachow` gains `"alias_handles": ["oliviachow-yt"]`). `build_site.py` already
loads `[handle] + alias_handles` and merges their records. `load_all_candidates()`
already excludes anything with `alias_of`, so YT sources never appear as
standalone candidates.

### 2. `lib/candidates.resolve_prompt_manifest(handle) -> dict | None`

New helper: if the source manifest has `alias_of`, return the **primary's**
manifest; otherwise return the source's own. This makes an alias source inherit
the primary candidate's `pronouns`/`incumbency`/framing, so Chow's YouTube
content is triaged/extracted under Chow's incumbent framing — not a contentless
alias manifest. Returns `None` if neither manifest resolves (caller FATALs).

### 3. `scripts/scrape_youtube.py`

- `--account <yt_handle>` reads the source manifest's `youtube_channel_id`.
- Lists channel uploads via YouTube Data API v3 (`YOUTUBE_API_KEY` from env):
  resolve channel → uploads playlist → page through `playlistItems`; fetch
  per-video metadata (`title`, `description`, `publishedAt`, `duration`).
- Transcript per video: try `youtube-transcript-api` (manual captions preferred
  over auto). If unavailable, `yt-dlp` extracts audio → the existing Whisper
  `small.en` step. Write the result to `transcripts/{date}_{videoId}.txt` — the
  exact cache path `extract.py` reads.
- Writes normalized rows to `data/<yt_handle>/posts.jsonl`:

  | posts.jsonl field | YouTube source |
  |---|---|
  | `shortcode` | videoId |
  | `url` | `https://www.youtube.com/watch?v=<videoId>` |
  | `date` | `publishedAt` (UTC ISO, `timespec=seconds`) |
  | `type` | `"video"` |
  | `product_type` | `"youtube"` |
  | `is_video` | `true` |
  | `video_duration` | duration seconds (float) or null |
  | `caption` | `title` + `"\n\n"` + `description` (capped 6000 chars) |
  | `caption_length` | len(caption) |
  | `likes` / `comments` | from API stats if available, else 0 |
  | `mentions` / `hashtags` | parsed from description (reuse triage's tag regex) |
  | `location` | null |
  | `source_platform` | `"youtube"` |

- Resumable: skip videoIds already present in `posts.jsonl` (mirror
  `existing_shortcodes`).
- Reads `YOUTUBE_API_KEY` via `load_dotenv` (match the Sprint-16 fix so direct
  runs work).

### 4. `triage.py --no-fetch`

New flag. When set: skip `get_client()` and all IG enumeration; iterate the
existing `posts.jsonl`; triage any row whose shortcode is not yet in
`triage.jsonl`. All other triage logic (the candidate-aware prompt) is unchanged.
The system prompt is built from `resolve_prompt_manifest(account)` so an alias
source uses the primary's framing. The default (no `--no-fetch`) IG path is
untouched.

### 5. `extract.py` changes

- Build the system prompt from `resolve_prompt_manifest(args.account)` (alias →
  primary framing), replacing the current direct `load_candidate`.
- Skip the Instagram-specific transcription fetch when a post's
  `source_platform` is set and not `"instagram"`; rely on the pre-cached
  transcript. If the cache is missing for such a post, log a warning and extract
  from caption only (never call instagrapi on a non-IG post).

### 6. `build_site.py` attribution

Thread `source_platform` through the merge so each merged record/post carries it
(defaulting to `"instagram"` when absent, for back-compat with existing
records). The dossier already stores a clickable `post_url` per record; no URL
construction changes are needed. Surfacing a "via YouTube" indicator in the web
UI is **out of scope** (data only) — this sprint guarantees the field is present
and correct in `web/public/data`.

## Data flow

```
data/<yt>/candidate.json (youtube_channel_id)
        │
  scrape_youtube.py ──▶ data/<yt>/posts.jsonl (normalized, source_platform=youtube)
        │                └─▶ transcripts/{date}_{videoId}.txt (cache)
        ▼
  triage.py --no-fetch --account <yt> ──▶ data/<yt>/triage.jsonl
        │  (prompt via resolve_prompt_manifest → primary candidate framing)
        ▼
  extract.py --account <yt> ──▶ data/<yt>/records.jsonl
        │  (uses cached transcript; no instagrapi)
        ▼
  build_site.py ──▶ primary dossier merges <yt> via alias_handles, source_platform-tagged
```

## Error handling

- Missing `YOUTUBE_API_KEY` → `scrape_youtube.py` FATALs with a clear message.
- Missing/invalid `youtube_channel_id` in the source manifest → FATAL naming the
  account.
- `resolve_prompt_manifest` returns `None` (no primary found for an alias) →
  triage/extract FATAL.
- Video with no captions AND `yt-dlp`/Whisper failure → record the post with an
  empty transcript, log a warning, continue (caption-only extraction). Never
  abort the whole run for one video.
- API quota/HTTP errors → retry with backoff a small fixed number of times, then
  log and continue to the next video.

## Testing

All external services (YouTube Data API, `youtube-transcript-api`, `yt-dlp`,
instagrapi, Anthropic) are mocked — no live calls.

- `youtube_post_to_record(api_video, transcript_present)` maps a mocked API
  video object to the normalized `posts.jsonl` schema: videoId→shortcode,
  watch-URL, title+description→caption, `source_platform="youtube"`, duration,
  description tag parsing.
- `resolve_prompt_manifest`: alias source → primary manifest (asserts primary's
  `incumbency`/`display_name`); primary → itself; unknown → `None`.
- `triage.py --no-fetch`: triages a seeded `posts.jsonl` with **no IG client
  constructed** (assert `get_client` is never called) and writes `triage.jsonl`.
- `extract.py`: for a post with `source_platform="youtube"` and a cached
  transcript, asserts the IG transcription fetch is **not** invoked and the
  transcript is used; for a missing cache, asserts caption-only + a warning.
- `build_site` fixture: a primary with a YouTube alias source merges both into
  one dossier; merged records carry `source_platform` (`"youtube"` for the YT
  source, `"instagram"`/default for IG). Extend the existing `tests/conftest.py`
  fixture; keep its now-correct isolation (patch `build_site._candidates`).

## Non-goals

- Other platforms (X/Twitter, Facebook, TikTok) — later cycles.
- The full scrape/triage decouple (Approach 1 / `scrape_instagram.py`).
- Web-UI rendering of a "via YouTube" badge — data only this sprint.
- YouTube comments, community posts, Shorts-vs-long distinction beyond `type`.
- Live API calls in tests.
- Discovering which candidates have channels — that is per-candidate research at
  ingestion time (like the IG-handle hunt). This spec ships the adapter; channel
  IDs are added as manifest data when each candidate is onboarded.

## Rollout

1. Add deps to `requirements.txt`: `youtube-transcript-api`, `yt-dlp`,
   `requests`. The YouTube Data API v3 is called over thin HTTP via `requests`
   (fewer deps than `google-api-python-client`, and trivial to mock in tests) —
   not an official client library.
2. Implement `resolve_prompt_manifest` + tests.
3. Implement `scrape_youtube.py` (normalizer first, TDD) + tests.
4. Add `triage.py --no-fetch` + alias-framing + tests.
5. Update `extract.py` (alias-framing + non-IG transcription guard) + tests.
6. Thread `source_platform` through `build_site.py` + fixture test.
7. (Operational, separate from this plan) Research candidate channel IDs, add
   source manifests, run `scrape_youtube → triage --no-fetch → extract →
   synthesize → build` for each.
