# Candidate-Aware Triage & Extraction Prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bradford-hardcoded triage/extraction system prompts with per-candidate framing built from each `candidate.json` manifest, so the pipeline is correct for any candidate.

**Architecture:** A new pure helper `prompt_persona(manifest)` in `scripts/lib/candidates.py` builds a candidate-framing paragraph from `display_name`, `ig_handle`, `current_role`, `pronouns`, and `incumbency`. Each script's `SYSTEM_PROMPT` constant becomes `build_system_prompt(manifest)` = persona + a neutralized shared rubric. `main()` loads the manifest once and threads it into the model-call functions.

**Tech Stack:** Python 3, pytest, anthropic SDK, instagrapi. Tests run with `.venv/bin/python -m pytest`.

---

### Task 1: `prompt_persona` helper + pronoun mapping

**Files:**
- Modify: `scripts/lib/candidates.py` (append helper + constants)
- Test: `tests/test_prompt_persona.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_prompt_persona.py`:

```python
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
    assert "Action" in p  # council/legislative actions captured as Actions


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_prompt_persona.py -v`
Expected: FAIL — `AttributeError: module ... has no attribute 'prompt_persona'`

- [ ] **Step 3: Implement the helper**

Append to `scripts/lib/candidates.py`:

```python
INCUMBENCY_VALUES = {"incumbent", "challenger_officeholder", "challenger_outsider"}

_PRONOUN_FORMS = {
    "he/him": ("he", "him", "his"),
    "she/her": ("she", "her", "her"),
    "they/them": ("they", "them", "their"),
}


def _pronoun_forms(pronouns: str | None) -> tuple[str, str, str]:
    """Map a 'she/her'-style string to (subject, object, possessive).
    Falls back to they/them for missing or unrecognized input."""
    return _PRONOUN_FORMS.get((pronouns or "").strip().lower(), ("they", "them", "their"))


def prompt_persona(manifest: dict) -> str:
    """Build the candidate-framing paragraph injected at the top of the triage
    and extraction system prompts. Single source of truth for per-candidate
    framing — derived from the manifest so adding a candidate needs no prompt
    edits. Unknown/missing incumbency falls back to the most conservative
    'outsider' framing (assumes no voting record, so it never implies a council
    record the candidate lacks)."""
    name = manifest.get("display_name", "the candidate")
    handle = manifest.get("ig_handle") or manifest.get("handle", "")
    handle_str = f" (@{handle})" if handle else ""
    role = manifest.get("current_role", "")
    subj, _obj, poss = _pronoun_forms(manifest.get("pronouns"))
    incumbency = manifest.get("incumbency", "challenger_outsider")

    role_clause = f", {role}," if role else " "
    lead = (
        f"This project documents the public political record of {name}{handle_str}"
        f"{role_clause} a candidate for Mayor of Toronto in 2026."
    )

    if incumbency == "incumbent":
        office = (
            f" {name} is the incumbent — {subj} currently holds elected office, "
            f"so {poss} council and legislative votes, motions, and official "
            f"actions should be captured as Action records."
        )
    elif incumbency == "challenger_officeholder":
        office = (
            f" {name} currently holds elected office with a voting record, so "
            f"{poss} council and legislative votes, motions, and official actions "
            f"should be captured as Action records."
        )
    else:  # challenger_outsider, and any unknown value
        office = (
            f" {name} does not currently hold elected office and has no "
            f"legislative voting record; Action records should capture {poss} past "
            f"civic or organizing actions (e.g. community advocacy), not council votes."
        )
    return lead + office
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_prompt_persona.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/candidates.py tests/test_prompt_persona.py
git commit -m "feat(sprint-16): prompt_persona helper for candidate-aware framing"
```

---

### Task 2: Refactor `triage.py` to candidate-aware prompt

**Files:**
- Modify: `scripts/triage.py` (imports ~44, `SYSTEM_PROMPT` 134-172, `triage_one` 307-337, `main` 359+)
- Test: `tests/test_triage_prompt.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_triage_prompt.py`:

```python
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
    # shared rubric still present
    assert "substantive" in prompt and "contextual" in prompt and "skip" in prompt
    assert "campaign_logistics" in prompt  # topic taxonomy retained


def test_build_system_prompt_bradford_substantively_unchanged():
    m = dict(display_name="Brad Bradford", ig_handle="bradfordgrams",
             current_role="City Councillor", pronouns="he/him",
             incumbency="challenger_officeholder")
    prompt = triage.build_system_prompt(m)
    assert "Brad Bradford" in prompt
    assert "substantive" in prompt and "skip" in prompt
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_triage_prompt.py -v`
Expected: FAIL — `AttributeError: module 'scripts.triage' has no attribute 'build_system_prompt'`

- [ ] **Step 3a: Add the lib import**

In `scripts/triage.py`, immediately after the existing `DEFAULT_ACCOUNT`/`HAIKU_MODEL` constants block (after line ~51), add:

```python
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import candidates as _candidates  # noqa: E402
```

- [ ] **Step 3b: Replace the `SYSTEM_PROMPT` constant with a neutralized rubric**

Replace the entire `SYSTEM_PROMPT = """..."""` block (lines 134-172) with the neutralized rubric below. The candidate-specific intro is removed (the persona supplies it); pronouns/role references are neutralized to generic-candidate language; "past COUNCIL ACTION" is softened so it fits non-incumbents too:

```python
TRIAGE_RUBRIC = """You are a classifier for an independent civic-transparency \
project. The project is neutral — neither advocacy nor opposition. Every \
classification will be auditable and logged.

Your job is to decide which of three buckets a single post belongs in:

  • substantive — the post contains a stated POLITICAL POSITION, PLEDGE \
(future-tense commitment), past ACTION (a council motion or vote, a project, an \
official or organizing action), ENDORSEMENT (given or received), substantive \
CRITIQUE of policy or governance, or PUBLIC APPEARANCE with civic content (town \
hall, community event, ribbon cutting). Anything a voter would reasonably want \
to know to evaluate them as a candidate.

  • contextual — the post is personal but the framing informs civic identity. \
Examples: 'as a parent I worry about park safety', 'as a city planner I know …', \
references to their neighborhood, references to their public or professional \
role in passing. This bucket gets a light note for character context, not full \
extraction.

  • skip — purely personal: birthdays, vacation, family selfies, sports \
celebrations, generic life moments, jokes, food. No civic content, no civic \
framing.

Be conservative on 'substantive' — only mark it that way if there is concrete \
political signal. Be liberal on 'contextual' for ambiguous cases. Be honest \
about 'skip' when there is no substance.

Topic taxonomy (controlled vocabulary):
  housing, transit, safety_crime, taxes_fiscal, parks_environment, \
infrastructure, civic_engagement, governance_ethics, small_business_economy, \
social_services, campaign_logistics, endorsements, personal_context, other.

Use 'campaign_logistics' for purely organizational announcements (rallies, \
fundraisers, account changes). Use 'personal_context' only for the contextual \
bucket.

Reason field: one sentence, neutral, no editorial words like 'troubling' or \
'admirable'. Just describe what's in the post and why it fits the bucket."""


def build_system_prompt(manifest: dict) -> str:
    """Persona framing (per-candidate) + the shared neutral rubric."""
    return _candidates.prompt_persona(manifest) + "\n\n" + TRIAGE_RUBRIC
```

- [ ] **Step 3c: Thread the prompt through `triage_one`**

Change `triage_one`'s signature (line 307) and its `system=` argument (line 323):

```python
def triage_one(post_record: dict, client: Anthropic, system_prompt: str) -> dict:
```
```python
        system=system_prompt,
```

- [ ] **Step 3d: Build + pass the prompt in `main`**

In `main()`, after `account = args.account` (line ~366), load the manifest and build the prompt:

```python
    manifest = _candidates.load_candidate(account)
    if manifest is None:
        log(f"FATAL: no candidate.json for @{account}; create data/{account}/candidate.json first")
        return 1
    if manifest.get("incumbency") not in _candidates.INCUMBENCY_VALUES:
        log(f"warn: manifest incumbency '{manifest.get('incumbency')}' unrecognized; using outsider framing")
    system_prompt = build_system_prompt(manifest)
```

Then update the `triage_one` call (line ~447):

```python
            triage = normalize_triage(triage_one(rec, client, system_prompt))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_triage_prompt.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/triage.py tests/test_triage_prompt.py
git commit -m "refactor(sprint-16): candidate-aware build_system_prompt in triage.py"
```

---

### Task 3: Refactor `extract.py` to candidate-aware prompt

**Files:**
- Modify: `scripts/extract.py` (imports ~44, speaker hint 192, `SYSTEM_PROMPT` 204+, `extract_substantive` 416/436, `extract_contextual` 462-467, `main` 531+)
- Test: `tests/test_extract_prompt.py` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/test_extract_prompt.py`:

```python
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
    # shared extraction rubric retained
    assert "positions" in prompt and "pledges" in prompt and "actions" in prompt


def test_contextual_user_prompt_uses_candidate_name():
    m = dict(display_name="Sarah McVie", pronouns="she/her")
    text = extract.contextual_user_prompt({"date": "2026-05-01T00:00:00+00:00",
                                           "caption": "hi"}, m)
    assert "Sarah McVie" in text
    assert "Bradford" not in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_extract_prompt.py -v`
Expected: FAIL — `AttributeError: module 'scripts.extract' has no attribute 'build_system_prompt'`

- [ ] **Step 3a: Add the lib import**

In `scripts/extract.py`, after the `DEFAULT_ACCOUNT` constant (line ~60), add:

```python
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import candidates as _candidates  # noqa: E402
```

- [ ] **Step 3b: Genericize the speaker hint (line 192)**

Replace:

```python
                        "speaker": {"type": "string", "description": "Usually 'Brad Bradford' but could be a guest in the post."},
```

with:

```python
                        "speaker": {"type": "string", "description": "Usually the candidate themselves, but could be a guest in the post."},
```

- [ ] **Step 3c: Replace `SYSTEM_PROMPT` with neutral rubric + builder**

Replace the candidate-specific opening of the `SYSTEM_PROMPT` string (lines 204-209, the paragraph naming "The Bradford Files… Brad Bradford (@bradfordgrams), a Toronto City Councillor running for Mayor of Toronto in 2026. The project is neutral…") so the constant is renamed `EXTRACT_RUBRIC` and its first paragraph becomes neutral:

```python
EXTRACT_RUBRIC = """You are an extraction assistant for an independent \
civic-transparency project. The project is neutral — neither advocacy nor \
opposition. Records you extract will be displayed publicly with sourcing back \
to the original post.
```

Leave the remainder of the string (from "Your job is to read one Instagram post's caption…" onward) exactly as-is. Then immediately after the closing `"""` of that constant, add:

```python
def build_system_prompt(manifest: dict) -> str:
    """Persona framing (per-candidate) + the shared neutral extraction rubric."""
    return _candidates.prompt_persona(manifest) + "\n\n" + EXTRACT_RUBRIC
```

- [ ] **Step 3d: Thread the prompt through `extract_substantive`**

Change the signature (line 416) and the `system=` argument (line 436):

```python
def extract_substantive(post: dict, transcript: str | None, client: Anthropic, system_prompt: str) -> dict:
```
```python
        system=system_prompt,
```

- [ ] **Step 3e: Extract `extract_contextual`'s user text into a testable helper**

Replace the body of `extract_contextual` (462-481) so the user prompt is built by a named, candidate-aware helper:

```python
def contextual_user_prompt(post: dict, manifest: dict) -> str:
    name = manifest.get("display_name", "the candidate")
    return (
        f"Date: {post['date'][:10]}\n"
        f"Caption:\n{post.get('caption') or '(no caption)'}\n\n"
        f"Capture a single short context note about {name}'s "
        f"character/values, in neutral language."
    )


def extract_contextual(post: dict, client: Anthropic, manifest: dict) -> dict:
    """One Haiku call for a one-line background note. No transcript needed."""
    user = contextual_user_prompt(post, manifest)
    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        tools=[CONTEXTUAL_TOOL],
        tool_choice={"type": "tool", "name": "extract_background_note"},
        messages=[{"role": "user", "content": user}],
    )
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return block.input
    return {"summary": "", "topics": [], "source_quote": ""}
```

- [ ] **Step 3f: Build + pass the prompt/manifest in `main`**

In `main()`, after `paths = account_paths(args.account)` (line ~538), add:

```python
    manifest = _candidates.load_candidate(args.account)
    if manifest is None:
        log(f"FATAL: no candidate.json for @{args.account}; create data/{args.account}/candidate.json first")
        return 1
    system_prompt = build_system_prompt(manifest)
```

Then update the two call sites: the `extract_substantive(...)` call to pass `system_prompt` as the 4th arg, and the `extract_contextual(...)` call to pass `manifest` as the 3rd arg. (Search for `extract_substantive(` and `extract_contextual(` in `main`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_extract_prompt.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add scripts/extract.py tests/test_extract_prompt.py
git commit -m "refactor(sprint-16): candidate-aware build_system_prompt in extract.py"
```

---

### Task 4: Add `pronouns` + `incumbency` to existing manifests

**Files:**
- Modify: `data/bradfordgrams/candidate.json`
- Modify: `data/oliviachow/candidate.json`

- [ ] **Step 1: Add fields to Bradford manifest**

In `data/bradfordgrams/candidate.json`, add two keys (after `"surname": "Bradford",`):

```json
  "pronouns": "he/him",
  "incumbency": "challenger_officeholder",
```

- [ ] **Step 2: Add fields to Chow manifest**

In `data/oliviachow/candidate.json`, add two keys (after `"surname": "Chow",`):

```json
  "pronouns": "she/her",
  "incumbency": "incumbent",
```

- [ ] **Step 3: Verify both manifests are valid JSON and build real prompts**

Run:
```bash
.venv/bin/python -c "
import sys; from pathlib import Path
sys.path.insert(0, 'scripts')
from lib import candidates as c
for h in ('bradfordgrams','oliviachow'):
    m = c.load_candidate(h); assert m, h
    p = c.prompt_persona(m)
    print(h, '->', p[:90])
    assert m['display_name'].split()[-1] in p
"
```
Expected: prints a persona line for each; no assertion error.

- [ ] **Step 4: Run the full test suite**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: all pass (existing tests + the 3 new prompt test files).

- [ ] **Step 5: Commit**

```bash
git add data/bradfordgrams/candidate.json data/oliviachow/candidate.json
git commit -m "data(sprint-16): add pronouns + incumbency to Bradford & Chow manifests"
```

---

## Self-Review

- **Spec coverage:** Manifest additions (Task 4) ✓; `prompt_persona` helper + incumbency-driven Action framing (Task 1) ✓; `build_system_prompt` in both scripts + `main` threading + `load_candidate` fatal-on-missing (Tasks 2, 3) ✓; speaker hint + context-note de-Bradforded (Task 3) ✓; pronouns default they/them + unknown-incumbency fallback (Task 1 tests) ✓; testing requirements incl. "Bradford never leaks" + "Bradford substantively unchanged" (Tasks 1, 2 tests) ✓. McVie manifest creation + Chow re-run + McVie ingestion are explicitly downstream of this plan (separate tasks), matching the spec's Non-goals.
- **Placeholder scan:** No TBD/TODO; every code step shows full code or exact old→new strings.
- **Type consistency:** `prompt_persona(manifest)->str`, `build_system_prompt(manifest)->str`, `INCUMBENCY_VALUES` set, `triage_one(post_record, client, system_prompt)`, `extract_substantive(post, transcript, client, system_prompt)`, `extract_contextual(post, client, manifest)`, `contextual_user_prompt(post, manifest)->str` — names consistent across all tasks.
