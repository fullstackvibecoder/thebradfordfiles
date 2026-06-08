# Sprint 21. Daily News-Refresh Cron

**Date:** 2026-06-08
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 20 (the news pipeline: `scrape_news.py`, `extract_news.py`, `data/news/feeds.json`) and the existing `.github/workflows/data-refresh.yml` (commit/deploy/issue plumbing).

## Goal

Run the Sprint-20 news pipeline automatically on a daily schedule so candidate
quotes accumulate as outlets publish them — turning a built-but-dormant feature
into a live, self-maintaining source. A new GitHub Actions workflow polls the
feeds, extracts attributed quotes, rebuilds the dossiers, commits, and deploys.

## Motivation

News ingestion is cron-shaped, not on-demand: a single snapshot of a general
feed almost always has no candidate story (the Sprint-20 live run confirmed 0 in
a 65-item window), so value only accrues by polling over time. The pipeline and
its editorial guarantees already exist and are tested; this sprint is the thin
automation layer that runs them daily and surfaces the results — and the first
real candidate article that comes through validates the extractor in production.

## Architecture

A separate daily workflow (independent of the weekly Node receipt refresh),
driven by a shell orchestrator that mirrors the existing `build_all.sh`.

### 1. `scripts/news_refresh.sh`

Bash orchestrator (mirrors `scripts/build_all.sh`), runnable locally and in CI:

```
set -euo pipefail; cd repo root
[ -f .env ] && source .env (export)            # local convenience; CI uses env
.venv/bin/python or python  scrape_news.py
for each primary handle (via lib.candidates):  python extract_news.py --account <h>
python build_site.py
```

- Python interpreter: use `.venv/bin/python` if present, else `python3`
  (so the same script works locally and on a CI runner without a venv).
- The candidate loop enumerates primaries from `load_all_candidates()` (a tiny
  inline `python -c` or a `--list-handles` helper); `extract_news.py` no-ops for
  handles with no news index, so looping all primaries is safe.
- Exits non-zero if any stage fails (`set -e`), so CI marks the run failed.

### 2. `requirements-news.txt`

Minimal CI runtime deps — only what the news path imports:

```
anthropic>=0.97
python-dotenv>=1.0
```

`scrape_news.py` and `build_site.py` are stdlib-only; only `extract_news.py`
needs `anthropic`/`dotenv`. This deliberately excludes `openai-whisper` (torch),
`instagrapi`, and `yt-dlp` so CI installs in seconds.

### 3. `.github/workflows/news-refresh.yml`

Mirrors `data-refresh.yml`'s structure with a Python runtime:

- **Triggers:** `schedule: cron "0 11 * * *"` (daily ~06:00 ET) + `workflow_dispatch`.
- **Permissions:** `contents: write`, `issues: write`.
- **Steps:**
  1. `actions/checkout@v4`
  2. `actions/setup-python@v5` (python 3.12)
  3. `pip install -r requirements-news.txt`
  4. Run `bash scripts/news_refresh.sh` with env `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` (FATAL-clear if the secret is missing).
  5. **Commit:** `git config user.name "news-refresh[bot]"`; `git add -f data/*/news/articles.jsonl data/*/records.jsonl web/public/data/`; if nothing staged → set `PUSHED=false`; else commit `news: daily refresh <date>` + push, `PUSHED=true`.
  6. **Deploy:** if `PUSHED == 'true'` and `VERCEL_*` secrets present → `vercel pull/build/deploy --prod` (copied verbatim from data-refresh.yml).
  7. **Failure issue:** `if: always()` → `node scripts/post-refresh-issue.mjs` (reused; see Open item).

### 4. Commit boundary — what's tracked

- **Commit:** `data/<h>/news/articles.jsonl` (URL/title/date metadata index),
  `data/<h>/records.jsonl` (verbatim quote records — short, attributed,
  source-linked; fair-use, consistent with stored IG captions), and the rebuilt
  `web/public/data/**`.
- **Gitignore (new):** `data/*/news/*.txt` — the full fetched article *bodies*
  are third-party copyrighted content and only a transient intermediate
  (resumability runs off the committed `articles.jsonl` + `records.jsonl`, not
  the `.txt`). Add `data/*/news/*.txt` to `.gitignore`.

## Data flow

```
cron (daily) → news-refresh.yml → news_refresh.sh:
   scrape_news.py        → data/<h>/news/{<hash>.txt (gitignored), articles.jsonl}
   extract_news.py --account <h> (per primary) → data/<h>/records.jsonl (kind=quote, source_platform=news)
   build_site.py         → web/public/data/**
→ commit (articles.jsonl + records.jsonl + web/public/data) → Vercel deploy → failure issue on error
```

## Error handling

- Missing `ANTHROPIC_API_KEY`: `extract_news.py` already FATALs (returns 1) →
  `set -e` fails the run → failure issue opened.
- A feed/article fetch error inside `scrape_news.py` logs + continues (Sprint
  20) — does not fail the run.
- No candidate stories (the common case): scrape writes nothing, extract no-ops,
  build is a no-op-ish rebuild → "nothing staged" → `PUSHED=false`, clean
  success, no commit, no deploy.
- `build_site.py` failure → non-zero → run fails → issue.

## Testing

This sprint is integration glue (a bash orchestrator + workflow YAML); the
pipeline stages it calls are already unit-tested (Sprint 20). Validation:

- **Local dry-run check:** `scripts/news_refresh.sh` runs end-to-end locally
  (sources `.env`, uses `.venv/bin/python`) and exits 0 on a no-candidate-story
  day (the realistic case) — confirms wiring without needing CI.
- **A tiny unit test** for any non-trivial helper added (e.g. if a
  `--list-handles` flag is added to a script, test it returns the primaries).
  If `news_refresh.sh` stays pure orchestration with no new Python logic, no new
  unit test is added (nothing testable beyond the already-tested stages).
- **CI validation:** after merge, trigger `workflow_dispatch` via
  `gh workflow run news-refresh.yml` and confirm a green run (expected outcome:
  0 articles / `PUSHED=false` on a quiet day, or real quotes if a candidate
  story is live).

## Non-goals

- Cost caps / per-run article throttling (resumable + low daily volume make it
  unnecessary; revisit only if a run ever processes an unexpectedly large batch).
- Changes to the weekly `data-refresh.yml` (receipts) — untouched.
- A news-quote-specific UI surface (news quotes already render as records via
  Sprint 18/20 `source_platform` plumbing; a dedicated treatment is later).
- Auto-discovery beyond the RSS registry; paywalled/bot-blocked outlets (the
  registry already documents these).
- Repairing the local libexpat issue (CI is clean; local is already patched).

## Open item

`scripts/post-refresh-issue.mjs` was written for the receipt refresh and may
read `web/.refresh-summary.json`. Confirm during implementation whether it runs
standalone for the news workflow; if it hard-depends on the receipt summary,
either (a) guard it to no-op when the summary is absent, or (b) replace the news
workflow's failure step with a minimal inline `gh issue create` on failure. Pick
whichever is smaller once its code is read.

## Rollout

1. Add `data/*/news/*.txt` to `.gitignore`.
2. `requirements-news.txt`.
3. `scripts/news_refresh.sh` (+ a `--list-handles` helper if needed) — verify it
   runs locally and exits 0 on a quiet day.
4. `.github/workflows/news-refresh.yml`.
5. Operator: add the `ANTHROPIC_API_KEY` GitHub Actions secret.
6. Trigger `workflow_dispatch`, confirm a green run; then the daily schedule
   takes over.
