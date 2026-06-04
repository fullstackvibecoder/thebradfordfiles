from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import scrape_youtube as yt


def test_normalizes_api_video_to_post_record():
    video = {
        "id": "abc123",
        "title": "My plan for transit",
        "description": "Full speech on transit. #transit @torontocity",
        "published_at": "2026-05-01T14:30:00Z",
        "duration_seconds": 612.0,
        "like_count": 42,
        "comment_count": 7,
    }
    rec = yt.youtube_post_to_record(video)
    assert rec["shortcode"] == "abc123"
    assert rec["url"] == "https://www.youtube.com/watch?v=abc123"
    assert rec["date"] == "2026-05-01T14:30:00+00:00"
    assert rec["type"] == "video"
    assert rec["product_type"] == "youtube"
    assert rec["is_video"] is True
    assert rec["video_duration"] == 612.0
    assert rec["caption"].startswith("My plan for transit\n\nFull speech")
    assert rec["caption_length"] == len(rec["caption"])
    assert rec["likes"] == 42 and rec["comments"] == 7
    assert "transit" in rec["hashtags"]
    assert "torontocity" in rec["mentions"]
    assert rec["location"] is None
    assert rec["source_platform"] == "youtube"


def test_handles_missing_optional_fields():
    rec = yt.youtube_post_to_record({"id": "x", "title": "T", "published_at": "2026-01-01T00:00:00Z"})
    assert rec["caption"] == "T"
    assert rec["likes"] == 0 and rec["comments"] == 0
    assert rec["video_duration"] is None
