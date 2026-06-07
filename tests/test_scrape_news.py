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


def test_resumable_skips_already_indexed(tmp_path, monkeypatch):
    data = _setup(tmp_path, monkeypatch)
    sn.main([])
    sn.main([])
    rows = [l for l in (data / "oliviachow" / "news" / "articles.jsonl").read_text().splitlines() if l.strip()]
    assert len(rows) == 1
