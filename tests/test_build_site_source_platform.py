import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_merged_records_carry_source_platform(tmp_repo, run_build, monkeypatch):
    # tmp_repo seeds bradfordgrams + oliviachow (see conftest). Add a YT alias of Chow.
    data = tmp_repo / "data"
    yt = data / "oliviachow-yt"
    yt.mkdir(parents=True)
    (yt / "candidate.json").write_text(json.dumps({
        "handle": "oliviachow-yt", "alias_of": "oliviachow",
        "source_platform": "youtube"}))
    (yt / "posts.jsonl").write_text(json.dumps({
        "shortcode": "v1", "url": "https://www.youtube.com/watch?v=v1",
        "date": "2026-05-01T10:00:00+00:00", "type": "video", "is_video": True,
        "caption": "c", "source_platform": "youtube"}) + "\n")
    (yt / "triage.jsonl").write_text("")
    (yt / "records.jsonl").write_text(json.dumps({
        "kind": "position", "shortcode": "v1",
        "post_url": "https://www.youtube.com/watch?v=v1",
        "post_date": "2026-05-01T10:00:00+00:00", "topic": "transit",
        "summary": "s", "stance": "supports", "source_quote": "q",
        "source_account": "oliviachow-yt", "source_platform": "youtube"}) + "\n")
    (yt / "extracted.jsonl").write_text("")
    # wire the alias into Chow's manifest
    chow = json.loads((data / "oliviachow" / "candidate.json").read_text())
    chow["alias_handles"] = ["oliviachow-yt"]
    (data / "oliviachow" / "candidate.json").write_text(json.dumps(chow))

    # rebuild with the alias present (run_build's monkeypatches are still active)
    from scripts import build_site
    build_site.main([])

    dossier = json.loads((tmp_repo / "site" / "candidates" / "chow.json").read_text())
    yt_recs = [r for r in dossier["records"] if r.get("source_platform") == "youtube"]
    assert len(yt_recs) == 1
    # every record has a source_platform (IG-origin ones default to "instagram")
    assert all(r.get("source_platform") for r in dossier["records"])

    # Bradford's records come from raw JSONL with NO source_platform -> must default to "instagram"
    bradford = json.loads((tmp_repo / "site" / "candidates" / "bradford.json").read_text())
    assert bradford["records"], "expected at least one Bradford record in the fixture"
    assert all(r.get("source_platform") == "instagram" for r in bradford["records"])
