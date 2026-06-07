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
    assert "Olivia Chow announced a plan." in a["description"]
    assert a["pub_date"].startswith("Mon, 02 Jun 2026")
    assert items[1]["description"] == "Plain text description"


def test_parse_feed_empty():
    assert news.parse_feed("") == []
    assert isinstance(news.parse_feed("not xml <<<"), list)
