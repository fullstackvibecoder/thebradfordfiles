from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import triage


def test_build_system_prompt_uses_candidate_name():
    m = dict(display_name="Sarah McVie", ig_handle="sarahmcvie",
             current_role="actress and community advocate",
             pronouns="she/her", incumbency="challenger_outsider")
    prompt = triage.build_system_prompt(m)
    assert "Sarah McVie" in prompt
    assert "Bradford" not in prompt
    assert "substantive" in prompt and "contextual" in prompt and "skip" in prompt
    assert "campaign_logistics" in prompt


def test_triage_one_tolerates_missing_engagement_fields():
    # Stub client returns a tool_use block; we only care that no KeyError is raised
    class _Block:
        type = "tool_use"
        input = {"bucket": "skip", "reason": "r", "topics": [],
                 "is_video": False, "needs_transcript": False}
    class _Resp:
        content = [_Block()]
    class _Client:
        class messages:
            @staticmethod
            def create(**kw):
                return _Resp()
    rec = {"date": "2026-05-01T10:00:00+00:00", "type": "video", "is_video": True,
           "mentions": [], "hashtags": [], "location": None, "caption": "hi",
           "shortcode": "v1"}  # NOTE: no 'likes'/'comments'
    out = triage.triage_one(rec, _Client(), "SYSTEM")
    assert out["bucket"] == "skip"


def test_build_system_prompt_bradford_substantively_unchanged():
    m = dict(display_name="Brad Bradford", ig_handle="bradfordgrams",
             current_role="City Councillor", pronouns="he/him",
             incumbency="challenger_officeholder")
    prompt = triage.build_system_prompt(m)
    assert "Brad Bradford" in prompt
    assert "substantive" in prompt and "skip" in prompt
