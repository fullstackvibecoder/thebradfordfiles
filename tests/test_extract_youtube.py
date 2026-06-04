from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import extract


def test_youtube_post_uses_cached_transcript_not_instagrapi(tmp_path, monkeypatch):
    monkeypatch.setattr(extract, "TRANSCRIPTS_DIR", tmp_path)
    (tmp_path / "2026-05-01_v1.txt").write_text("cached yt transcript")

    def _boom(*a, **k):
        raise AssertionError("instagrapi must not be used for a YouTube post")
    monkeypatch.setattr(extract, "get_client", _boom)
    monkeypatch.setattr(extract, "download_audio", _boom)

    post = {"shortcode": "v1", "date": "2026-05-01T10:00:00+00:00", "is_video": True,
            "source_platform": "youtube", "url": "u", "caption": "c"}
    transcript = extract.resolve_transcript_for_post(post, cl_holder={"cl": None},
                                                     no_transcribe=False)
    assert transcript == "cached yt transcript"


def test_missing_cache_for_youtube_returns_none_with_warning(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(extract, "TRANSCRIPTS_DIR", tmp_path)
    post = {"shortcode": "v9", "date": "2026-05-01T10:00:00+00:00", "is_video": True,
            "source_platform": "youtube", "url": "u", "caption": "c"}
    t = extract.resolve_transcript_for_post(post, cl_holder={"cl": None}, no_transcribe=False)
    assert t is None
    assert "no cached transcript" in capsys.readouterr().out.lower()
