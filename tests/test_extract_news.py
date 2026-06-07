import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import extract_news as en


def test_verbatim_guard_drops_non_substring_quotes():
    article = 'Olivia Chow said, "We will build 25,000 homes." The reporter noted ambition.'
    raw = [
        {"quote_text": "We will build 25,000 homes.", "attribution": "Olivia Chow said", "topic": "housing"},
        {"quote_text": "Chow is ambitious about housing.", "attribution": "reporter noted", "topic": "housing"},
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
    assert len(recs) == 1
    r = recs[0]
    assert r["kind"] == "quote"
    assert r["source_platform"] == "news"
    assert r["outlet"] == "CBC Toronto"
    assert r["quote_text"] == "We will build 25,000 homes."
    assert r["post_url"] == "https://cbc.ca/x"
    assert r["source_account"] == "oliviachow"
