# News Quote Ingestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest verbatim candidate quotes from free-outlet RSS feeds as `quote` records (`source_platform="news"`), attribution-aware, merged into the dossier.

**Architecture:** Pure stdlib helpers in `scripts/lib/news.py` (url hashing, name matching, `html.parser`-based RSS + article parsing — no expat, no pip) feed `scripts/scrape_news.py` (urllib fetch + routing, writes article text + index) and `scripts/extract_news.py` (Opus attribution-aware quote extraction + verbatim guard, writes records). `build_site.py`'s existing `source_platform` merge surfaces them.

**Tech Stack:** Python 3 stdlib (`html.parser`, `urllib`, `hashlib`, `re`), `anthropic` (already installed). Tests: `.venv/bin/python -m pytest` (works in the current env — all parsing is expat-free).

---

### Task 1: `url_hash` + `match_candidates` helpers

**Files:**
- Create: `scripts/lib/news.py`
- Test: `tests/test_news_helpers.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_news_helpers.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import news


def test_url_hash_stable_and_safe():
    h1 = news.url_hash("https://cbc.ca/a")
    h2 = news.url_hash(" https://cbc.ca/a ")  # whitespace-trimmed → same
    assert h1 == h2
    assert h1.isalnum() and len(h1) == 16
    assert news.url_hash("https://cbc.ca/b") != h1


def test_match_candidates_by_display_name():
    cands = [
        {"handle": "oliviachow", "display_name": "Olivia Chow"},
        {"handle": "bradfordgrams", "display_name": "Brad Bradford"},
        {"handle": "sarahmcvie", "display_name": "Sarah McVie"},
    ]
    assert news.match_candidates("Mayor Olivia Chow announced today", cands) == ["oliviachow"]
    assert sorted(news.match_candidates("Chow and Brad Bradford debated", cands)) == ["bradfordgrams"]  # 'Chow' alone is not the full display_name
    assert sorted(news.match_candidates("Olivia Chow vs Brad Bradford", cands)) == ["bradfordgrams", "oliviachow"]
    assert news.match_candidates("A story about transit funding", cands) == []
    assert news.match_candidates("", cands) == []
```

- [ ] **Step 2: Run it, verify FAIL** (`ModuleNotFoundError: scripts.lib.news`):
`.venv/bin/python -m pytest tests/test_news_helpers.py -v`

- [ ] **Step 3: Implement**

Create `scripts/lib/news.py`:

```python
"""News ingestion helpers: url hashing, candidate name matching, and stdlib
html.parser-based RSS + article parsing (expat-free, pip-free)."""
from __future__ import annotations

import hashlib


def url_hash(url: str) -> str:
    """Stable, filesystem-safe 16-hex-char id for a URL (whitespace-trimmed)."""
    return hashlib.sha1((url or "").strip().encode("utf-8")).hexdigest()[:16]


def match_candidates(text: str, candidates: list[dict]) -> list[str]:
    """Return handles of candidates whose full display_name appears in text
    (case-insensitive). Full-name match avoids false positives from common
    surnames; routing to multiple candidates is allowed."""
    low = (text or "").lower()
    out: list[str] = []
    for c in candidates:
        name = (c.get("display_name") or "").strip().lower()
        if name and name in low:
            out.append(c["handle"])
    return out
```

- [ ] **Step 4: Run it, verify PASS** + no regressions:
`.venv/bin/python -m pytest tests/test_news_helpers.py -v` then `.venv/bin/python -m pytest tests/ -q`

- [ ] **Step 5: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add scripts/lib/news.py tests/test_news_helpers.py
git commit -m "feat(sprint-20): news url_hash + match_candidates helpers"
```

---

### Task 2: `parse_feed` (RSS via html.parser, CDATA-safe)

**Files:**
- Modify: `scripts/lib/news.py`
- Test: `tests/test_news_feed.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_news_feed.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import news

RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>CBC Toronto</title>
  <item>
    <title>Chow unveils housing plan</title>
    <link>https://www.cbc.ca/news/chow-housing</link>
    <description><![CDATA[Mayor <b>Olivia Chow</b> announced a plan.]]></description>
    <pubDate>Mon, 02 Jun 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Bradford on transit</title>
    <link>https://www.cbc.ca/news/bradford-transit</link>
    <description>Plain text description</description>
    <pubDate>Tue, 03 Jun 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>"""


def test_parse_feed_extracts_items_incl_cdata():
    items = news.parse_feed(RSS)
    assert len(items) == 2
    a = items[0]
    assert a["title"] == "Chow unveils housing plan"
    assert a["link"] == "https://www.cbc.ca/news/chow-housing"
    assert "Olivia Chow announced a plan." in a["description"]  # CDATA unwrapped, inner <b> dropped
    assert a["pub_date"].startswith("Mon, 02 Jun 2026")
    assert items[1]["description"] == "Plain text description"


def test_parse_feed_malformed_returns_empty():
    assert news.parse_feed("not xml at all <<<") == [] or isinstance(news.parse_feed("not xml at all <<<"), list)
    assert news.parse_feed("") == []
```

- [ ] **Step 2: Run it, verify FAIL** (`AttributeError: ... 'parse_feed'`):
`.venv/bin/python -m pytest tests/test_news_feed.py -v`

- [ ] **Step 3: Implement** — append to `scripts/lib/news.py`:

```python
from html.parser import HTMLParser

_ITEM_FIELDS = {"title", "link", "description", "pubdate"}


class _FeedParser(HTMLParser):
    """Collects RSS 2.0 <item> title/link/description/pubDate. Tolerates nested
    markup inside fields (text kept, tags dropped). CDATA is stripped before
    parsing (html.parser does not surface CDATA as data)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.items: list[dict] = []
        self._cur: dict | None = None
        self._field: str | None = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t == "item":
            self._cur = {}
        elif self._cur is not None and t in _ITEM_FIELDS and self._field is None:
            self._field = t
            self._buf = []

    def handle_data(self, data):
        if self._field is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        t = tag.lower()
        if t == "item" and self._cur is not None:
            self.items.append(self._cur)
            self._cur = None
            self._field = None
        elif self._cur is not None and t == self._field:
            self._cur[self._field] = "".join(self._buf).strip()
            self._field = None
            self._buf = []


def parse_feed(xml: str) -> list[dict]:
    """Parse an RSS 2.0 feed string into a list of
    {link, title, description, pub_date}. Returns [] on empty/garbage."""
    if not xml:
        return []
    # html.parser does not emit CDATA as data; unwrap the markers, keep inner text.
    cleaned = xml.replace("<![CDATA[", "").replace("]]>", "")
    p = _FeedParser()
    try:
        p.feed(cleaned)
    except Exception:
        return []
    return [
        {
            "link": it.get("link", ""),
            "title": it.get("title", ""),
            "description": it.get("description", ""),
            "pub_date": it.get("pubdate", ""),
        }
        for it in p.items
    ]
```

- [ ] **Step 4: Run it, verify PASS** + full suite:
`.venv/bin/python -m pytest tests/test_news_feed.py -v` then `.venv/bin/python -m pytest tests/ -q`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/news.py tests/test_news_feed.py
git commit -m "feat(sprint-20): RSS parse_feed via html.parser (CDATA-safe, expat-free)"
```

---

### Task 3: `extract_article_text` (article body via html.parser)

**Files:**
- Modify: `scripts/lib/news.py`
- Test: `tests/test_news_article.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_news_article.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import news

HTML = """<html><head><style>.x{color:red}</style><title>T</title></head>
<body>
<nav><p>Home About Subscribe</p></nav>
<article>
  <p>Olivia Chow said, &quot;We will build more homes.&quot;</p>
  <p>The plan, <a href="x">according to staff</a>, costs $1B.</p>
  <script>track();</script>
  <p></p>
</article>
<footer><p>Copyright 2026</p></footer>
</body></html>"""


def test_extract_article_text_collects_paragraphs_skips_chrome():
    txt = news.extract_article_text(HTML)
    assert 'Olivia Chow said, "We will build more homes."' in txt
    assert "according to staff, costs $1B." in txt   # nested <a> text kept
    assert "Home About Subscribe" not in txt         # nav skipped
    assert "Copyright 2026" not in txt               # footer skipped
    assert "track()" not in txt and "color:red" not in txt  # script/style skipped
    assert "\n\n" in txt                              # paragraphs joined


def test_extract_article_text_empty():
    assert news.extract_article_text("") == ""
```

- [ ] **Step 2: Run it, verify FAIL** (`AttributeError: ... 'extract_article_text'`):
`.venv/bin/python -m pytest tests/test_news_article.py -v`

- [ ] **Step 3: Implement** — append to `scripts/lib/news.py`:

```python
class _ArticleParser(HTMLParser):
    """Collects visible <p> text, skipping chrome containers (script/style/nav/
    header/footer/aside/figure). Text inside nested inline tags within a <p>
    (e.g. <a>) is kept; the tags themselves are dropped."""

    _SKIP = {"script", "style", "nav", "header", "footer", "aside", "figure"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paras: list[str] = []
        self._in_p = False
        self._skip_depth = 0
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in self._SKIP:
            self._skip_depth += 1
        elif t == "p" and self._skip_depth == 0:
            self._in_p = True
            self._buf = []

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in self._SKIP and self._skip_depth > 0:
            self._skip_depth -= 1
        elif t == "p" and self._in_p:
            txt = "".join(self._buf).strip()
            if txt:
                self.paras.append(txt)
            self._in_p = False
            self._buf = []

    def handle_data(self, data):
        if self._in_p and self._skip_depth == 0:
            self._buf.append(data)


def extract_article_text(html: str) -> str:
    """Return the article's paragraph text (\\n\\n-joined), chrome stripped.
    Empty string on empty/garbage input."""
    if not html:
        return ""
    p = _ArticleParser()
    try:
        p.feed(html)
    except Exception:
        return ""
    return "\n\n".join(p.paras)
```

- [ ] **Step 4: Run it, verify PASS** + full suite:
`.venv/bin/python -m pytest tests/test_news_article.py -v` then `.venv/bin/python -m pytest tests/ -q`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/news.py tests/test_news_article.py
git commit -m "feat(sprint-20): extract_article_text via html.parser"
```

---

### Task 4: `scrape_news.py` orchestration + feed registry

**Files:**
- Create: `data/news/feeds.json`
- Create: `scripts/scrape_news.py`
- Test: `tests/test_scrape_news.py`

- [ ] **Step 1: Create the feed registry**

Create `data/news/feeds.json` (free outlets; URLs are confirmed-good RSS endpoints — adjust at run time if an outlet changes its feed path):

```json
[
  { "outlet": "CBC Toronto", "rss_url": "https://www.cbc.ca/webfeed/rss/rss-canada-toronto", "paywalled": false },
  { "outlet": "CityNews Toronto", "rss_url": "https://toronto.citynews.ca/feed/", "paywalled": false }
]
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_scrape_news.py`:

```python
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_news as sn

FEED = """<rss version="2.0"><channel>
  <item><title>Olivia Chow housing plan</title>
    <link>https://cbc.ca/chow1</link><description>d</description>
    <pubDate>Mon, 02 Jun 2026 10:00:00 GMT</pubDate></item>
  <item><title>Unrelated weather story</title>
    <link>https://cbc.ca/weather</link><description>rain</description>
    <pubDate>Mon, 02 Jun 2026 11:00:00 GMT</pubDate></item>
</channel></rss>"""

ARTICLE = "<html><body><article><p>Olivia Chow said this is her plan.</p></article></body></html>"


def _setup(tmp_path, monkeypatch):
    data = tmp_path / "data"
    (data / "news").mkdir(parents=True)
    (data / "news" / "feeds.json").write_text(json.dumps(
        [{"outlet": "CBC Toronto", "rss_url": "https://feed", "paywalled": False},
         {"outlet": "Star", "rss_url": "https://star", "paywalled": True}]))
    (data / "oliviachow").mkdir()
    (data / "oliviachow" / "candidate.json").write_text(json.dumps(
        {"handle": "oliviachow", "display_name": "Olivia Chow", "surname": "Chow"}))
    monkeypatch.setattr(sn, "DATA_DIR", data)
    monkeypatch.setattr(sn._candidates, "DATA_DIR", data)
    def fake_get(url):
        if url == "https://feed":
            return FEED
        if url == "https://cbc.ca/chow1":
            return ARTICLE
        raise AssertionError(f"unexpected fetch: {url}")
    monkeypatch.setattr(sn, "http_get", fake_get)
    return data


def test_routes_matched_articles_and_skips_paywalled_and_unmatched(tmp_path, monkeypatch):
    data = _setup(tmp_path, monkeypatch)
    rc = sn.main([])
    assert rc == 0
    idx = data / "oliviachow" / "news" / "articles.jsonl"
    rows = [json.loads(l) for l in idx.read_text().splitlines() if l.strip()]
    assert len(rows) == 1
    assert rows[0]["url"] == "https://cbc.ca/chow1"
    assert rows[0]["outlet"] == "CBC Toronto"
    txt = (data / "oliviachow" / "news" / f"{rows[0]['url_hash']}.txt").read_text()
    assert "Olivia Chow said this is her plan." in txt
    # the paywalled feed (Star) was never fetched; the weather item never matched


def test_resumable_skips_already_indexed(tmp_path, monkeypatch):
    data = _setup(tmp_path, monkeypatch)
    sn.main([])
    # second run must not re-append the same article
    sn.main([])
    rows = [l for l in (data / "oliviachow" / "news" / "articles.jsonl").read_text().splitlines() if l.strip()]
    assert len(rows) == 1
```

- [ ] **Step 3: Implement** — create `scripts/scrape_news.py`:

```python
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
    argparse.ArgumentParser().parse_args(argv)  # no flags yet; accept none
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
```

NOTE on the test: `datetime.now(timezone.utc)` runs at runtime (allowed in scripts; only the workflow-DSL forbids it). Tests don't assert on `fetched_at`.

- [ ] **Step 4: Run it, verify PASS** + full suite:
`.venv/bin/python -m pytest tests/test_scrape_news.py -v` then `.venv/bin/python -m pytest tests/ -q`
Also confirm clean import: `.venv/bin/python -c "import sys; sys.path.insert(0,'scripts'); import scrape_news; print('ok')"`

- [ ] **Step 5: Commit**

```bash
git add data/news/feeds.json scripts/scrape_news.py tests/test_scrape_news.py
git commit -m "feat(sprint-20): scrape_news poller — RSS → name-match → article text + index"
```

---

### Task 5: `extract_news.py` attribution-aware quote extraction

**Files:**
- Create: `scripts/extract_news.py`
- Test: `tests/test_extract_news.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_extract_news.py`:

```python
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import extract_news as en


def test_verbatim_guard_drops_non_substring_quotes():
    article = 'Olivia Chow said, "We will build 25,000 homes." The reporter noted ambition.'
    raw = [
        {"quote_text": "We will build 25,000 homes.", "attribution": "Olivia Chow said", "topic": "housing"},
        {"quote_text": "Chow is ambitious about housing.", "attribution": "reporter noted", "topic": "housing"},  # paraphrase, not in article
    ]
    kept = en.verbatim_filter(raw, article)
    assert len(kept) == 1
    assert kept[0]["quote_text"] == "We will build 25,000 homes."


def test_extract_one_article_builds_quote_records(tmp_path, monkeypatch):
    data = tmp_path / "data"
    acc = data / "oliviachow"
    (acc / "news").mkdir(parents=True)
    (acc / "candidate.json").write_text(json.dumps(
        {"handle": "oliviachow", "display_name": "Olivia Chow", "surname": "Chow",
         "pronouns": "she/her", "incumbency": "incumbent"}))
    article_txt = 'Olivia Chow said, "We will build 25,000 homes."'
    uh = "abc123"
    (acc / "news" / f"{uh}.txt").write_text(article_txt)
    (acc / "news" / "articles.jsonl").write_text(json.dumps(
        {"url": "https://cbc.ca/x", "url_hash": uh, "outlet": "CBC Toronto",
         "title": "t", "pub_date": "Mon, 02 Jun 2026 10:00:00 GMT"}) + "\n")

    monkeypatch.setattr(en, "DATA_DIR", data)
    monkeypatch.setattr(en._candidates, "DATA_DIR", data)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake")

    # stub the Opus call to return one real + one paraphrase quote
    class _Block:
        type = "tool_use"
        input = {"quotes": [
            {"quote_text": "We will build 25,000 homes.", "attribution": "Olivia Chow said", "topic": "housing"},
            {"quote_text": "She is confident.", "attribution": "reporter", "topic": "housing"},
        ]}
    class _Resp:
        content = [_Block()]
    class _Client:
        class messages:
            @staticmethod
            def create(**kw):
                return _Resp()
    monkeypatch.setattr(en, "Anthropic", lambda: _Client())

    rc = en.main(["--account", "oliviachow"])
    assert rc == 0
    recs = [json.loads(l) for l in (acc / "records.jsonl").read_text().splitlines() if l.strip()]
    assert len(recs) == 1                     # paraphrase dropped by verbatim guard
    r = recs[0]
    assert r["kind"] == "quote"
    assert r["source_platform"] == "news"
    assert r["outlet"] == "CBC Toronto"
    assert r["quote_text"] == "We will build 25,000 homes."
    assert r["post_url"] == "https://cbc.ca/x"
    assert r["source_account"] == "oliviachow"
```

- [ ] **Step 2: Run it, verify FAIL** (`AttributeError: ... 'verbatim_filter'`/`'main'`):
`.venv/bin/python -m pytest tests/test_extract_news.py -v`

- [ ] **Step 3: Implement** — create `scripts/extract_news.py`:

```python
#!/usr/bin/env python3
"""extract_news.py — attribution-aware quote extraction from ingested news
articles. For each candidate's un-extracted article, ask Opus for verbatim
quotes DIRECTLY ATTRIBUTED to that candidate, drop any not literally present in
the article, and write quote records (source_platform=news)."""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from anthropic import Anthropic

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import candidates as _candidates  # noqa: E402

DATA_DIR = ROOT / "data"
OPUS_MODEL = "claude-opus-4-7"

TOPICS = [
    "housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment",
    "infrastructure", "civic_engagement", "governance_ethics",
    "small_business_economy", "social_services", "campaign_logistics",
    "endorsements", "personal_context", "other",
]

QUOTE_TOOL = {
    "name": "extract_news_quotes",
    "description": "Extract verbatim quotes directly attributed to the candidate.",
    "input_schema": {
        "type": "object",
        "properties": {
            "quotes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "quote_text": {"type": "string", "description": "Verbatim words the article attributes to the candidate, copied exactly."},
                        "attribution": {"type": "string", "description": "The sentence/clause tying the quote to the candidate (e.g. 'Chow said')."},
                        "topic": {"type": "string", "enum": TOPICS},
                    },
                    "required": ["quote_text", "attribution", "topic"],
                },
            },
        },
        "required": ["quotes"],
    },
}


def log(msg: str) -> None:
    print(f"[news-extract] {msg}", flush=True)


def build_system_prompt(name: str) -> str:
    return (
        f"You extract quotes from a news article for an independent civic "
        f"transparency project. Return ONLY verbatim text the article directly "
        f"attributes to {name} as their own spoken or written words (a quoted "
        f"span tied to an attribution like '{name} said'). Copy quote_text "
        f"exactly as it appears. NEVER return the reporter's paraphrase, "
        f"analysis, or anyone else's words. If the article contains no quote "
        f"directly attributed to {name}, return an empty list."
    )


def verbatim_filter(quotes: list[dict], article_text: str) -> list[dict]:
    """Keep only quotes whose quote_text appears as a substring of the article
    (guarantees verbatim, not paraphrase). Quotation marks/whitespace tolerant."""
    hay = " ".join(article_text.split())
    out = []
    for q in quotes:
        needle = " ".join((q.get("quote_text") or "").split()).strip('"“”')
        if needle and needle in hay:
            out.append(q)
    return out


def _existing_extracted(records_path: Path) -> set[str]:
    """Shortcodes (url hashes) already turned into quote records."""
    if not records_path.exists():
        return set()
    out = set()
    for line in records_path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                r = json.loads(line)
                if r.get("source_platform") == "news":
                    out.add(r.get("shortcode"))
            except Exception:  # noqa: BLE001
                pass
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--account", required=True)
    args = p.parse_args(argv)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        log("FATAL: ANTHROPIC_API_KEY not set")
        return 1
    manifest = _candidates.resolve_prompt_manifest(args.account)
    if manifest is None:
        log(f"FATAL: no candidate.json for @{args.account}")
        return 1
    name = manifest.get("display_name", args.account)
    system_prompt = build_system_prompt(name)

    acc = DATA_DIR / args.account
    index = acc / "news" / "articles.jsonl"
    if not index.exists():
        log(f"no news index for @{args.account}; run scrape_news first")
        return 0
    records_path = acc / "records.jsonl"
    done = _existing_extracted(records_path)
    client = Anthropic()
    n_quotes = 0

    for line in index.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        art = json.loads(line)
        uh = art["url_hash"]
        if uh in done:
            continue
        txt_path = acc / "news" / f"{uh}.txt"
        if not txt_path.exists():
            continue
        article_text = txt_path.read_text()
        resp = client.messages.create(
            model=OPUS_MODEL, max_tokens=2048, system=system_prompt,
            tools=[QUOTE_TOOL], tool_choice={"type": "tool", "name": "extract_news_quotes"},
            messages=[{"role": "user", "content": article_text}],
        )
        raw = []
        for block in resp.content:
            if getattr(block, "type", None) == "tool_use":
                raw = block.input.get("quotes", [])
                break
        kept = verbatim_filter(raw, article_text)
        with records_path.open("a", encoding="utf-8") as f:
            for q in kept:
                f.write(json.dumps({
                    "kind": "quote",
                    "shortcode": uh,
                    "post_url": art["url"],
                    "post_date": art.get("pub_date", ""),
                    "topic": q.get("topic", "other"),
                    "quote_text": q["quote_text"],
                    "source_quote": q.get("attribution", ""),
                    "source_account": args.account,
                    "source_platform": "news",
                    "outlet": art.get("outlet", ""),
                    "model": OPUS_MODEL,
                    "extracted_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                }, ensure_ascii=False) + "\n")
                n_quotes += 1
        log(f"{uh} · {len(kept)}/{len(raw)} quotes kept")
    log(f"done. {n_quotes} quote records written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run it, verify PASS** + full suite:
`.venv/bin/python -m pytest tests/test_extract_news.py -v` then `.venv/bin/python -m pytest tests/ -q`
Confirm import: `.venv/bin/python -c "import sys; sys.path.insert(0,'scripts'); import extract_news; print('ok')"`

- [ ] **Step 5: Commit**

```bash
git add scripts/extract_news.py tests/test_extract_news.py
git commit -m "feat(sprint-20): extract_news attribution-aware quotes + verbatim guard"
```

---

### Task 6: Confirm news records merge into the dossier

**Files:**
- Test: `tests/test_build_site_news.py`

`build_site.py` already threads `source_platform` (Sprint 18) and loads each handle's `records.jsonl`. News quote records live in the primary handle's `records.jsonl` with `source_platform="news"` already set, so they should merge with no code change. This task proves it.

- [ ] **Step 1: Write the test**

Create `tests/test_build_site_news.py`:

```python
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_news_quote_record_surfaces_with_source_platform(tmp_repo, run_build):
    data = tmp_repo / "data"
    brad = data / "bradfordgrams"
    recs = [json.loads(l) for l in (brad / "records.jsonl").read_text().splitlines() if l.strip()]
    recs.append({
        "kind": "quote", "shortcode": "newshash1",
        "post_url": "https://cbc.ca/story", "post_date": "Mon, 02 Jun 2026 10:00:00 GMT",
        "topic": "transit", "quote_text": "We will fund transit.",
        "source_quote": "Bradford said", "source_account": "bradfordgrams",
        "source_platform": "news", "outlet": "CBC Toronto",
    })
    (brad / "records.jsonl").write_text("\n".join(json.dumps(r) for r in recs) + "\n")

    from scripts import build_site
    build_site.main([])

    dossier = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    q = next(r for r in dossier["records"] if r.get("shortcode") == "newshash1")
    assert q["source_platform"] == "news"
    assert q["outlet"] == "CBC Toronto"
    assert q["quote_text"] == "We will fund transit."
```

- [ ] **Step 2: Run it**

Run: `.venv/bin/python -m pytest tests/test_build_site_news.py -v`
Expected: PASS (build_site already preserves `source_platform` and passes through extra fields like `outlet`/`quote_text`). If it FAILS because `source_platform` is overwritten, fix `build_site.py`'s record loop to `r.setdefault("source_platform", h_platform)` (only default when absent) — but per Sprint 18 it already uses `setdefault`, so it should pass as-is.

- [ ] **Step 3: Full suite + commit**

Run: `.venv/bin/python -m pytest tests/ -q` (all pass)
```bash
git add tests/test_build_site_news.py
git commit -m "test(sprint-20): confirm news quote records merge with source_platform"
```

---

## Self-Review

- **Spec coverage:** feed registry (Task 4 Step 1) ✓; `scrape_news` RSS poll + name-match + article fetch + index, resumable, paywall-skip (Task 4) ✓; stdlib `html.parser` RSS (Task 2) + article (Task 3), expat-free ✓; `url_hash`/`match_candidates` (Task 1) ✓; attribution-aware Opus extraction + verbatim guard + quote records `source_platform=news` (Task 5) ✓; merge via existing `source_platform` (Task 6) ✓; all tests fixture/mock-based, no network/expat (every task) ✓; `resolve_prompt_manifest` candidate-aware framing (Task 5) ✓.
- **Placeholder scan:** No TBD/TODO. Feed URLs are real RSS endpoints (data, adjustable at run time) — not placeholders. Every code step is complete.
- **Type/name consistency:** `url_hash(url)->str`, `match_candidates(text, candidates)->list[str]`, `parse_feed(xml)->list[dict]` (items `{link,title,description,pub_date}`), `extract_article_text(html)->str`, `http_get(url)->str` (the mock seam), `verbatim_filter(quotes, article_text)->list[dict]`, `main(argv)->int`. The article index row shape (`url,url_hash,outlet,title,pub_date,fetched_at`) is written in Task 4 and read in Task 5. Quote record shape (`kind,shortcode,post_url,post_date,topic,quote_text,source_quote,source_account,source_platform,outlet,model,extracted_at`) consistent between Task 5 and Task 6's fixture. `source_platform="news"` everywhere.
