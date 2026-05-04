"""Tests for build_site.py synthesis integration."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _seed_synthesis(handle_dir: Path, topic_name: str, **fields):
    sd = handle_dir / "synthesis"
    sd.mkdir(parents=True, exist_ok=True)
    (sd / f"{topic_name}.json").write_text(json.dumps(fields))


def test_dossier_exposes_synthesis_under_meta(tmp_repo, run_build):
    """When a synthesis cell exists, build_site folds it into meta.synthesis."""
    # Add a synthesis cell to bradfordgrams (the existing tmp_repo seed only has
    # records, not synthesis output yet).
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    candidate_handle="bradfordgrams", candidate_slug="bradford",
                    topic="transit",
                    summary="Bradford supports TTC expansion.",
                    consistency={"label": "consistent", "stable_since": "2024-01", "changes": []},
                    key_positions=[{"stance": "TTC funding", "supporting_records": ["X"]}],
                    key_actions=[],
                    input_record_count=7,
                    synthesis_skipped_reason=None)
    # Re-run build (run_build fixture has already run once; do it again with fresh state)
    from scripts import build_site
    build_site.main([])
    bradford = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    assert "synthesis" in bradford["meta"]
    assert "transit" in bradford["meta"]["synthesis"]
    assert bradford["meta"]["synthesis"]["transit"]["summary"] == "Bradford supports TTC expansion."


def test_landing_card_has_consistency_dot_color(tmp_repo, run_build):
    """The landing card includes a consistency_dot computed from per-topic labels."""
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    consistency={"label": "consistent", "stable_since": "2024-01", "changes": []},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "housing",
                    consistency={"label": "evolving", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "safety_crime",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    # 3 topics with data, one is "evolving", none "shifted" → "yellow"
    assert bradford_card["consistency_dot"] == "yellow"


def test_landing_card_dot_red_when_any_topic_shifted(tmp_repo, run_build):
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    consistency={"label": "shifted", "stable_since": None,
                                 "changes": [{"from_stance": "x", "to_stance": "y",
                                              "approximate_date": "2024",
                                              "supporting_records": ["A", "B"]}]},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "housing",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "safety_crime",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    assert bradford_card["consistency_dot"] == "red"


def test_landing_card_dot_gray_when_too_few_topics(tmp_repo, run_build):
    """Fewer than 3 topics with data → gray."""
    _seed_synthesis(tmp_repo / "data" / "bradfordgrams", "transit",
                    consistency={"label": "consistent", "stable_since": None, "changes": []},
                    synthesis_skipped_reason=None)
    # Only one topic with synthesis data; rest are absent.
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    assert bradford_card["consistency_dot"] == "gray"


def test_skipped_synthesis_is_excluded_from_dot_calculation(tmp_repo, run_build):
    """Topics with synthesis_skipped_reason='insufficient_data' don't count toward
    the dot threshold."""
    for topic in ("transit", "housing", "safety_crime"):
        _seed_synthesis(tmp_repo / "data" / "bradfordgrams", topic,
                        consistency=None, synthesis_skipped_reason="insufficient_data")
    from scripts import build_site
    build_site.main([])
    landing = json.loads((tmp_repo / "site" / "landing.json").read_text())
    bradford_card = next(c for c in landing["candidates"] if c["surname"] == "Bradford")
    assert bradford_card["consistency_dot"] == "gray"
