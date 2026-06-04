import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_youtube as yt


def _seed_source(data_dir, handle="oliviachow-yt", channel="UC123"):
    d = data_dir / handle
    d.mkdir(parents=True)
    (d / "candidate.json").write_text(json.dumps({
        "handle": handle, "alias_of": "oliviachow",
        "source_platform": "youtube", "youtube_channel_id": channel,
    }))
    return d


def test_main_writes_normalized_posts_and_transcripts(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    src = _seed_source(data_dir)
    transcripts = tmp_path / "transcripts"
    transcripts.mkdir()
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    monkeypatch.setattr(yt, "TRANSCRIPTS_DIR", transcripts)
    monkeypatch.setenv("YOUTUBE_API_KEY", "fake")

    videos = [
        {"id": "v1", "title": "Speech 1", "description": "on housing",
         "published_at": "2026-05-01T10:00:00Z", "duration_seconds": 100.0,
         "like_count": 5, "comment_count": 1},
        {"id": "v2", "title": "Speech 2", "description": "on transit",
         "published_at": "2026-04-01T10:00:00Z", "duration_seconds": 200.0,
         "like_count": 9, "comment_count": 2},
    ]
    monkeypatch.setattr(yt, "list_channel_videos", lambda cid, key, limit=None: list(videos))
    def fake_fetch(vid, date):
        out = transcripts / f"{date[:10]}_{vid}.txt"
        out.write_text(f"transcript for {vid}")
        return f"transcript for {vid}"
    monkeypatch.setattr(yt, "fetch_transcript", fake_fetch)

    rc = yt.main(["--account", "oliviachow-yt"])
    assert rc == 0

    posts = [json.loads(l) for l in (src / "posts.jsonl").read_text().splitlines() if l.strip()]
    assert {p["shortcode"] for p in posts} == {"v1", "v2"}
    assert all(p["source_platform"] == "youtube" for p in posts)
    assert (transcripts / "2026-05-01_v1.txt").read_text() == "transcript for v1"


def test_main_is_resumable(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    src = _seed_source(data_dir)
    (src / "posts.jsonl").write_text(json.dumps({"shortcode": "v1"}) + "\n")
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    tdir = tmp_path / "t"; tdir.mkdir()
    monkeypatch.setattr(yt, "TRANSCRIPTS_DIR", tdir)
    monkeypatch.setenv("YOUTUBE_API_KEY", "fake")
    seen = []
    monkeypatch.setattr(yt, "list_channel_videos",
                        lambda cid, key, limit=None: [
                            {"id": "v1", "title": "a", "published_at": "2026-05-01T10:00:00Z"},
                            {"id": "v2", "title": "b", "published_at": "2026-04-01T10:00:00Z"}])
    monkeypatch.setattr(yt, "fetch_transcript", lambda vid, date: (seen.append(vid) or "t"))
    yt.main(["--account", "oliviachow-yt"])
    assert seen == ["v2"]  # v1 already present -> skipped, no transcript fetch


def test_main_fatals_without_api_key(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    _seed_source(data_dir)
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    monkeypatch.delenv("YOUTUBE_API_KEY", raising=False)
    assert yt.main(["--account", "oliviachow-yt"]) == 1


def test_main_fatals_on_missing_manifest(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    monkeypatch.setenv("YOUTUBE_API_KEY", "fake")
    assert yt.main(["--account", "ghost-yt"]) == 1


def test_main_fatals_on_missing_channel_id(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    d = data_dir / "nochannel-yt"
    d.mkdir(parents=True)
    (d / "candidate.json").write_text('{"handle": "nochannel-yt", "alias_of": "x", "source_platform": "youtube"}')
    monkeypatch.setattr(yt, "DATA_DIR", data_dir)
    monkeypatch.setenv("YOUTUBE_API_KEY", "fake")
    assert yt.main(["--account", "nochannel-yt"]) == 1


def test_parse_iso8601_duration():
    assert yt._parse_iso8601_duration("PT10M12S") == 612.0
    assert yt._parse_iso8601_duration("PT1H2M3S") == 3723.0
    assert yt._parse_iso8601_duration("PT45S") == 45.0
    assert yt._parse_iso8601_duration("garbage") is None
