import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_news as sn


def _rec(outlet, status="ok", items_seen=5):
    return {"outlet": outlet, "status": status, "http_code": 200,
            "items_seen": items_seen, "items_matched": 0,
            "articles_written": 0, "error": None}


def test_detect_degraded_flags_ok_to_error():
    prior = [_rec("CBC Toronto", "ok", 30)]
    current = [_rec("CBC Toronto", "error", 0)]
    assert sn.detect_degraded(prior, current) == ["CBC Toronto"]


def test_detect_degraded_flags_items_dropping_to_zero():
    prior = [_rec("NOW Toronto", "ok", 12)]
    current = [_rec("NOW Toronto", "ok", 0)]
    assert sn.detect_degraded(prior, current) == ["NOW Toronto"]


def test_detect_degraded_ignores_new_feed_with_no_prior():
    assert sn.detect_degraded([], [_rec("blogTO", "error", 0)]) == []


def test_detect_degraded_quiet_day_not_degraded_if_prior_also_zero():
    prior = [_rec("blogTO", "ok", 0)]
    current = [_rec("blogTO", "ok", 0)]
    assert sn.detect_degraded(prior, current) == []


def test_all_failed_true_only_when_every_feed_errored():
    assert sn.all_failed([_rec("A", "error"), _rec("B", "error")]) is True
    assert sn.all_failed([_rec("A", "error"), _rec("B", "ok")]) is False
    assert sn.all_failed([]) is False
