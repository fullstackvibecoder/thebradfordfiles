"""Tests for build_site.py multi-candidate output."""
import json


def test_build_writes_landing_json(tmp_repo, run_build):
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    surnames = [c["surname"] for c in landing["candidates"]]
    assert surnames == ["Bradford", "Chow"]
    assert "generated_at" in landing


def test_build_writes_per_candidate_dossier(tmp_repo, run_build):
    bradford = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    assert bradford["meta"]["handle"] == "bradfordgrams"
    assert bradford["meta"]["files_label"] == "The Bradford Files"
    assert "records" in bradford
    assert "skip_log" in bradford


def test_landing_card_has_minimum_fields(tmp_repo, run_build):
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    for field in ("slug", "display_name", "files_label", "current_role",
                  "candidacy_status", "platform_pillars",
                  "post_count", "record_count"):
        assert field in card, f"missing {field}"


def test_per_candidate_html_emitted_with_correct_dossier_url(tmp_repo, run_build):
    text = (tmp_repo / "site" / "bradford" / "index.html").read_text()
    assert "/candidates/bradford.json" in text
    assert "__CANDIDATE_DOSSIER__" not in text
    assert "The Bradford Files" in text
