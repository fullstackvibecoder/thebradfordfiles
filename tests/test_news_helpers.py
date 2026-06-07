import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import news


def test_url_hash_stable_and_safe():
    h1 = news.url_hash("https://cbc.ca/a")
    h2 = news.url_hash(" https://cbc.ca/a ")
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
    assert sorted(news.match_candidates("Chow and Brad Bradford debated", cands)) == ["bradfordgrams"]
    assert sorted(news.match_candidates("Olivia Chow vs Brad Bradford", cands)) == ["bradfordgrams", "oliviachow"]
    assert news.match_candidates("A story about transit funding", cands) == []
    assert news.match_candidates("", cands) == []
