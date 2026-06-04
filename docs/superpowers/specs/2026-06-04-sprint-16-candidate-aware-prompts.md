# Sprint 16. Candidate-Aware Triage & Extraction Prompts

**Date:** 2026-06-04
**Status:** Spec. Ready for implementation plan.
**Builds on:** `2026-05-03-to-mayoral-files-multi-candidate-design.md`, which added `--account` routing and `lib/candidates.py` manifest loading but left the AI prompts hardcoded to Bradford.

## Goal

Make the triage and extraction system prompts candidate-aware. Today both
`scripts/triage.py` and `scripts/extract.py` carry system prompts hardcoded to
Brad Bradford. Every non-Bradford candidate (currently Olivia Chow; soon Sarah
McVie) is run through a prompt that names the wrong person, uses the wrong
pronoun, and assumes an incumbent-councillor framing. This sprint parameterizes
the framing from each candidate's `candidate.json` manifest so the pipeline is
correct for any candidate, and unblocks ingesting non-incumbent challengers.

## Motivation

`--account` routing was added for file/data paths (`data/<handle>/`), but the
AI prompts were never parameterized. The hardcoded Bradford framing lives in:

- `scripts/triage.py` — `SYSTEM_PROMPT` module constant ("documenting the
  public political record of Brad Bradford (@bradfordgrams)… evaluate **him**").
- `scripts/extract.py` — `SYSTEM_PROMPT` constant (line ~204), the speaker hint
  "Usually 'Brad Bradford' but could be a guest" (line ~192), and the
  context-note prompt "Brad Bradford's…" (line ~467).

Consequences:

1. **Correctness.** Olivia Chow's 470 existing records were triaged and
   extracted with a prompt asserting they describe Brad Bradford. The models are
   robust enough that the records are usable, but the framing is factually wrong
   and biases the classifier toward councillor-incumbent signals.
2. **Blocker for new candidates.** Sarah McVie is an actress and non-incumbent
   (she/her, no council voting record). The Bradford-as-councillor prompt is the
   worst fit yet and would mis-frame her record before ingestion even starts.

The scaffolding to fix this already exists (`lib/candidates.py` loads manifests)
but the prompts never call it. This sprint finishes that intent.

## Non-goals

- Re-running Chow's pipeline. That is a separate, explicitly-scheduled follow-up
  task (re-triage + re-extract with corrected prompts), not part of this spec.
- Changing the triage rubric, topic taxonomy, extraction schema, or neutrality
  rules. Those are candidate-agnostic and stay shared and unchanged.
- Injecting platform pillars or signature issues into the prompt. Deliberately
  excluded — it would prime/bias the classifier and cut against project
  neutrality.
- Any site/build/UI changes.

## Design

### Manifest additions (two fields per candidate)

- `pronouns` — human-readable string, e.g. `"he/him"`, `"she/her"`, `"they/them"`.
  The helper derives subject/object/possessive forms from this.
- `incumbency` — one of:
  - `"incumbent"` — currently holds the office being sought (Chow: sitting Mayor).
  - `"challenger_officeholder"` — holds *another* elected office with a voting
    record (Bradford: sitting Councillor).
  - `"challenger_outsider"` — holds no elected office, no legislative voting
    record (McVie).

`incumbency` drives the "Action" framing; `pronouns` drives pronoun rendering.

### `lib/candidates.py` — new `prompt_persona(manifest) -> str`

Returns a 2–3 sentence framing paragraph built from `display_name`, `ig_handle`,
`current_role`, `pronouns`, and `incumbency`. Behavior by incumbency:

- `incumbent` / `challenger_officeholder` → states the person holds elected
  office and that council/legislative votes, motions, and actions should be
  captured as Action records.
- `challenger_outsider` → states the person holds no elected office and has no
  legislative voting record; Action records capture past civic/organizing
  actions (e.g. community advocacy), not council votes.

A small internal helper maps `pronouns` → `{subject, object, possessive}` (e.g.
`"she/her"` → subject `she`, object `her`, possessive `her`). Default to
`they/them` if `pronouns` is missing, so an under-specified manifest degrades
gracefully rather than crashing.

### `triage.py` and `extract.py` changes

- Replace each `SYSTEM_PROMPT` constant with a `build_system_prompt(manifest)`
  function: the shared rubric/taxonomy text stays inline; the persona paragraph
  from `prompt_persona(manifest)` is interpolated at the top.
- `main()` loads the manifest once via `load_candidate(account)` and threads it
  into `triage_one` / the extraction call sites.
- In `extract.py`, the speaker hint (line ~192) and context-note prompt
  (line ~467) use `manifest["display_name"]` instead of the literal
  "Brad Bradford".
- If `load_candidate(account)` returns `None` (no manifest), fail fast with a
  clear error — every account must have a manifest to be processed.

### Data flow

```
candidate.json ──load_candidate(account)──▶ manifest dict
                                              │
                          prompt_persona(manifest) ──▶ persona paragraph
                                              │
   build_system_prompt(manifest) = persona + shared rubric ──▶ Haiku/Opus call
```

No change to file routing, pagination, JSONL schemas, or the synthesize/build
stages.

### Error handling

- Missing manifest → fatal error in `main()` with a message naming the account.
- Missing `pronouns` → default `they/them`.
- Missing/unknown `incumbency` → default to `challenger_outsider` framing (the
  most conservative: assumes no voting record, so it never fabricates a council
  record that doesn't exist) and log a warning.

## Testing

Add `tests/test_prompt_persona.py`:

- `incumbency="incumbent"` (Chow-like) → persona names the person, uses "she/her",
  mentions capturing council/legislative actions.
- `incumbency="challenger_officeholder"` (Bradford-like) → "he/him", office +
  voting-record framing.
- `incumbency="challenger_outsider"` (McVie-like) → "she/her", explicitly states
  no legislative voting record.
- Negative assertion: for a non-Bradford manifest, the string "Bradford" (and
  "@bradfordgrams") never appears.
- Missing `pronouns` → renders they/them without error.
- Unknown `incumbency` → falls back to outsider framing.

Existing pipeline behavior for Bradford must be unchanged: a Bradford manifest
through `build_system_prompt` should produce a prompt equivalent in substance to
today's hardcoded one (same rubric, same person, same framing).

## Rollout

1. Add `pronouns` + `incumbency` to existing manifests (bradfordgrams,
   oliviachow) and the new McVie manifest.
2. Implement `prompt_persona` + tests.
3. Refactor `triage.py` and `extract.py`.
4. Verify Bradford prompt is substantively unchanged; run the McVie ingestion
   (separate task) on the corrected pipeline.
