"""Tests for candidate manifest discovery."""
import json
from pathlib import Path

import pytest

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import candidates


def _seed(dirpath: Path, **fields):
    dirpath.mkdir(parents=True, exist_ok=True)
    (dirpath / "candidate.json").write_text(json.dumps(fields))


def test_load_all_candidates_finds_bradford_and_chow(tmp_path, monkeypatch):
    _seed(tmp_path / "bradfordgrams",
          handle="bradfordgrams", slug="bradford",
          display_name="Brad Bradford", surname="Bradford",
          files_label="The Bradford Files", candidacy_status="declared")
    _seed(tmp_path / "oliviachow",
          handle="oliviachow", slug="chow",
          display_name="Olivia Chow", surname="Chow",
          files_label="The Chow Files", candidacy_status="expected")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    handles = sorted(c["handle"] for c in candidates.load_all_candidates())
    assert handles == ["bradfordgrams", "oliviachow"]


def test_load_all_candidates_excludes_aliases(tmp_path, monkeypatch):
    _seed(tmp_path / "beybradford",
          handle="beybradford", alias_of="bradfordgrams",
          display_name="Brad Bradford (alias)")
    _seed(tmp_path / "bradfordgrams",
          handle="bradfordgrams", slug="bradford",
          display_name="Brad Bradford", surname="Bradford",
          files_label="The Bradford Files", candidacy_status="declared")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    handles = [c["handle"] for c in candidates.load_all_candidates()]
    assert handles == ["bradfordgrams"]


def test_load_all_candidates_sorts_alphabetically_by_surname(tmp_path, monkeypatch):
    for handle, surname in [("oliviachow", "Chow"), ("bradfordgrams", "Bradford"), ("brown", "Brown")]:
        _seed(tmp_path / handle,
              handle=handle, slug=surname.lower(),
              display_name=f"X {surname}", surname=surname,
              files_label=f"The {surname} Files", candidacy_status="declared")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_path)
    surnames = [c["surname"] for c in candidates.load_all_candidates()]
    assert surnames == ["Bradford", "Brown", "Chow"]
