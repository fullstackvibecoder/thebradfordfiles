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
    assert "according to staff, costs $1B." in txt
    assert "Home About Subscribe" not in txt
    assert "Copyright 2026" not in txt
    assert "track()" not in txt and "color:red" not in txt
    assert "\n\n" in txt


def test_extract_article_text_empty():
    assert news.extract_article_text("") == ""
