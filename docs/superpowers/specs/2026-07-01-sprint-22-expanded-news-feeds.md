# Sprint 22 — Expanded News Feed Coverage

**Status:** SPEC
**Date:** 2026-07-01
**Depends on:** Sprint 20 (news quote ingestion), Sprint 21 (daily news-refresh cron)

## Goal

Widen the free-outlet news net so major Toronto municipal-politics stories stop
slipping past the daily news cron, and make silent feed failures visible.

## Motivation

On 2026-06-29 Brad Bradford announced his "Toronto Square" rename/cleanup plan.
It ran on CBC, CP24, CTV, and NOW Toronto — but **not** CityNews in-window, so
the Sprint-21 cron (which polls only CityNews RSS) never saw it. It had to be
ingested manually. Root causes:

1. **Too few feeds.** Only CityNews RSS is live; CBC was marked `paywalled`
   (mislabeled — see below), Star is genuinely paywalled.
2. **A fetch block misdiagnosed as a paywall.** CBC's CDN rejects the pipeline's
   bot User-Agent at the connection level (instant fail that looks like a
   timeout). A browser-style UA gets HTTP 200. CBC was never actually paywalled
   for reading; it was UA-blocked.
3. **No coverage visibility.** A feed going dark (0 items, or a fetch error)
   produces no signal — the run just reports "0 new articles," indistinguishable
   from a genuinely quiet day.

## Scope

### In scope
- Add verified free RSS feeds: Global News Toronto, NOW Toronto, TorontoToday,
  blogTO.
- Re-enable CBC Toronto via a per-feed browser-style User-Agent override.
- Fetch hardening: per-feed UA override + retry-with-backoff on transient
  timeout/5xx, for both feed and article fetches.
- Coverage health check: per-feed run status written to `data/news/health.json`,
  a printed per-feed summary, a `DEGRADED` warning when a previously-working feed
  errors or returns 0 items, and a non-zero exit only on total outage (all feeds
  fail) so the cron's failure-issue fires.

### Out of scope (future sub-sprints)
- **CP24, CTV News Toronto, Toronto.com/Metroland** — verified to have NO public
  RSS. These require an HTML section-page scraping approach; deferred.
- **Per-outlet article-text extraction.** The generic `<p>` extractor
  (`lib/news.extract_article_text`) works for CityNews/CP24/NOW/Global; where it
  underperforms (e.g. CTV returned 39 bytes), that outlet is already out of scope
  for lack of RSS. No per-outlet extractors this sprint.
- **New topic/keyword relevance filter.** Deliberate YAGNI — see below.

## Verified feed inventory

All URLs below were fetched live and return RSS/Atom XML **with the pipeline's
current UA** unless noted. All are free to read.

| Outlet | Feed URL | Format | Fetch note |
|---|---|---|---|
| CityNews Toronto (existing) | `https://toronto.citynews.ca/feed/` | RSS 2.0 | ok |
| Global News Toronto | `https://globalnews.ca/toronto/feed/` | RSS 2.0 | ok |
| NOW Toronto | `https://nowtoronto.com/feed/` | RSS 2.0 | trailing slash required (`/feed` 301s) |
| TorontoToday | `https://www.torontotoday.ca/rss` | RSS 2.0 | use `/rss`; `/feed` 403s |
| blogTO | `https://www.blogto.com/rss/articles.xml` | RSS 2.0 | supplementary (low civic signal) |
| CBC Toronto | `https://www.cbc.ca/webfeed/rss/rss-canada-toronto` | RSS 2.0 | **needs browser-style UA** |

No-RSS (documented, deferred): CP24, CTV News Toronto, Toronto.com/Metroland.

## Design

### Component 1 — Feed registry expansion

`data/news/feeds.json` entries gain optional fields:

```json
{
  "outlet": "CBC Toronto",
  "rss_url": "https://www.cbc.ca/webfeed/rss/rss-canada-toronto",
  "paywalled": false,
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
}
```

- `user_agent` (optional): overrides the default bot UA for both this feed's RSS
  fetch and its article fetches. Absent → default honest UA
  (`thebradfordfiles-newsbot/1.0 (civic transparency)`).
- Add the 4 new feeds (default UA). Re-enable CBC with the browser UA and
  `paywalled: false`. Keep CityNews. Keep Star as `paywalled: true`.
- No-RSS outlets: recorded as entries with `"rss_url": null` + a `"note"` and a
  `"skip": true` flag so `scrape_news` ignores them but we don't re-research them.

### Component 2 — Fetch hardening (`scrape_news.py`)

- `http_get(url, user_agent=None)` uses the passed UA or the module default.
- Per feed, resolve UA once: `feed.get("user_agent") or USER_AGENT`; thread it
  into the feed fetch and every article fetch for that feed.
- Retry-with-backoff: a small pure helper wraps a fetch thunk, retrying on
  `URLError`/timeout/5xx up to N times (e.g. 3) with linear backoff; 4xx (except
  429) is not retried. On final failure it raises so the caller records the feed
  as errored (rather than silently continuing).
- Article-fetch failures for a single item are still per-item non-fatal (as
  today) but are counted toward the feed's health record.

### Component 3 — Coverage health check

- Per feed, `scrape_news` accumulates a result record:
  `{outlet, status: "ok"|"error", http_code, items_seen, items_matched, articles_written, error, checked_at}`.
- After the run, write the full list to `data/news/health.json` (overwrite —
  it's a current-state snapshot, not an append log). Committed by the cron so the
  latest health travels with the repo.
- Compare against the prior `health.json`: a feed that was `ok` with
  `items_seen > 0` last run but is now `error` or `items_seen == 0` is flagged
  `DEGRADED` and printed as a `WARN` line.
- Exit code: `0` on success or partial failure (≥1 feed ok); non-zero only when
  **every** non-skipped feed errored (total outage), so the news cron's
  `if: failure()` step opens an issue.

### Deliberate YAGNI — no new relevance filter

`lib/news.match_candidates` already gates on a candidate's full `display_name`
appearing in the item title+description. That is the relevance filter: a Montreal
Canadiens story tagged "Toronto" won't contain "Brad Bradford", so it's never
fetched. Broadening feeds only increases items *scanned*; the name-match still
decides what's *fetched and extracted*. A civic-keyword filter is unrequested
scope and is omitted.

## Data formats

`data/news/health.json` (snapshot, overwritten each run):

```json
{
  "checked_at": "2026-07-01T11:00:03+00:00",
  "feeds": [
    {"outlet": "CityNews Toronto", "status": "ok", "http_code": 200,
     "items_seen": 40, "items_matched": 0, "articles_written": 0, "error": null},
    {"outlet": "CBC Toronto", "status": "ok", "http_code": 200,
     "items_seen": 30, "items_matched": 1, "articles_written": 1, "error": null}
  ]
}
```

`data/*/news/*.txt` remain gitignored (Sprint 21). `health.json` and
`articles.jsonl` are committed.

## Testing

Stdlib-only preserved (expat-free) so it runs in CI + the cron. New pure
functions get unit tests:

- **UA resolution** — `feed → effective UA` (override vs default).
- **Retry wrapper** — inject a fake fetch that fails N times then succeeds;
  assert retries, backoff calls, and that 4xx (non-429) doesn't retry.
- **Health-record construction** — per-feed results → `health.json` dict shape.
- **Degraded detection** — prior vs current health → correct `DEGRADED` set
  (ok→error, ok+items→0 items; first-run/no-prior → no false positives).
- **feeds.json validity** — parses; every entry has `outlet`; either a non-null
  `rss_url` or `skip: true`; `paywalled` boolean.

Live validation: a local `scrape_news` run against the real feeds (asserts the
new feeds + CBC fetch 200 and `health.json` is written), then a post-merge
`workflow_dispatch` of the news cron.

## Self-Review

- **Placeholders:** none. Feed URLs and UA-block root cause are verified live.
- **Consistency:** health-check exit-code rule matches Sprint-21's `if: failure()`
  issue step; `.txt` gitignore boundary from Sprint 21 is preserved; new feeds
  use the existing `parse_feed`/`match_candidates`/`extract_article_text` path
  unchanged (only fetch + registry + health are new).
- **Scope:** single implementation plan. No-RSS outlets and per-outlet
  extraction are explicitly deferred, not silently dropped.
- **Ambiguity:** "feed failure" is defined (fetch raises after retries) and
  distinguished from "0 matches on a quiet day"; total-outage vs partial-failure
  exit behavior is explicit.
