"""Tests for alias-source prompt framing resolution."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import candidates


def _seed(dirpath, **fields):
    dirpath.mkdir(parents=True, exist_ok=True)
    (dirpath / "candidate.json").write_text(json.dumps(fields))


def test_alias_resolves_to_primary(tmp_path, monkeypatch):
    _seed(tmp_path / "oliviachow", handle="oliviachow", display_name="Olivia Chow",
          surname="Chow", pronouns="she/her", incumbency="incumbent")
    _seed(tmp_path / "oliviachow-yt", handle="oliviachow-yt", alias_of="oliviachow",
          source_platform="youtube", youtube_channel_id="UC123")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    m = candidates.resolve_prompt_manifest("oliviachow-yt")
    assert m["display_name"] == "Olivia Chow"
    assert m["incumbency"] == "incumbent"


def test_primary_resolves_to_self(tmp_path, monkeypatch):
    _seed(tmp_path / "oliviachow", handle="oliviachow", display_name="Olivia Chow",
          surname="Chow", pronouns="she/her", incumbency="incumbent")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    m = candidates.resolve_prompt_manifest("oliviachow")
    assert m["display_name"] == "Olivia Chow"


def test_missing_handle_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    assert candidates.resolve_prompt_manifest("nobody") is None


def test_alias_with_missing_primary_falls_back_to_alias(tmp_path, monkeypatch):
    _seed(tmp_path / "orphan-yt", handle="orphan-yt", alias_of="ghost",
          source_platform="youtube")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    m = candidates.resolve_prompt_manifest("orphan-yt")
    assert m["handle"] == "orphan-yt"
