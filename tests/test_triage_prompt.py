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


def test_build_system_prompt_bradford_substantively_unchanged():
    m = dict(display_name="Brad Bradford", ig_handle="bradfordgrams",
             current_role="City Councillor", pronouns="he/him",
             incumbency="challenger_officeholder")
    prompt = triage.build_system_prompt(m)
    assert "Brad Bradford" in prompt
    assert "substantive" in prompt and "skip" in prompt
