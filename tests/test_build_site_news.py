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
