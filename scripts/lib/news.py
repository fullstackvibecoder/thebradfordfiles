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
    for c in (candidates or []):
        name = (c.get("display_name") or "").strip().lower()
        handle = c.get("handle")
        if name and handle and name in low:
            out.append(handle)
    return out


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
