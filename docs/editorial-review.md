# Synthesis Editorial Review Checklist

For each cell at `data/<handle>/synthesis/<topic>.json` with a non-null `summary`, run through these four checks. Log results in this file (or on a fresh review-YYYY-MM-DD.md per pass).

## Checks

### 1. No character claims
The synthesis describes positions only. Reject any phrase that:
- Characterizes the candidate's intent, motivation, or sincerity ("Bradford genuinely believes...", "Chow seems committed to...")
- Compares the candidate as a person to others
- Speculates on the candidate's electoral strategy or party affiliation

### 2. No speculation
The synthesis stays in past/present tense for actual stances. Reject:
- "Bradford will probably push for..."
- "Chow is likely to support..."
- "...if elected..."

### 3. Cited claims match cited records
Pick 2-3 cited shortcodes per paragraph. Click through the Instagram URL (visible in the per-record card on the candidate's dashboard). Confirm:
- The record exists at that shortcode
- The record's content actually supports the synthesis claim that cites it
- The record is not taken out of context (e.g., a sarcastic post being read literally)

### 4. Tonal balance
Read Bradford's and Chow's syntheses for the same topic side by side. Ask:
- Does one read more sympathetically than the other?
- Does one use stronger active verbs and the other passive?
- Is the level of detail comparable?

## Per-cell log

Format each entry as:

```
## YYYY-MM-DD — handle/topic

- [x] No character claims
- [x] No speculation
- [x] 3/3 cited records match
- [ ] Tonal balance: synthesis A reads stronger than synthesis B for topic X — flagged for re-run

Notes: [free text]
```

## Re-run process

If any check fails:
1. Note the issue in the log.
2. If it's a record-citation mismatch, the upstream record may be wrong — fix at the records.jsonl level, then re-run synthesis.
3. If it's a tonal/character issue, regenerate with `--force` (the next sample may avoid the issue), or amend `SYSTEM_PROMPT` if the issue is systematic across cells.

## When to re-run a full editorial review

- Before a public launch announcement.
- After modifying `SYSTEM_PROMPT`.
- After significant new records are added to a candidate (e.g., +20% records).
- If a reader reports a synthesis error.
