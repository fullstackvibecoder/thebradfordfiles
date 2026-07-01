import sys
from pathlib import Path
import urllib.error
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_news as sn


def test_effective_user_agent_prefers_override():
    assert sn.effective_user_agent({"user_agent": "Mozilla/5.0 X"}) == "Mozilla/5.0 X"


def test_effective_user_agent_defaults_to_bot_ua():
    assert sn.effective_user_agent({}) == sn.USER_AGENT


def test_retry_succeeds_after_transient_failures():
    calls = {"n": 0}
    slept = []
    def thunk():
        calls["n"] += 1
        if calls["n"] < 3:
            raise TimeoutError("boom")
        return "ok"
    out = sn.fetch_with_retry(thunk, retries=3, sleep=slept.append)
    assert out == "ok"
    assert calls["n"] == 3
    assert slept == [1, 2]  # linear backoff before attempts 2 and 3


def test_retry_reraises_after_exhaustion():
    def thunk():
        raise TimeoutError("always")
    with pytest.raises(TimeoutError):
        sn.fetch_with_retry(thunk, retries=3, sleep=lambda _: None)


def test_retry_does_not_retry_4xx_except_429():
    calls = {"n": 0}
    def thunk():
        calls["n"] += 1
        raise urllib.error.HTTPError("u", 404, "nf", {}, None)
    with pytest.raises(urllib.error.HTTPError):
        sn.fetch_with_retry(thunk, retries=3, sleep=lambda _: None)
    assert calls["n"] == 1  # not retried


def test_retry_retries_429():
    calls = {"n": 0}
    def thunk():
        calls["n"] += 1
        if calls["n"] < 2:
            raise urllib.error.HTTPError("u", 429, "slow", {}, None)
        return "ok"
    assert sn.fetch_with_retry(thunk, retries=3, sleep=lambda _: None) == "ok"
    assert calls["n"] == 2
