# Sprint 20. News Quote Ingestion (Wider Source Net, Phase 1)

**Date:** 2026-06-07
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 17 (`source_platform` tagging + the alias/source dossier merge), the existing `triage.py`/`extract.py` pipeline, and the candidate roster (`lib/candidates`).

## Goal

Ingest **verbatim quotes the candidate gave in news coverage** as `quote`
records, sourced to the originating article. Poll a hand-authored registry of
free Toronto-outlet RSS feeds, match items to the candidate roster by name,
fetch matched articles, and extract **only the candidate's directly-attributed
quotes** — never the journalist's prose. Quotes merge into the candidate dossier
via the existing `source_platform` plumbing.

This is **axis B** (wider source net), Phase 1. It deliberately covers one
content type (candidate quotes in news) discovered via RSS from free outlets.
Op-eds, third-party coverage, API/auto-discovery, and paywalled outlets are
later cycles.

## Motivation

The dossier is sourced entirely from the candidate's own channels (Instagram;
YouTube adapter built). Substantive stated positions also appear as quotes the
candidate gives to news outlets — first-party words in a third-party venue. The
methodology permits these because the quote *is* the candidate's statement and
the article is its citation. This widens coverage beyond owned channels while
staying inside the "every record is the candidate's own sourced words" rule.

## Editorial constraint (load-bearing)

A news article is mostly third-party text with first-party quotes embedded. The
methodology only permits the quotes. Therefore:

- Extract **only verbatim text directly attributed to the candidate** (a quoted
  span tied to an attribution like "Chow said" / "said Bradford").
- Store the surrounding **attribution sentence** as proof, plus the verbatim
  `quote_text`.
- **Never** extract the journalist's characterization, paraphrase, or analysis.
- No verdict, no framing, no "coverage" records — quotes only.

## Constraints discovered (shape the design)

- **Paywalls:** Toronto Star and the Globe paywall article bodies. Quote
  extraction targets **free outlets only** (CBC Toronto, CP24, CityNews).
- **Broken-env / expat:** RSS is XML; the current env's libexpat break disables
  `xml.parsers.expat` (and thus `xml.etree`/`feedparser`). To keep the code
  buildable and testable now, **all parsing uses stdlib `html.parser`** (pure
  Python, no expat) and **`urllib`** for HTTP — no `pip` installs. Opus
  extraction uses the already-installed `anthropic`.

## Architecture (Python pipeline extension)

### 1. Feed registry — `data/news/feeds.json`

Hand-authored:

```json
[
  { "outlet": "CBC Toronto", "rss_url": "https://www.cbc.ca/webfeed/rss/rss-canada-toronto", "paywalled": false },
  { "outlet": "CP24", "rss_url": "https://www.cp24.com/rss/...", "paywalled": false },
  { "outlet": "CityNews Toronto", "rss_url": "https://toronto.citynews.ca/feed/", "paywalled": false }
]
```

Only `paywalled: false` outlets are processed for extraction. (Exact feed URLs
are confirmed during implementation; the registry is data, not code.)

### 2. `scripts/scrape_news.py`

- Reads `data/news/feeds.json`; for each non-paywalled feed:
  - `urllib` GET the RSS; parse `<item>` `link`/`title`/`description`/`pubDate`
    with a stdlib `html.parser`-based parser (`FeedParser` — no expat).
  - **Name-match** each item against the primary roster (`load_all_candidates`):
    match the candidate's `display_name` (and a normalized variant) in
    `title + description`. An item may match 0, 1, or more candidates; route to
    each match.
  - For matched items not already ingested, `urllib` GET the article HTML and
    extract readable text via a stdlib `html.parser`-based extractor
    (`ArticleTextExtractor` — collects visible `<p>` text, drops script/style/nav).
- **Resumable:** an article URL already recorded for a candidate is skipped
  (track by URL hash).
- Writes per candidate: the article text to `data/<handle>/news/<urlhash>.txt`
  and an append-only index `data/<handle>/news/articles.jsonl`
  (`{url, url_hash, outlet, title, pub_date, fetched_at}`).
- Pure helpers (`FeedParser`, `ArticleTextExtractor`, `match_candidates`,
  `url_hash`) are separated from I/O so they're unit-testable with fixture
  strings (no network).

### 3. Attribution-aware quote extraction — `scripts/extract_news.py`

A dedicated extractor (kept separate from `extract.py` because attribution logic
differs from first-party self-extraction):

- For each candidate's un-extracted article (in `articles.jsonl` not yet in the
  extracted set), send the article text + the candidate's display name to Opus
  with a tool schema returning zero or more quotes, each:
  `{ quote_text (verbatim), attribution (the sentence tying the quote to the
  candidate), topic (from the existing TOPICS taxonomy) }`.
- System prompt (candidate-aware, via `resolve_prompt_manifest`): extract only
  text the article directly attributes to `<candidate>` as their own words;
  return the verbatim quote and its attribution sentence; never the reporter's
  words; if no attributed quote exists, return none.
- **Verbatim guard:** drop any returned `quote_text` not found as a substring of
  the article text (post-hoc check — guarantees verbatim, not paraphrase).
- Writes `quote` records to `data/<handle>/records.jsonl`:
  `{ kind: "quote", shortcode: <urlhash>, post_url: <article url>,
  post_date: <pub_date>, topic, quote_text, source_quote: <attribution>,
  source_account: <handle>, source_platform: "news", outlet, model,
  extracted_at }`. Append to the extracted set so it's resumable.

### 4. Merge & surface

- `source_platform: "news"` flows through `build_site.py`'s existing merge
  (Sprint 17) — news quotes appear in the dossier alongside IG/YouTube records,
  click-throughable to the article.
- No new UI this sprint (data only, mirroring Sprint 17). A later sprint can
  surface "news quotes" distinctly or feed them into "Said vs. Done."

## Data flow

```
data/news/feeds.json (free outlets)
   │ scrape_news.py: urllib GET feed → FeedParser (html.parser, no expat)
   ▼ items → match_candidates(display_name in title+desc)
   │ matched → urllib GET article → ArticleTextExtractor (html.parser)
   ▼
data/<handle>/news/<urlhash>.txt  +  articles.jsonl (index)
   │ extract_news.py: Opus attribution-aware quote extraction + verbatim guard
   ▼
data/<handle>/records.jsonl  (kind=quote, source_platform=news)
   │ build_site.py merge (existing source_platform plumbing)
   ▼ web/public/data/candidates/<slug>.json
```

## Error handling

- Feed/article fetch failure (HTTP error, timeout): log + skip that item;
  never abort the whole run. Small fixed-retry on transient errors.
- Unparseable feed: log + skip the feed.
- Article with no extractable text (paywall wall, JS-only): record nothing for
  it (no `.txt`), log; it won't be re-fetched if URL-hash recorded as attempted.
- Opus returns a non-verbatim quote: dropped by the verbatim substring guard.
- Missing `NEWS`/`ANTHROPIC_API_KEY`: `extract_news.py` FATALs clearly (scrape
  itself needs no API key).
- A candidate with no `display_name`: skipped by `match_candidates`.

## Testing

All external services mocked / fixtures only — no network, expat-free, runs in
the current env.

- `FeedParser`: a fixture RSS string → list of `{link,title,description,pub_date}`
  items; malformed feed → `[]` (no crash, no expat).
- `match_candidates`: an item mentioning "Olivia Chow" routes to chow only; an
  item mentioning two candidates routes to both; an unrelated item routes to none.
- `ArticleTextExtractor`: a fixture HTML string → joined `<p>` text with
  script/style/nav stripped.
- `url_hash`: stable, filesystem-safe.
- quote extraction (mock the Opus tool call): given fixture article text + a
  mocked tool response containing one real candidate quote and one journalist
  paraphrase, only the verbatim-present quote survives the guard; assert the
  record shape (`kind=quote`, `source_platform=news`, `outlet`, verbatim
  `quote_text`, `source_quote` attribution).
- resumability: an article already in `articles.jsonl` / extracted set is skipped.

## Non-goals

- Paywalled-outlet body extraction (Star/Globe) — headlines only, no quotes.
- API/search auto-discovery (RSS registry only).
- Op-eds authored by the candidate, and third-party coverage/characterization
  (separate later sub-projects of axis B).
- A dedicated news-quote UI surface (data only this sprint).
- HTML scraping of arbitrary non-RSS pages.
- Sentiment, framing, or any non-quote record from news.

## Rollout

1. `data/news/feeds.json` with confirmed free-outlet feed URLs.
2. `scripts/lib` (or `scripts/`) pure helpers: `FeedParser`,
   `ArticleTextExtractor`, `match_candidates`, `url_hash` + tests.
3. `scripts/scrape_news.py` (I/O orchestration over the helpers) + tests.
4. `scripts/extract_news.py` (attribution-aware Opus extraction + verbatim
   guard) + tests.
5. Confirm `build_site.py` merges `source_platform="news"` records (it already
   threads `source_platform`; add a fixture test if not covered).
6. (Operational, needs network + `ANTHROPIC_API_KEY`) run scrape_news →
   extract_news → build over the roster; eyeball extracted quotes for
   attribution fidelity.
