import json
from pathlib import Path

FEEDS = Path(__file__).resolve().parent.parent / "data" / "news" / "feeds.json"


def _load():
    return json.loads(FEEDS.read_text())


def test_every_entry_has_outlet_and_valid_shape():
    for f in _load():
        assert isinstance(f.get("outlet"), str) and f["outlet"], f
        assert isinstance(f.get("paywalled"), bool), f
        # Either a real feed URL, or explicitly skipped (no-RSS placeholder).
        assert f.get("skip") is True or (isinstance(f.get("rss_url"), str) and f["rss_url"]), f
        if "user_agent" in f:
            assert isinstance(f["user_agent"], str) and f["user_agent"], f


def test_expected_free_feeds_present_and_active():
    by_outlet = {f["outlet"]: f for f in _load()}
    for outlet in ["CityNews Toronto", "Global News Toronto", "NOW Toronto",
                   "TorontoToday", "blogTO", "CBC Toronto"]:
        assert outlet in by_outlet, f"missing feed: {outlet}"
        f = by_outlet[outlet]
        assert not f.get("skip"), f"{outlet} should be active"
        assert f["paywalled"] is False, f"{outlet} should be free"


def test_cbc_has_browser_user_agent_override():
    cbc = {f["outlet"]: f for f in _load()}["CBC Toronto"]
    assert "user_agent" in cbc and "Mozilla" in cbc["user_agent"]


def test_no_rss_outlets_are_marked_skip():
    by_outlet = {f["outlet"]: f for f in _load()}
    for outlet in ["CP24", "CTV News Toronto", "Toronto.com"]:
        assert outlet in by_outlet, f"missing deferred placeholder: {outlet}"
        assert by_outlet[outlet].get("skip") is True
