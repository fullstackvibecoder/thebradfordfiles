from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts import extract


def test_build_system_prompt_uses_candidate_name():
    m = dict(display_name="Sarah McVie", ig_handle="sarahmcvie",
             current_role="actress and community advocate",
             pronouns="she/her", incumbency="challenger_outsider")
    prompt = extract.build_system_prompt(m)
    assert "Sarah McVie" in prompt
    assert "Bradford" not in prompt
    assert "positions" in prompt and "pledges" in prompt and "actions" in prompt


def test_contextual_user_prompt_uses_candidate_name():
    m = dict(display_name="Sarah McVie", pronouns="she/her")
    text = extract.contextual_user_prompt({"date": "2026-05-01T00:00:00+00:00",
                                           "caption": "hi"}, m)
    assert "Sarah McVie" in text
    assert "Bradford" not in text
