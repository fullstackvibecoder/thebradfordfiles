# Sprint 18. Position ↔ Vote Evidence Pairing

**Date:** 2026-06-05
**Status:** Spec. Ready for implementation plan.
**Builds on:** the existing `scripts/match_votes.py` (action↔vote matching) and `scripts/build_site.py` (which attaches `council_verification` to action records).

## Goal

Cross-reference a candidate's stated **positions and pledges** ("Said") against
their actual council **votes** ("Done"), and surface them paired — stated quote
beside the relevant votes, with each vote's motion text, disposition, result,
and date. The reader draws the conclusion; the system renders no verdict. This
is the deepest expression of the project's "Said vs. Done" thesis, applied to
the hardest evidence (the voting record).

This is **axis A** of the three-axis "more local mayoral info" expansion. It is
the **data layer only**; the web-UI rendering of the paired votes is the
immediate follow-up sprint, deliberately out of scope here.

## Motivation

Today `match_votes.py` matches only `action` records to the candidate's own
votes — that verifies "Done vs. Done." The project's thesis is "Said vs. Done,"
and the most accountability-relevant comparison is whether a candidate's stated
*positions* align with how they actually *voted*. That comparison does not exist
yet. Building it on the existing deterministic matcher keeps it cheap, fully
auditable, and consistent with the project's "every decision is inspectable"
ethos.

## Neutrality constraint (load-bearing)

The project methodology forbids editorial framing: *"No 'flip-flop' labels, no
'controversy' tags... readers conclude."* This sprint therefore produces
**evidence pairing, not verdicts**:

- Each stated position/pledge is paired with the candidate's topically-related
  votes, showing for each vote the **motion text** (`Agenda Item Title` +
  `Vote Description`), the candidate's **disposition** (Yes/No), the **result**
  (e.g. "Carried, 24-2"), and the **date**.
- The motion text supplies directionality (a "Yes" on a motion to *remove* bike
  lanes is shown with that motion text, so the reader interprets it correctly).
- **No** `consistent`/`inconsistent`/`mixed` field, and **no** alignment score,
  is computed or stored. The matcher's numeric `confidence` exists only for
  ordering and threshold gating; it is a relevance signal, never displayed as a
  consistency rating.

## Design

### 1. Matcher extension (`scripts/match_votes.py`)

Generalize the matcher to also process `position` and `pledge` records, with
matching semantics distinct from the existing action path:

- **Term window, not event window.** Actions match within ±60 days of the post
  (`_tier2_match`, unchanged). Positions/pledges instead match against every one
  of the candidate's votes in the **council term that contains the record's
  `post_date`**, derived from the manifest's `council_terms` (e.g.
  `"2022-2026"` → 2022-01-01..2026-12-31). A stated stance is checked against the
  whole term's record, not a 60-day neighbourhood.
- **Multi-match.** A position/pledge emits a match row for **every** vote whose
  topical keyword overlap with the record (`summary` + `topic`) clears a
  threshold — not just the single best. Actions remain one match (first Tier 1,
  else best Tier 2).
- **Signal.** Reuse `_keywords` (the existing `[a-z]{4,}` tokenizer) and set
  overlap. `confidence = overlap / max(len(record_kw), 1)`, gated at a
  `POSITION_MATCH_THRESHOLD` (e.g. ≥ 2 overlapping keywords AND confidence ≥
  0.15 — tuned in the plan against real data). No date-proximity term.
- **Term boundary helper.** A new `_term_bounds(council_terms, post_date) ->
  (start, end) | None` parses a `"YYYY-YYYY"` term string and returns the term
  enclosing the post date (None if the record predates/contains no matching
  term — those records get no position matches).

`_match_dict` already carries `Agenda Item #`, `Vote`, `Result`, `Date/Time`,
`Vote Description`; add `Agenda Item Title` so the pairing can show motion text.
Each row gains `record_kind` (`"position"`/`"pledge"`/`"action"`) and keeps
`record_shortcode`.

### 2. Output (`data/votes/matches.jsonl`)

Same file, same row schema (plus `record_kind` and `agenda_item_title`). A
record may now appear in **multiple** rows (a position → N votes). Action rows
are unchanged in shape and count.

### 3. Build merge (`scripts/build_site.py`)

Replace the current 1:1 `matches_by_sc[sc]` lookup with a grouping: build
`matches_by_sc: dict[str, list[dict]]` (all rows per shortcode). Then in the
record loop:

- `action` records: attach `council_verification` = the single best row (highest
  `confidence`) — **back-compatible** with today's behaviour and the existing
  web rendering.
- `position`/`pledge` records: attach `related_votes` = the full list of matched
  vote rows for that shortcode, sorted by `vote_date`.

No other dossier fields change.

### 4. Pipeline ordering

`match_votes.py` already runs before `build_site.py` in `scripts/build_all.sh`
(votes → match → synthesize → build). No ordering change needed; the extended
matcher simply emits more rows.

## Data flow

```
data/<handle>/records.jsonl (position/pledge/action)
data/votes/by-councillor/<last>-<first>.jsonl (candidate's votes)
        │
  match_votes.py:
    action   → ±60d / agenda-item  → 1 row   (unchanged)
    position → term-window topical  → N rows  (new)
    pledge   → term-window topical  → N rows  (new)
        ▼
  data/votes/matches.jsonl  (rows gain record_kind + agenda_item_title)
        ▼
  build_site.py: group by shortcode →
    action   → record.council_verification (best)
    position → record.related_votes (list, date-sorted)
        ▼
  web/public/data/candidates/<slug>.json  (dossier carries related_votes)
```

## Error handling

- Record with no enclosing term (`_term_bounds` → None): no position matches;
  not an error.
- Non-incumbent / no `council_name_for_vote_lookup` (e.g. McVie): already
  returns `[]` in `match_for`; positions add nothing. No change.
- Vote with an unparseable `Date/Time`: excluded from term-window filtering
  (can't place it in a term) — consistent with `_tier2_match`'s existing
  date handling.
- Empty keyword set on a record: no matches (guard as `_tier2_match` does).

## Testing

Unit tests (`tests/test_match_votes.py`, extend or create):

- `_term_bounds("2022-2026", "2024-05-01")` → the 2022–2026 bounds; a date
  outside any listed term → None; multiple terms → the enclosing one.
- A `position` record matches **multiple** topically-related votes within its
  term and **none** outside the term window.
- Topical threshold gating: a position shares only one generic keyword with an
  off-topic vote → no match.
- Action matching is **unchanged**: an existing action fixture still yields its
  single Tier 1/Tier 2 match with identical shape (plus the additive
  `agenda_item_title`/`record_kind` fields).
- `build_site` grouping: a position with two matched vote rows surfaces
  `related_votes` of length 2 (date-sorted) on the dossier record; an action
  still surfaces a single `council_verification`. (Extend the existing
  `tests/conftest.py` fixture; seed a couple of votes + a position record.)
- Neutrality guard: assert no `consistent`/`inconsistent`/`score`/`alignment`
  key appears in any match row or dossier record.

## Non-goals

- **Web-UI rendering of the paired votes** — the dossier will carry
  `related_votes`, but the visual "Said vs. Done" treatment is the **immediate
  follow-up sprint** (agreed), not this one.
- LLM/semantic matching (this is deterministic keyword/topic per the design
  decision).
- Any consistency verdict, label, badge, or alignment score.
- Topic-classifying the full vote corpus (matching is per-record, not
  per-topic-aggregate).
- Re-ingesting or refreshing the raw 2006–2026 vote data (a separate concern).

## Rollout

1. Add `_term_bounds` + tests.
2. Add the position/pledge matching path in `match_votes.py` (multi-match,
   term-window, `record_kind`, `agenda_item_title`) + tests; confirm action
   matching unchanged.
3. Update `build_site.py` to group matches and attach `related_votes` + tests.
4. Run `match_votes.py` + `build_site.py` over the real roster (Bradford, Chow)
   once the Python environment is repaired; eyeball a sample of pairings for
   topical sanity and tune `POSITION_MATCH_THRESHOLD`.
5. (Follow-up sprint) Render `related_votes` in the web "Said vs. Done" surface.
