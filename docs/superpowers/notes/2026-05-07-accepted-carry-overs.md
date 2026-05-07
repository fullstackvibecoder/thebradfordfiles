# Accepted carry-overs as of 2026-05-07

After cleaning up the tractable Sprint 11 and 12 items, four items remain that are intentionally deferred. Documenting why so future sprints don't re-investigate them as bugs.

## 1. Chow synthesis cells `safety_crime` and `infrastructure` skip-render

**Status:** Working as designed. Frontend skip-renders correctly.

The Sprint 9 conversation had earlier flagged Chow's `parks_environment` and `governance_ethics` as stuck. As of 2026-05-07 those two render fine. The current insufficient_data skips are different cells:
- `oliviachow/safety_crime`: 2 input records
- `oliviachow/infrastructure`: 4 input records

Both are correctly marked `synthesis_skipped_reason: "insufficient_data"` because input volume is too thin to support a defensible 80 to 150 word synthesis. This is an editorial discipline of the synthesis pipeline, not a bug.

**Resolution path:** When sustained Instagram coverage on these topics from Chow surfaces, re-ingest and re-run synthesis. Alternative: lower the input-volume threshold in `scripts/lib/synthesis.py`, but that risks shallow summaries. Not recommended.

## 2. Pol.is conversation seeding

**Status:** Operator-only, manual, one-time.

The `/issues/transit-funding/discuss` page embeds Pol.is. The conversation is created on first page visit. After creation, the operator must visit the Pol.is admin (pol.is/<conversation_id>/config) and add 7 seed statements. Cannot be automated by the agent.

**Resolution path:** Operator visits the discuss URL in a real browser, then adds seeds via Pol.is admin.

## 3. Match-threshold tuning for scenarios and receipts

**Status:** Awaiting production data.

`get_scenario_card` uses `MATCH_THRESHOLD = 0.25` (lowered from 0.4 during Sprint 10 testing).
`get_claim_audit` uses `MATCH_THRESHOLD = 0.25` and `ANCHOR_THRESHOLD = 0.4`.

Both were tuned against synthetic test queries. Real production query patterns may surface false negatives (legitimate scenario or receipt questions returning no_match) or false positives (off-topic queries matching). Tune by inspecting the Redis backlog (`scenarios:unmatched`, `receipts:unmatched`) at `/admin/scenario-requests` and a future `/admin/receipt-requests`.

**Resolution path:** Wait for real query volume. Adjust thresholds based on the unmatched backlog content.

## 4. npm postcss vulnerability advisory (transitive via Next.js)

**Status:** Advisory accepted.

`npm audit` reports 2 moderate-severity vulnerabilities:
- `postcss <8.5.10`: XSS via Unescaped `</style>` in CSS Stringify Output (GHSA-qx2v-qp2m-jg93)
- Transitive via `next@9.3.4-canary.0 - 16.3.0-canary.5`

`npm audit fix --force` would downgrade Next.js to 9.3.3, which is a major breaking change. Not actually a fix.

The vulnerability requires the application to call PostCSS's CSS stringify on attacker-controlled style content, which The Mayoral Record does not do (no user-submitted CSS, no inline-style assembly from query input). Practical exploitability: zero.

**Resolution path:** Resolves naturally when Next.js bumps the postcss transitive dependency in a future minor (16.4+ likely). Watch GitHub Dependabot alerts for that bump.

## 5. Crime card Chow source restored (closed)

The Sprint 12 carry-over flagged that the crime-trends receipt was running single-claim because the Chow Nov 2025 Scarborough North forum quote could only be sourced via a secondary outlet (CCTVmedium). Re-searched on 2026-05-07 and located a primary-source URL on `mayoroliviachow.ca` for a 2026-05-01 release on expanding youth programs. Card now ships dual-claim. Closed.
