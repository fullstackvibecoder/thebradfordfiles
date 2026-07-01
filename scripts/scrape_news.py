#!/usr/bin/env python3
"""scrape_news.py — poll free-outlet RSS feeds, match items to candidates by
name, fetch matched articles, and store article text + an index per candidate.
Quote extraction is a separate step (extract_news.py). stdlib only."""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import candidates as _candidates  # noqa: E402
from lib import news  # noqa: E402

DATA_DIR = ROOT / "data"
USER_AGENT = "thebradfordfiles-newsbot/1.0 (civic transparency)"


def log(msg: str) -> None:
    print(f"[news] {msg}", flush=True)


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


def http_get(url: str, user_agent: str | None = None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent or USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310
        return r.read().decode("utf-8", errors="replace")


def _existing_hashes(index_path: Path) -> set[str]:
    if not index_path.exists():
        return set()
    out = set()
    for line in index_path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                out.add(json.loads(line)["url_hash"])
            except Exception:  # noqa: BLE001
                pass
    return out


def _load_health(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text()).get("feeds", [])
    except Exception:  # noqa: BLE001
        return []


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser().parse_args(argv)
    feeds_path = DATA_DIR / "news" / "feeds.json"
    if not feeds_path.exists():
        log(f"FATAL: no feed registry at {feeds_path}")
        return 1
    feeds = json.loads(feeds_path.read_text())
    cands = _candidates.load_all_candidates()
    n_written = 0

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


if __name__ == "__main__":
    raise SystemExit(main())
