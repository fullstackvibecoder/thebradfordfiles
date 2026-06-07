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
from lib import news as _news  # noqa: E402

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


_QUOTE_MAP = {ord("’"): "'", ord("‘"): "'", ord("“"): '"', ord("”"): '"'}


def _normalize(s: str) -> str:
    """Collapse whitespace and fold curly quotes/apostrophes to straight, so the
    verbatim substring check is robust to typographic styling differences."""
    return " ".join(s.translate(_QUOTE_MAP).split())


def verbatim_filter(quotes: list[dict], article_text: str) -> list[dict]:
    """Keep only quotes whose quote_text appears as a substring of the article
    (guarantees verbatim, not paraphrase). Whitespace- and quote-style-tolerant."""
    hay = _normalize(article_text)
    out = []
    for q in quotes:
        needle = _normalize(q.get("quote_text") or "").strip('"\'')
        if needle and needle in hay:
            out.append(q)
    return out


def _existing_extracted(records_path: Path) -> set[str]:
    """url hashes already turned into news quote records."""
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
                    "post_date": _news.parse_pub_date(art.get("pub_date", "")),
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
