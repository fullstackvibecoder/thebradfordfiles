# Expanded News Feed Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the free-outlet news net (4 new RSS feeds + CBC re-enabled), harden fetching (per-feed User-Agent + retry), and add a coverage health check so silent feed failures surface.

**Architecture:** All changes live in the existing RSS path — `data/news/feeds.json` (registry), `scripts/scrape_news.py` (fetch + orchestration), with `scripts/lib/news.py` parsing untouched. New logic is expressed as small pure functions in `scrape_news.py` (UA resolution, retry wrapper, degraded detection, total-outage check) so it unit-tests without network. Health state is a snapshot file `data/news/health.json`.

**Tech Stack:** Python 3.12 stdlib only (`urllib`, `json`, `time`, `html.parser`) — no new deps; pytest for tests.

## Global Constraints

- **Stdlib only.** No new pip deps; must run in the Sprint-21 cron (`requirements-news.txt` = `anthropic`, `python-dotenv`) and CI. No `xml.parsers.expat` / `xml.etree` (env ABI bug) — keep using `lib/news`'s `html.parser` path.
- **Default UA is the honest bot UA:** `thebradfordfiles-newsbot/1.0 (civic transparency)` (`scripts/scrape_news.py` `USER_AGENT`). Only a feed with an explicit `user_agent` override sends something else.
- **Gitignore boundary (Sprint 21):** `data/*/news/*.txt` stay gitignored. `data/*/news/articles.jsonl` and `data/news/health.json` are committed.
- **Relevance gate is unchanged:** `lib/news.match_candidates` (full `display_name` in title+description). No new topic/keyword filter (spec YAGNI).
- **Tests run with:** `.venv/bin/python -m pytest`.

---

### Task 1: Feed registry expansion

**Files:**
- Modify: `data/news/feeds.json`
- Create: `tests/test_news_feeds_registry.py`

**Interfaces:**
- Produces: the expanded `feeds.json` consumed by `scrape_news.main` and Task 3's health check. Each entry: `{outlet: str, rss_url: str|null, paywalled: bool, user_agent?: str, skip?: bool, note?: str}`.

- [ ] **Step 1: Write the failing registry-validity test**

Create `tests/test_news_feeds_registry.py`:

```python
import json
from pathlib import Path

FEEDS = Path(__file__).resolve().parent.parent / "data" / "news" / "feeds.json"


def _load():
    return json.loads(FEEDS.read_text())


def test_every_entry_has_outlet_and_valid_shape():
    for f in _load():
        assert isinstance(f.get("outlet"), str) and f["outlet"], f
        assert isinstance(f.get("paywalled"), bool), f
        # Either a real feed URL, or explicitly skipped (no-RSS placeholder).
        assert f.get("skip") is True or (isinstance(f.get("rss_url"), str) and f["rss_url"]), f
        if "user_agent" in f:
            assert isinstance(f["user_agent"], str) and f["user_agent"], f


def test_expected_free_feeds_present_and_active():
    by_outlet = {f["outlet"]: f for f in _load()}
    for outlet in ["CityNews Toronto", "Global News Toronto", "NOW Toronto",
                   "TorontoToday", "blogTO", "CBC Toronto"]:
        assert outlet in by_outlet, f"missing feed: {outlet}"
        f = by_outlet[outlet]
        assert not f.get("skip"), f"{outlet} should be active"
        assert f["paywalled"] is False, f"{outlet} should be free"


def test_cbc_has_browser_user_agent_override():
    cbc = {f["outlet"]: f for f in _load()}["CBC Toronto"]
    assert "user_agent" in cbc and "Mozilla" in cbc["user_agent"]


def test_no_rss_outlets_are_marked_skip():
    by_outlet = {f["outlet"]: f for f in _load()}
    for outlet in ["CP24", "CTV News Toronto", "Toronto.com"]:
        assert outlet in by_outlet, f"missing deferred placeholder: {outlet}"
        assert by_outlet[outlet].get("skip") is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_news_feeds_registry.py -v`
Expected: FAIL (new outlets/keys not yet in `feeds.json`).

- [ ] **Step 3: Write the expanded `feeds.json`**

Replace `data/news/feeds.json` with:

```json
[
  { "outlet": "CityNews Toronto", "rss_url": "https://toronto.citynews.ca/feed/", "paywalled": false },
  { "outlet": "Global News Toronto", "rss_url": "https://globalnews.ca/toronto/feed/", "paywalled": false },
  { "outlet": "NOW Toronto", "rss_url": "https://nowtoronto.com/feed/", "paywalled": false },
  { "outlet": "TorontoToday", "rss_url": "https://www.torontotoday.ca/rss", "paywalled": false, "note": "use /rss; /feed returns 403" },
  { "outlet": "blogTO", "rss_url": "https://www.blogto.com/rss/articles.xml", "paywalled": false, "note": "low civic signal; supplementary" },
  { "outlet": "CBC Toronto", "rss_url": "https://www.cbc.ca/webfeed/rss/rss-canada-toronto", "paywalled": false, "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "note": "CDN blocks the bot UA; browser UA gets 200" },
  { "outlet": "Toronto Star GTA", "rss_url": "https://www.thestar.com/search/?f=rss&t=article&c=news/gta*&l=50&s=start_time&sd=desc", "paywalled": true, "note": "feed parses but article bodies paywalled; excluded from extraction" },
  { "outlet": "CP24", "rss_url": null, "paywalled": false, "skip": true, "note": "no public RSS (Bell dropped RSS); needs HTML scraping — deferred" },
  { "outlet": "CTV News Toronto", "rss_url": null, "paywalled": false, "skip": true, "note": "CTV FAQ: no RSS feeds; needs HTML scraping — deferred" },
  { "outlet": "Toronto.com", "rss_url": null, "paywalled": false, "skip": true, "note": "Metroland shut down RSS; needs HTML scraping — deferred" }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_news_feeds_registry.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add data/news/feeds.json tests/test_news_feeds_registry.py
git commit -m "feat(sprint-22): expand news feed registry (4 free feeds + CBC UA; no-RSS placeholders)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fetch hardening (per-feed UA + retry)

**Files:**
- Modify: `scripts/scrape_news.py`
- Modify: `tests/test_scrape_news.py` (existing `fake_get` must accept the new `user_agent` kwarg)
- Test: `tests/test_scrape_news_fetch.py` (new — pure-function tests)

**Interfaces:**
- Consumes: `feeds.json` entries from Task 1 (may carry `user_agent` / `skip`).
- Produces:
  - `effective_user_agent(feed: dict) -> str` — returns `feed["user_agent"]` or module `USER_AGENT`.
  - `http_get(url: str, user_agent: str | None = None) -> str` — fetch with the given UA (or default).
  - `fetch_with_retry(thunk, *, retries: int = 3, sleep=time.sleep) -> str` — call `thunk()`, retrying on `urllib.error.URLError`/`TimeoutError`/HTTP 5xx/429 up to `retries` times with linear backoff (`sleep(attempt)`); re-raise the last error on exhaustion. HTTP 4xx other than 429 is NOT retried (re-raised immediately).

- [ ] **Step 1: Write failing pure-function tests**

Create `tests/test_scrape_news_fetch.py`:

```python
import sys
from pathlib import Path
import urllib.error
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_news as sn


def test_effective_user_agent_prefers_override():
    assert sn.effective_user_agent({"user_agent": "Mozilla/5.0 X"}) == "Mozilla/5.0 X"


def test_effective_user_agent_defaults_to_bot_ua():
    assert sn.effective_user_agent({}) == sn.USER_AGENT


def test_retry_succeeds_after_transient_failures():
    calls = {"n": 0}
    slept = []
    def thunk():
        calls["n"] += 1
        if calls["n"] < 3:
            raise TimeoutError("boom")
        return "ok"
    out = sn.fetch_with_retry(thunk, retries=3, sleep=slept.append)
    assert out == "ok"
    assert calls["n"] == 3
    assert slept == [1, 2]  # linear backoff before attempts 2 and 3


def test_retry_reraises_after_exhaustion():
    def thunk():
        raise TimeoutError("always")
    with pytest.raises(TimeoutError):
        sn.fetch_with_retry(thunk, retries=3, sleep=lambda _: None)


def test_retry_does_not_retry_4xx_except_429():
    calls = {"n": 0}
    def thunk():
        calls["n"] += 1
        raise urllib.error.HTTPError("u", 404, "nf", {}, None)
    with pytest.raises(urllib.error.HTTPError):
        sn.fetch_with_retry(thunk, retries=3, sleep=lambda _: None)
    assert calls["n"] == 1  # not retried


def test_retry_retries_429():
    calls = {"n": 0}
    def thunk():
        calls["n"] += 1
        if calls["n"] < 2:
            raise urllib.error.HTTPError("u", 429, "slow", {}, None)
        return "ok"
    assert sn.fetch_with_retry(thunk, retries=3, sleep=lambda _: None) == "ok"
    assert calls["n"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_scrape_news_fetch.py -v`
Expected: FAIL (`effective_user_agent`/`fetch_with_retry` not defined).

- [ ] **Step 3: Implement the helpers in `scrape_news.py`**

Add `import time` and `import urllib.error` at the top (near the existing `import urllib.request`). Then add, after the `USER_AGENT` constant:

```python
def effective_user_agent(feed: dict) -> str:
    """Per-feed UA override (e.g. browser UA for CBC) or the default bot UA."""
    return feed.get("user_agent") or USER_AGENT


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code == 429 or 500 <= exc.code < 600
    return isinstance(exc, (urllib.error.URLError, TimeoutError))


def fetch_with_retry(thunk, *, retries: int = 3, sleep=time.sleep) -> str:
    """Call thunk(), retrying transient failures (URLError/timeout/5xx/429) with
    linear backoff. Re-raises the last error after `retries` attempts. 4xx other
    than 429 is not retried."""
    last = None
    for attempt in range(1, retries + 1):
        try:
            return thunk()
        except Exception as e:  # noqa: BLE001
            if not _is_retryable(e) or attempt == retries:
                raise
            last = e
            sleep(attempt)
    raise last  # unreachable, but keeps type-checkers happy
```

Change `http_get` to accept a UA:

```python
def http_get(url: str, user_agent: str | None = None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent or USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310
        return r.read().decode("utf-8", errors="replace")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_scrape_news_fetch.py -v`
Expected: PASS (6 tests).

- [ ] **Step 5: Thread UA + retry + skip into `main()`; fix the existing fake_get**

In `scrape_news.py` `main()`, update the feed loop so each feed resolves its UA, honours `skip`, and fetches through `fetch_with_retry`. Replace the loop body from `for feed in feeds:` down to the article fetch with:

```python
    for feed in feeds:
        if feed.get("skip") or feed.get("paywalled"):
            continue
        outlet, rss_url = feed.get("outlet", "?"), feed.get("rss_url", "")
        ua = effective_user_agent(feed)
        try:
            xml = fetch_with_retry(lambda: http_get(rss_url, ua))
        except Exception as e:  # noqa: BLE001
            log(f"skip feed {outlet}: fetch error {e!r}")
            continue
        for item in news.parse_feed(xml):
            handles = news.match_candidates(
                f"{item['title']} {item['description']}", cands)
            if not handles:
                continue
            url = item["link"]
            uh = news.url_hash(url)
            for handle in handles:
                news_dir = DATA_DIR / handle / "news"
                news_dir.mkdir(parents=True, exist_ok=True)
                index = news_dir / "articles.jsonl"
                if uh in _existing_hashes(index):
                    continue
                try:
                    html = fetch_with_retry(lambda: http_get(url, ua))
                except Exception as e:  # noqa: BLE001
                    log(f"skip article {url}: fetch error {e!r}")
                    continue
                text = news.extract_article_text(html)
                if not text:
                    log(f"no extractable text: {url}")
                    continue
                (news_dir / f"{uh}.txt").write_text(text, encoding="utf-8")
                with index.open("a", encoding="utf-8") as f:
                    f.write(json.dumps({
                        "url": url, "url_hash": uh, "outlet": outlet,
                        "title": item["title"], "pub_date": item["pub_date"],
                        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    }, ensure_ascii=False) + "\n")
                n_written += 1
                log(f"+ {handle} · {outlet} · {item['title'][:60]}")
```

Then update the existing test's fake so it accepts the UA kwarg. In `tests/test_scrape_news.py`, change:

```python
    def fake_get(url):
```
to:
```python
    def fake_get(url, user_agent=None):
```

- [ ] **Step 6: Run the existing + new scrape tests to verify green**

Run: `.venv/bin/python -m pytest tests/test_scrape_news.py tests/test_scrape_news_fetch.py -v`
Expected: PASS (existing 2 routing tests + 6 fetch tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add scripts/scrape_news.py tests/test_scrape_news_fetch.py tests/test_scrape_news.py
git commit -m "feat(sprint-22): per-feed UA override + retry/backoff + skip no-RSS feeds

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Coverage health check

**Files:**
- Modify: `scripts/scrape_news.py`
- Test: `tests/test_scrape_news_health.py` (new)

**Interfaces:**
- Consumes: `effective_user_agent`, `fetch_with_retry`, `http_get` (Task 2); `feeds.json` (Task 1).
- Produces:
  - `detect_degraded(prior: list[dict], current: list[dict]) -> list[str]` — outlet names that were healthy last run (`status=="ok"` and `items_seen>0`) but this run are `status=="error"` OR `items_seen==0`. No prior entry for an outlet → never degraded (avoids first-run false positives).
  - `all_failed(current: list[dict]) -> bool` — True iff `current` is non-empty and every record has `status=="error"`.
  - side effect: `main()` writes `DATA_DIR/news/health.json` = `{"checked_at": iso, "feeds": [ {outlet,status,http_code,items_seen,items_matched,articles_written,error}, ... ]}` (overwrite snapshot), prints a per-feed summary + `WARN degraded:` line, and returns non-zero when `all_failed` is True.

- [ ] **Step 1: Write failing tests for the pure functions**

Create `tests/test_scrape_news_health.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_news as sn


def _rec(outlet, status="ok", items_seen=5):
    return {"outlet": outlet, "status": status, "http_code": 200,
            "items_seen": items_seen, "items_matched": 0,
            "articles_written": 0, "error": None}


def test_detect_degraded_flags_ok_to_error():
    prior = [_rec("CBC Toronto", "ok", 30)]
    current = [_rec("CBC Toronto", "error", 0)]
    assert sn.detect_degraded(prior, current) == ["CBC Toronto"]


def test_detect_degraded_flags_items_dropping_to_zero():
    prior = [_rec("NOW Toronto", "ok", 12)]
    current = [_rec("NOW Toronto", "ok", 0)]
    assert sn.detect_degraded(prior, current) == ["NOW Toronto"]


def test_detect_degraded_ignores_new_feed_with_no_prior():
    assert sn.detect_degraded([], [_rec("blogTO", "error", 0)]) == []


def test_detect_degraded_quiet_day_not_degraded_if_prior_also_zero():
    prior = [_rec("blogTO", "ok", 0)]
    current = [_rec("blogTO", "ok", 0)]
    assert sn.detect_degraded(prior, current) == []


def test_all_failed_true_only_when_every_feed_errored():
    assert sn.all_failed([_rec("A", "error"), _rec("B", "error")]) is True
    assert sn.all_failed([_rec("A", "error"), _rec("B", "ok")]) is False
    assert sn.all_failed([]) is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_scrape_news_health.py -v`
Expected: FAIL (`detect_degraded`/`all_failed` not defined).

- [ ] **Step 3: Implement the pure functions in `scrape_news.py`**

Add after `fetch_with_retry`:

```python
def detect_degraded(prior: list[dict], current: list[dict]) -> list[str]:
    """Outlets that were healthy last run (ok + items_seen>0) but are now errored
    or returning 0 items. Feeds with no prior record are never flagged."""
    was_healthy = {
        r["outlet"] for r in prior
        if r.get("status") == "ok" and r.get("items_seen", 0) > 0
    }
    out = []
    for r in current:
        if r["outlet"] in was_healthy and (
            r.get("status") == "error" or r.get("items_seen", 0) == 0
        ):
            out.append(r["outlet"])
    return out


def all_failed(current: list[dict]) -> bool:
    """True iff there is at least one feed and every one errored (total outage)."""
    return bool(current) and all(r.get("status") == "error" for r in current)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_scrape_news_health.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire health accumulation + write + exit into `main()`**

In `scrape_news.py`, add a helper to load prior health (near `_existing_hashes`):

```python
def _load_health(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text()).get("feeds", [])
    except Exception:  # noqa: BLE001
        return []
```

Then refactor `main()` to accumulate a per-feed result and write the snapshot. Replace the feed loop and the final `log(...)`/`return 0` with this structure (the inner article loop from Task 2 is unchanged — only the surrounding accounting is added):

```python
    health_path = DATA_DIR / "news" / "health.json"
    prior = _load_health(health_path)
    results: list[dict] = []

    for feed in feeds:
        if feed.get("skip") or feed.get("paywalled"):
            continue
        outlet, rss_url = feed.get("outlet", "?"), feed.get("rss_url", "")
        ua = effective_user_agent(feed)
        rec = {"outlet": outlet, "status": "ok", "http_code": 200,
               "items_seen": 0, "items_matched": 0, "articles_written": 0,
               "error": None}
        try:
            xml = fetch_with_retry(lambda: http_get(rss_url, ua))
        except Exception as e:  # noqa: BLE001
            rec["status"] = "error"
            rec["http_code"] = getattr(e, "code", None)
            rec["error"] = repr(e)
            log(f"skip feed {outlet}: fetch error {e!r}")
            results.append(rec)
            continue
        items = news.parse_feed(xml)
        rec["items_seen"] = len(items)
        for item in items:
            handles = news.match_candidates(
                f"{item['title']} {item['description']}", cands)
            if not handles:
                continue
            rec["items_matched"] += 1
            url = item["link"]
            uh = news.url_hash(url)
            for handle in handles:
                news_dir = DATA_DIR / handle / "news"
                news_dir.mkdir(parents=True, exist_ok=True)
                index = news_dir / "articles.jsonl"
                if uh in _existing_hashes(index):
                    continue
                try:
                    html = fetch_with_retry(lambda: http_get(url, ua))
                except Exception as e:  # noqa: BLE001
                    log(f"skip article {url}: fetch error {e!r}")
                    continue
                text = news.extract_article_text(html)
                if not text:
                    log(f"no extractable text: {url}")
                    continue
                (news_dir / f"{uh}.txt").write_text(text, encoding="utf-8")
                with index.open("a", encoding="utf-8") as f:
                    f.write(json.dumps({
                        "url": url, "url_hash": uh, "outlet": outlet,
                        "title": item["title"], "pub_date": item["pub_date"],
                        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    }, ensure_ascii=False) + "\n")
                rec["articles_written"] += 1
                n_written += 1
                log(f"+ {handle} · {outlet} · {item['title'][:60]}")
        results.append(rec)

    health_path.parent.mkdir(parents=True, exist_ok=True)
    health_path.write_text(json.dumps({
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "feeds": results,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for r in results:
        log(f"  feed {r['outlet']}: {r['status']} · seen={r['items_seen']} "
            f"matched={r['items_matched']} written={r['articles_written']}")
    degraded = detect_degraded(prior, results)
    if degraded:
        log(f"WARN degraded: {', '.join(degraded)}")
    log(f"done. {n_written} new articles")
    if all_failed(results):
        log("FATAL: all feeds failed")
        return 1
    return 0
```

- [ ] **Step 6: Run the full scrape suite to verify green**

Run: `.venv/bin/python -m pytest tests/test_scrape_news.py tests/test_scrape_news_fetch.py tests/test_scrape_news_health.py -v`
Expected: PASS. (`test_scrape_news.py`'s two tests now also produce a `health.json` under their tmp `data/news/`; they assert on `articles.jsonl`, so they remain green.)

- [ ] **Step 7: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add scripts/scrape_news.py tests/test_scrape_news_health.py
git commit -m "feat(sprint-22): coverage health check (health.json + degraded warn + total-outage exit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Live validation + operationalization

**Files:** none (validation only). Do NOT commit any data churn from the live run.

- [ ] **Step 1: Full test suite green**

Run: `.venv/bin/python -m pytest`
Expected: all pass (existing ~95 news/py tests + the new registry/fetch/health tests).

- [ ] **Step 2: Live scrape against the real feeds**

Run:
```bash
cd /Users/aramammo/thebradfordfiles
set -a; . ./.env; set +a
.venv/bin/python scripts/scrape_news.py
```
Expected: per-feed summary lines for CityNews / Global / NOW / TorontoToday / blogTO / CBC; **CBC shows `status: ok`** (browser UA works); `data/news/health.json` written; a plausible `N new articles` count (0 on a quiet day is fine — the point is that all six feeds report `ok`, not `error`).

- [ ] **Step 3: Inspect health.json**

Run: `.venv/bin/python -c "import json; [print(f['outlet'], f['status'], 'seen='+str(f['items_seen'])) for f in json.load(open('data/news/health.json'))['feeds']]"`
Expected: six `ok` lines. If any feed shows `error`, note the outlet + error in the task report (a feed may have changed its URL since research — fix the URL in `feeds.json` and re-run).

- [ ] **Step 4: Discard live-run data churn**

Real ingestion is the cron's job, not this validation. Discard anything the run wrote:
```bash
git checkout -- data/ web/public/data/ 2>/dev/null || true
git clean -fdq data/*/news/ 2>/dev/null || true
```
Then confirm a clean tree: `git status --short` (expected: empty, or only intended source already committed in Tasks 1–3).

- [ ] **Step 5: Post-merge — trigger the cron to confirm end-to-end**

After merge/push, run: `gh workflow run news-refresh.yml` then check the Actions tab. Expected: green run; on a real candidate story the wider net now catches it, commits `news: daily refresh <date>`, and (via Git integration) redeploys. `health.json` is committed with the daily refresh.

---

## Self-Review

- **Spec coverage:**
  - Add 4 free feeds → Task 1 (`feeds.json` + presence test) ✓
  - Re-enable CBC via per-feed browser UA → Task 1 (`user_agent`) + Task 2 (`effective_user_agent`, threaded into fetch) ✓
  - Fetch hardening (per-feed UA + retry/backoff, both feed & article fetch) → Task 2 ✓
  - Coverage health check (`health.json`, DEGRADED warn, total-outage non-zero exit) → Task 3 ✓
  - Deferred no-RSS outlets recorded not dropped → Task 1 (`skip` placeholders + test) ✓
  - No new relevance filter (YAGNI) → unchanged `match_candidates`; no task adds one ✓
  - Stdlib-only / gitignore boundary → Global Constraints + Task 4 discard step ✓
- **Placeholder scan:** none — every code step shows full code; every run step has an expected result.
- **Type consistency:** `effective_user_agent(feed)->str`, `fetch_with_retry(thunk,*,retries,sleep)->str`, `http_get(url,user_agent=None)->str`, `detect_degraded(prior,current)->list[str]`, `all_failed(current)->bool`, `_load_health(path)->list[dict]` — used identically across Tasks 2–3 and their tests. The health `rec` dict keys match the `detect_degraded`/`all_failed` reads (`status`, `items_seen`).
- **Consistency with Sprint 21:** total-outage `return 1` trips the cron's `if: failure()` issue step; `health.json` + `articles.jsonl` committed by the cron's `git add data/` (respects the `*.txt` gitignore); `.txt` stays gitignored.
- **Testing note:** All new logic is pure functions unit-tested without network; the live feeds are validated in Task 4, mirroring Sprint 20/21's "unit-test the logic, live-run the I/O" split.
