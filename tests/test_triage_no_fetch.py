import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import triage


def test_no_fetch_triages_existing_posts_without_ig(tmp_path, monkeypatch):
    data = tmp_path / "data"
    acc = data / "oliviachow-yt"
    acc.mkdir(parents=True)
    (acc / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow-yt", "alias_of": "oliviachow",
        "source_platform": "youtube"}))
    (data / "oliviachow").mkdir()
    (data / "oliviachow" / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow", "display_name": "Olivia Chow", "surname": "Chow",
        "pronouns": "she/her", "incumbency": "incumbent"}))
    (acc / "posts.jsonl").write_text(json.dumps({
        "shortcode": "v1", "url": "u", "date": "2026-05-01T10:00:00+00:00",
        "type": "video", "is_video": True, "caption": "On transit", "caption_length": 10,
        "mentions": [], "hashtags": [], "location": None, "source_platform": "youtube"}) + "\n")

    monkeypatch.setattr(triage, "DATA_DIR", data)
    monkeypatch.setattr(triage._candidates, "DATA_DIR", data)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake")

    def _boom():
        raise AssertionError("get_client must not be called in --no-fetch mode")
    monkeypatch.setattr(triage, "get_client", _boom)
    monkeypatch.setattr(triage, "Anthropic", lambda: object())
    captured = {}
    def fake_triage_one(rec, client, system_prompt):
        captured["prompt"] = system_prompt
        return {"bucket": "substantive", "reason": "r", "topics": ["transit"],
                "is_video": True, "needs_transcript": True}
    monkeypatch.setattr(triage, "triage_one", fake_triage_one)

    rc = triage.main_argv(["--account", "oliviachow-yt", "--no-fetch"])
    assert rc == 0
    rows = [json.loads(l) for l in (acc / "triage.jsonl").read_text().splitlines() if l.strip()]
    assert rows and rows[0]["shortcode"] == "v1"
    assert "Olivia Chow" in captured["prompt"]
    assert "incumbent" in captured["prompt"].lower()
