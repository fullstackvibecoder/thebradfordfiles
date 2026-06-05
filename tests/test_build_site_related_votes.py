import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_position_record_gets_related_votes_list(tmp_repo, run_build, monkeypatch):
    data = tmp_repo / "data"
    brad = data / "bradfordgrams"
    recs = [json.loads(l) for l in (brad / "records.jsonl").read_text().splitlines() if l.strip()]
    recs.append({"kind": "position", "shortcode": "POS1", "post_url": "u",
                 "post_date": "2024-05-01", "topic": "transit", "summary": "bike lanes"})
    (brad / "records.jsonl").write_text("\n".join(json.dumps(r) for r in recs) + "\n")
    votes_dir = data / "votes"
    votes_dir.mkdir(parents=True, exist_ok=True)
    (votes_dir / "matches.jsonl").write_text("\n".join(json.dumps(m) for m in [
        {"record_shortcode": "POS1", "record_kind": "position", "council_vote_id": 1,
         "confidence": 0.5, "match_type": "position_topic", "agenda_item": "2024.X1.1",
         "agenda_item_title": "Bike lane Bloor", "vote_disposition": "Yes",
         "result": "Carried", "vote_date": "2025-02-01 10:00 AM",
         "vote_description": "Expand bike lanes", "candidate_handle": "bradfordgrams",
         "candidate_slug": "bradford"},
        {"record_shortcode": "POS1", "record_kind": "position", "council_vote_id": 2,
         "confidence": 0.4, "match_type": "position_topic", "agenda_item": "2024.X2.1",
         "agenda_item_title": "Bike lane Danforth", "vote_disposition": "No",
         "result": "Lost", "vote_date": "2024-06-01 10:00 AM",
         "vote_description": "Install bike lanes", "candidate_handle": "bradfordgrams",
         "candidate_slug": "bradford"},
    ]) + "\n")

    from scripts import build_site
    build_site.main([])

    dossier = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    pos = next(r for r in dossier["records"] if r.get("shortcode") == "POS1")
    assert "related_votes" in pos
    assert len(pos["related_votes"]) == 2
    assert [v["council_vote_id"] for v in pos["related_votes"]] == [2, 1]  # date-ascending
    forbidden = {"consistent", "inconsistent", "mixed", "score", "alignment", "verdict"}
    assert forbidden.isdisjoint(pos.keys())
