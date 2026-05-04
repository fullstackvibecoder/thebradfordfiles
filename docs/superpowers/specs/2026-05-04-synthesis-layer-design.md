# Phase 7 — Synthesis Layer Design

**Date:** 2026-05-04
**Owner:** ara@thespringteam.ca
**Status:** Approved (verbal)

## Goal

Add a per-candidate × per-topic synthesis layer on top of the existing extracted records. For each (candidate, topic) pair, produce a sourced 80–150 word summary, a consistency label ("consistent" / "evolving" / "shifted"), key positions, key actions, and any detected stance changes — all with shortcode citations back to source records. Surface this in the existing **Said vs. Done** tab and as a small consistency dot on each landing card.

## Context

The T.O. Mayoral Files currently extracts structured records from candidates' Instagram content (positions, pledges, actions, endorsements, appearances, quotes) and cross-references actions against the City of Toronto council voting record. Phase 7 — this spec — adds a layer of editorial-quality synthesis on top of that data. It does **not** ingest new external sources (news, op-eds); that's deferred to a later phase.

The synthesis answers the question: *"What is this candidate's overall position on X, and is it consistent over time?"*

## Non-goals

- News / op-ed / podcast ingestion (Phase 8+).
- Cross-candidate synthesis ("how do they compare on housing"). The `/compare` view is its own future scope.
- Sentiment, tone, or "character" analysis. Synthesis describes *positions*, not the candidate.
- Predictive claims ("Bradford will likely…"). Past stances only.

## Architecture

```
data/<handle>/records.jsonl      ──┐
data/<handle>/candidate.json     ──┤   scripts/synthesize.py
                                   ├──▶  data/<handle>/synthesis/<topic>.json
                                   │
                                   │   scripts/synthesize_all.py  (batch driver)
data/votes/matches.jsonl         ──┘
                                       │
                                       ▼
                              scripts/build_site.py
                                       │
                                       ▼
                              site/candidates/<slug>.json
                              (records + meta now include `synthesis` block)
                                       │
                                       ▼
                              site/candidate-template.html
                              (renders synthesis paragraph and consistency
                               badge into Said-vs-Done topic blocks;
                               renders consistency dot on landing card)
```

The synthesis layer is a **pure read-through transform** of existing records — no new ingestion, no new API. The only external dependency is the Anthropic SDK (already used by triage/extract).

## Output schema

`data/<handle>/synthesis/<topic>.json`:

```json
{
  "candidate_handle": "bradfordgrams",
  "candidate_slug": "bradford",
  "topic": "transit",
  "summary": "On transit, Bradford has consistently…",
  "consistency": {
    "label": "consistent",
    "stable_since": "2019-03",
    "changes": [
      {
        "from_stance": "supports Eglinton East LRT extension",
        "to_stance": "advocates rerouting to subway extension instead",
        "approximate_date": "2024-Q1",
        "supporting_records": ["ABC123", "DEF456"]
      }
    ]
  },
  "key_positions": [
    {
      "stance": "Increase TTC service frequency on East York routes",
      "supporting_records": ["GHI789", "JKL012"]
    }
  ],
  "key_actions": [
    {
      "action": "Voted yes on motion 2024.GG12.7 (jet-ski no-go zone)",
      "supporting_records": ["MNO345"]
    }
  ],
  "input_record_count": 142,
  "input_records_hash": "sha256:abc…",
  "model": "claude-opus-4-7",
  "system_prompt_hash": "sha256:def…",
  "synthesis_generated_at": "2026-05-04T10:00:00Z",
  "synthesis_skipped_reason": null
}
```

**"Records" for synthesis purposes** = entries in `data/<handle>/records.jsonl` (plus alias accounts via `alias_handles`) with `kind` in `{position, pledge, action}` and `topic` matching the target topic. Endorsement/appearance/quote records are excluded as input — they're not stance claims.

When fewer than 5 such records exist for a topic, `summary` is `null`, `consistency` is `null`, and `synthesis_skipped_reason: "insufficient_data"`. The UI hides the synthesis block entirely for that topic. The 10 topic slugs match `VALID_TOPICS` in `site/api/issue-vote.js`: `housing`, `transit`, `safety_crime`, `taxes_fiscal`, `parks_environment`, `infrastructure`, `civic_engagement`, `governance_ethics`, `small_business_economy`, `social_services`.

### Consistency label semantics

- **consistent** — no stance changes detected; current stance has held since `stable_since`.
- **evolving** — stance has expanded or refined over time but doesn't directly contradict prior positions (e.g., added new specifics).
- **shifted** — at least one position now contradicts a prior position. The `changes` array must be non-empty and each change must cite ≥2 supporting records.

The LLM proposes the label, bound to this enum via tool-use schema. We don't override.

## Guardrails

System prompt (verbatim, will be in `scripts/synthesize.py`):

```
You are synthesizing a Toronto mayoral candidate's positions on a single
public-policy topic, based on their public Instagram content.

RULES:
1. Synthesize POSITIONS only. Do NOT characterize the candidate's intent,
   motivation, character, sincerity, or political identity.
2. Every claim about a stance, position, or change must cite ≥1 shortcode
   from the input records.
3. If you detect a stance change, classify it as "shifted" only when the new
   stance directly contradicts the prior stance. Refinement or specificity
   is "evolving", not "shifted".
4. If fewer than 5 substantive records exist on this topic, return
   `synthesis_skipped_reason: "insufficient_data"` and null fields.
5. Use the candidate's name, not pronouns, in the first sentence of summary.
6. The summary is 80–150 words, plain prose. No headers, no lists.
7. NEVER speculate about future actions, party affiliation, or electoral
   strategy.

OUTPUT: emit a single tool call with the structured fields. No prose
outside the tool call.
```

Output is enforced by JSON-schema-validated `tool_use` (Anthropic SDK). The script rejects any output that doesn't validate (and logs the rejection for debugging).

Methodology page (`/methodology`) is updated to disclose:
- The synthesis prompt verbatim (so anyone can audit)
- The model used (Opus 4.7)
- The 5-record threshold for skipping
- The cache invalidation rule (synthesis regenerates only when input records change)

## Model, caching, and cost

**Model:** `claude-opus-4-7` (1M context — sufficient for any candidate × topic input). Editorial weight justifies the cost; the alternative (Sonnet) would be 3× cheaper but reduces summarization quality on the long-form input.

**Caching:** Each `<topic>.json` stores `input_records_hash` (sha256 of the relevant slice of `records.jsonl`), `system_prompt_hash`, and `model`. On rerun:
- If `input_records_hash`, `system_prompt_hash`, AND `model` all match the current state → skip (use cached output).
- If any differs → regenerate.

This means: editing the system prompt, swapping models, or adding new records for a candidate (e.g., when a new pipeline pass runs) invalidates the affected (candidate, topic) cells. Other cells remain cached.

**Cost estimate:**
- Bradford has ~5,400 records; ~10 topics; on average ~150 records per (candidate, topic) cell.
- Per cell: ~30k input tokens, ~600 output tokens → ~$0.50/cell at Opus 4.7 pricing.
- 2 candidates × 10 topics = 20 cells = ~$10 per full regen.
- Expected regen frequency: weekly during active campaigning, otherwise on demand.
- **Annual ceiling:** ~$500.

## File structure

**New scripts:**
- `scripts/synthesize.py` — synthesizes one (candidate, topic) cell. Args: `--account <handle>`, `--topic <slug>`, `--force` (bypass cache).
- `scripts/synthesize_all.py` — batch driver. Iterates all primary candidates × all topics with ≥5 records. Calls `synthesize.py` per cell.
- `scripts/lib/synthesis.py` — shared helpers: hash computation, cache lookup, prompt construction, schema validation.

**New tests:**
- `tests/test_synthesize.py` — verifies cache logic, schema validation, insufficient-data branch, hash invalidation.

**Updated scripts:**
- `scripts/build_site.py` — folds `data/<handle>/synthesis/*.json` into the per-candidate dossier under `meta.synthesis[<topic>]`. Computes the landing-card consistency dot color from per-topic labels.
- `scripts/build_all.sh` — adds `synthesize_all.py` step between `match_votes` and `build_site`.

**Updated frontend:**
- `site/candidate-template.html` — Said-vs-Done topic blocks render the synthesis paragraph at top, the consistency badge in the topic header, clickable `[N]` superscripts on cited claims that scroll to the source record.
- `site/index.html` — landing card gains a small consistency dot (4 states, see below) next to the candidate name, with a tooltip explaining methodology and linking to `/methodology`.
- `site/methodology/index.html` — adds a Synthesis methodology section with the verbatim system prompt, model name, threshold, and cache rules.

**New data:**
- `data/<handle>/synthesis/<topic>.json` — committed (small files, audit-relevant).

## UI integration details

### Said-vs-Done topic block (per topic, per candidate)

Above the existing two-column "Said" and "Done" lists:
- **Synthesis paragraph** (the `summary` field), 80–150 words, plain prose. Cited claims rendered with clickable `[1]` `[2]` superscripts.
- **Consistency badge** in the topic header: a small pill — green ✓ "Consistent since 2019" / yellow ↻ "Evolving" / red ⚠ "Shifted in 2024" / gray "Insufficient data."
- **"Detected stance change" sub-section** appears only if `consistency.label === "shifted"`: lists each change with from/to stances and links to the supporting records.

If `synthesis_skipped_reason === "insufficient_data"` the entire synthesis sub-block is omitted; the existing Said vs. Done lists render unchanged.

### Landing card consistency dot

A 4-state semaphore dot next to the candidate name:
- **Green** — all topics with ≥5 records are "consistent."
- **Yellow** — at least one topic is "evolving"; none are "shifted."
- **Red** — at least one topic is "shifted."
- **Gray** — fewer than 3 topics meet the 5-record threshold.

Hover tooltip: "Consistency across X policy topics. See methodology." Clicking the dot navigates to the candidate's dashboard.

This is intentionally information-light. The dot is a teaser, not a summary; the substance lives on the candidate's dashboard.

### Methodology page additions

A new section: **"How synthesis is generated."** Includes:
- The verbatim system prompt (so anyone can audit it).
- Model name and version.
- The 5-record threshold and "shifted" bar (≥2 supporting records).
- Cache invalidation rule.
- Note: synthesis is generated by an LLM; readers should always verify against the cited records, which are the primary source.

## Build pipeline integration

`scripts/build_all.sh` becomes:

```
1. ingest_votes      (refresh data/votes/raw + by-councillor)
2. match_votes        (refresh data/votes/matches.jsonl)
3. synthesize_all     ★ NEW — refresh data/<handle>/synthesis/<topic>.json
4. build_site         (refresh site/landing.json, candidates/, per-candidate HTML)
```

Step 3 is cache-aware: a no-op if records haven't changed. Initial run will regenerate everything (~$10, ~10 min wall-clock for 20 Opus calls).

## Out of scope

- **News/op-ed ingestion** — Phase 8+. Different ingestion model, different ToS questions, different verification approach.
- **Cross-candidate comparison synthesis** — that's `/compare`'s problem; this layer feeds it but doesn't render it.
- **Re-running synthesis on every IG-pipeline pass** — manual trigger or weekly cadence is fine; auto-trigger creates feedback loops we don't need yet.
- **Allowing the LLM to use Web search or its own training data** — synthesis is bounded strictly to the input records. The system prompt forbids speculation.

## Open considerations

1. **Confidence flag on the consistency label**: should we let the LLM emit a 0–1 confidence score? Argument for: readers see "shifted (low confidence)" and don't take it as gospel. Argument against: another field to render; adds editorial complexity. Default position: defer; ship without it; add if needed.

2. **What happens when records lack a topic field**: ~5% of records have `topic: null`. They're excluded from synthesis input. Worth noting on the methodology page so readers don't wonder why a known stance isn't reflected.

3. **Multi-language records**: some records may have French content (Toronto has French-speaking constituents). Opus handles French natively; no special handling needed at the synthesis layer.

4. **Bradford alias merging**: Bradford's councillor archive (@beybradford) records are merged into his main dossier. They participate in synthesis input. Note in the methodology page that synthesis covers his combined IG presence.

## Acceptance criteria

The Phase 7 feature is "done" when:

1. `scripts/synthesize.py` produces valid `data/<handle>/synthesis/<topic>.json` for a single (candidate, topic) cell, including the insufficient-data short-circuit.
2. `scripts/synthesize_all.py` produces all valid cells for all primary candidates with caching working (rerun is a no-op).
3. Tests cover: schema validation, cache hit/miss logic, insufficient-data branch, hash invalidation.
4. `scripts/build_site.py` folds synthesis into the dossier and exposes it to the template.
5. The `/bradford` page shows synthesis paragraphs, consistency badges, and clickable citations on at least 5 topic blocks.
6. The landing card shows a consistency dot for each candidate, with a working tooltip.
7. The `/methodology` page documents the synthesis prompt, model, thresholds, and cache rules.
8. Manual review of 5 synthesis outputs by the operator (you) confirms no editorializing, no speculation, no character claims.
