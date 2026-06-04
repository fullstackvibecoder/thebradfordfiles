"""Tests for candidate-aware prompt framing."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib import candidates


def _m(**over):
    base = dict(
        display_name="Test Person", ig_handle="testperson",
        current_role="City Councillor", pronouns="she/her",
        incumbency="challenger_outsider",
    )
    base.update(over)
    return base


def test_incumbent_mentions_council_actions():
    p = candidates.prompt_persona(_m(display_name="Olivia Chow", pronouns="she/her",
                                     current_role="Mayor of Toronto", incumbency="incumbent"))
    assert "Olivia Chow" in p
    assert "incumbent" in p.lower()
    assert "she" in p.lower() and "her" in p.lower()
    assert "Action" in p


def test_challenger_officeholder_has_voting_record_framing():
    p = candidates.prompt_persona(_m(display_name="Brad Bradford", pronouns="he/him",
                                     current_role="City Councillor",
                                     incumbency="challenger_officeholder"))
    assert "Brad Bradford" in p
    assert " he " in f" {p.lower()} " or "his" in p.lower()
    assert "Action" in p


def test_challenger_outsider_states_no_voting_record():
    p = candidates.prompt_persona(_m(display_name="Sarah McVie", pronouns="she/her",
                                     current_role="actress and community advocate",
                                     incumbency="challenger_outsider"))
    assert "Sarah McVie" in p
    assert "no legislative voting record" in p.lower()


def test_non_bradford_manifest_never_leaks_bradford():
    p = candidates.prompt_persona(_m(display_name="Sarah McVie", ig_handle="sarahmcvie"))
    assert "Bradford" not in p
    assert "bradfordgrams" not in p


def test_missing_pronouns_defaults_to_they_them():
    m = _m()
    del m["pronouns"]
    p = candidates.prompt_persona(m)
    assert "they" in p.lower() or "their" in p.lower()


def test_unknown_incumbency_falls_back_to_outsider():
    p = candidates.prompt_persona(_m(incumbency="banana"))
    assert "no legislative voting record" in p.lower()


def test_known_incumbency_values_constant():
    assert candidates.INCUMBENCY_VALUES == {
        "incumbent", "challenger_officeholder", "challenger_outsider"
    }


def test_missing_current_role_keeps_grammatical_lead():
    m = _m()
    del m["current_role"]
    p = candidates.prompt_persona(m)
    # No role, but the comma before "a candidate" must remain
    assert ", a candidate for Mayor" in p
    # And no doubled spaces from a bare-space fallback
    assert "  " not in p
