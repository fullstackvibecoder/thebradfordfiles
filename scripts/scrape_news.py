#!/usr/bin/env python3
"""scrape_news.py — poll free-outlet RSS feeds, match items to candidates by
name, fetch matched articles, and store article text + an index per candidate.
Quote extraction is a separate step (extract_news.py). stdlib only."""
from __future__ import annotations

import argparse
import json
import sys
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


def http_get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
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


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser().parse_args(argv)
    feeds_path = DATA_DIR / "news" / "feeds.json"
    if not feeds_path.exists():
        log(f"FATAL: no feed registry at {feeds_path}")
        return 1
    feeds = json.loads(feeds_path.read_text())
    cands = _candidates.load_all_candidates()
    n_written = 0

    for feed in feeds:
        if feed.get("paywalled"):
            continue
        outlet, rss_url = feed.get("outlet", "?"), feed.get("rss_url", "")
        try:
            xml = http_get(rss_url)
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
                    html = http_get(url)
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
    log(f"done. {n_written} new articles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
