"""Shared fixtures for build_site tests."""
import json
from pathlib import Path

import pytest


@pytest.fixture
def tmp_repo(tmp_path):
    """Skeleton repo with two candidates and tiny data files, plus a template."""
    data = tmp_path / "data"
    site = tmp_path / "site"
    site.mkdir()
    (site / "candidate-template.html").write_text(
        "<title>__FILES_LABEL__</title>"
        "<div class=\"brand-tagline\" id=\"brand-tagline\">__BRAND_TAGLINE__</div>"
        "<script>fetch(\"__CANDIDATE_DOSSIER__\");</script>"
    )
    b = data / "bradfordgrams"
    b.mkdir(parents=True)
    (b / "candidate.json").write_text(json.dumps({
        "handle": "bradfordgrams", "slug": "bradford",
        "display_name": "Brad Bradford", "surname": "Bradford",
        "files_label": "The Bradford Files", "current_role": "City Councillor",
        "candidacy_status": "declared", "platform_pillars": ["crime", "congestion"],
    }))
    (b / "triage.jsonl").write_text(json.dumps({
        "shortcode": "X", "date": "2026-01-01", "url": "u", "type": "video",
        "is_video": True, "caption_excerpt": "...",
        "triage": {"bucket": "substantive", "reason": "x", "topics": ["transit"]},
    }) + "\n")
    (b / "posts.jsonl").write_text("")
    (b / "records.jsonl").write_text(json.dumps({
        "kind": "position", "shortcode": "X", "post_url": "u", "post_date": "2026-01-01",
        "topic": "transit", "summary": "test", "stance": "supports", "source_quote": "q",
    }) + "\n")
    (b / "extracted.jsonl").write_text("")
    c = data / "oliviachow"
    c.mkdir(parents=True)
    (c / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow", "slug": "chow",
        "display_name": "Olivia Chow", "surname": "Chow",
        "files_label": "The Chow Files", "current_role": "Mayor of Toronto",
        "candidacy_status": "expected", "platform_pillars": ["housing"],
    }))
    for f in ("triage.jsonl", "posts.jsonl", "records.jsonl", "extracted.jsonl"):
        (c / f).write_text("")
    return tmp_path


@pytest.fixture
def run_build(tmp_repo, monkeypatch):
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from scripts import build_site
    from scripts.lib import candidates
    monkeypatch.setattr(build_site, "ROOT", tmp_repo)
    monkeypatch.setattr(build_site, "DATA_DIR", tmp_repo / "data")
    monkeypatch.setattr(build_site, "SITE_DIR", tmp_repo / "site")
    monkeypatch.setattr(build_site, "MATCHES_FILE", tmp_repo / "data" / "votes" / "matches.jsonl")
    monkeypatch.setattr(candidates, "DATA_DIR", tmp_repo / "data")
    build_site.main([])
    return tmp_repo
