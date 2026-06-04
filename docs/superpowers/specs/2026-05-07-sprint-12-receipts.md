# Sprint 12. Receipts. Auditing common municipal-campaign claims against Toronto Open Data

**Date:** 2026-05-07
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 10 (scenarios, agent retrieval pattern, T1 to T4 source-tier system) and Sprint 11 (warm-dark Documentary aesthetic).

## Goal

Address common municipal-campaign misinformation by publishing curated, evidence-backed receipts that audit specific factual claims against Toronto Open Data. Ship 5 launch receipt cards plus the agent retrieval and admin infrastructure to publish more on a regular cadence.

## Motivation

The current site documents what candidates have said and how they have voted (synthesis cells, council votes) and analyses what their proposed mechanisms might mean (scenario cards). It does not directly engage with specific factual claims circulating in the race. Common framings like "Toronto crime is exploding," "Toronto is the highest-taxed city," or "TTC ridership is collapsing" travel through public discourse and shape voter judgement, often without grounding in the actual data the city itself publishes.

Toronto has one of the most robust open-data ecosystems in North America. Sprint 12 connects that data to the discourse: when a specific verbatim claim circulates, the site publishes a receipt that quotes the claim, attributes it to a primary source, presents the relevant Toronto Open Data, and acknowledges what the data does and does not settle.

## Non-goals

- Auto-pulled or cron-driven data refresh. Hand-curated like Sprint 10 scenarios. Automation slated for Sprint 13 if and when the format proves out.
- Charts or inline data visualisations. Text plus numerical citations only at launch.
- Audit cards spanning multiple topics. One topic per card.
- Public submission of claims for audit.
- Editorial commentary that crosses from rebuttal into advocacy. The card presents the claim, its source, the data, and explicit caveats. It does not say "X is lying" or "X is wrong."
- Audit of claims older than 2024-01-01. Out of campaign window.
- Audit of paraphrased or unsourced claims. Verbatim with retrievable URL or it does not get audited.

## Architecture

### New routes and surfaces

- `/receipts`. Index page listing all live receipt cards. Tile per card showing topic, pull-quote, claim count, last-reviewed date, next-review date.
- `/receipts/[slug]`. Full receipt card render at canonical URL. Server Component. Each data anchor section has its own URL fragment so the chat agent can deep-link to a sub-section.
- `/api/og?type=receipt&slug=<slug>`. Receipt OG image variant. Warm-dark palette inherited from Sprint 11, with the red claim-block accent so social shares signal the rebuttal posture.

### New code surfaces

- `web/lib/receipt-types.ts`. TypeScript interfaces and Zod validator for ReceiptCard JSON. Reuses `Citation` and `Comparable` types from `web/lib/scenario-types.ts`.
- `web/lib/receipt-loader.ts`. `listReceipts`, `getReceipt`, `setReceiptDataDir`. Mirrors `scenario-loader.ts`.
- `web/components/ReceiptCard.tsx`. Full card renderer. Server component.
- `web/components/ReceiptCardTile.tsx`. Index-page tile.
- `web/components/ReceiptClaimBlock.tsx`. The verbatim-claim block with red accent, monospace claim text, AUDITED stamp. Reused per claim within a card.
- `web/components/ReceiptExhibit.tsx`. Per-anchor exhibit block with sub-section ID for fragment linking, "Exhibit N" heading, finding, metric, citation, caveats, as-of date.
- `web/lib/agent/receipt-tool.ts`. Implementation of `get_claim_audit`. Topic-fuzzy match plus optional sub-section anchor return for deep-link retrieval.
- `web/app/receipts/page.tsx`. Index page.
- `web/app/receipts/[slug]/page.tsx`. Detail page.
- `web/app/api/og/route.ts`. Modified to add `type=receipt` and `type=receipts-index` variants.

### Modified files

- `web/lib/agent/tool-schemas.ts`. Add `get_claim_audit` schema. New 8th read-only agent tool.
- `web/lib/agent/system-prompt.ts`. New rule for receipt retrieval, with explicit triggers ("is this true", "is X really up", "fact-check") and explicit non-triggers (positions, votes, what someone said).
- `web/lib/agent/tools.ts` (and the dispatcher in `web/app/api/ask/route.ts`). Wire the new tool.
- `web/app/sitemap.ts`. Include /receipts and per-slug URLs.
- `web/app/methodology/page.tsx`. Add a "Receipts" section explaining the audit framework, source-tier system reuse, and editorial guardrails.

### Data flow

1. Operator runs research (deep research subagent per topic) to gather verbatim claims and Toronto Open Data anchors.
2. Operator (or Claude) converts research markdown to JSON at `web/public/data/receipts/<slug>.json`. Schema-validated by Zod at build.
3. `/receipts` renders the index by listing all valid JSON files at the path.
4. `/receipts/[slug]` renders the full card. Each data anchor is wrapped in a section with `id={anchor.sub_section_anchor}` so URL fragments work.
5. Reader asks chat agent a fact-check question. Agent recognises the pattern, calls `get_claim_audit` with verbatim query and best-guess topic_hint.
6. On match, tool returns `{ status: "matched", slug, topic_short, pull_quote, anchor? }`. The optional `anchor` is the most relevant sub-section anchor when one is clearly best. Agent emits a `SingleAnswerCard` whose answer body is the returned `pull_quote`, with a single stamp pointing to `/receipts/<slug>` (or `/receipts/<slug>#<anchor>` when an anchor was returned).
7. On no_match, tool logs `{ query, timestamp, agent_reasoning, ip_hash }` to Redis list `receipts:unmatched`. Agent emits a `SingleAnswerCard` saying the question has not been audited yet.

## Data model

### TypeScript shape

```typescript
// web/lib/receipt-types.ts

import { CitationSchema, type Citation, ComparableSchema, type Comparable } from "./scenario-types";
import { z } from "zod";

export const ClaimSourceSchema = z.object({
  attribution: z.string().min(1),
  url: z.string().url(),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ClaimSource = z.infer<typeof ClaimSourceSchema>;

export const ClaimBlockSchema = z.object({
  headline: z.string().min(1),
  attribution: z.string().min(1),
  source: ClaimSourceSchema,
  response_from_source: z.string().optional(),
});
export type ClaimBlock = z.infer<typeof ClaimBlockSchema>;

export const DataAnchorSchema = z.object({
  sub_section_anchor: z.string().regex(/^[a-z0-9-]+$/),
  sub_claim: z.string().min(1),
  finding: z.string().min(1),
  metric: z.string().min(1),
  source: CitationSchema,
  caveats: z.string().optional(),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type DataAnchor = z.infer<typeof DataAnchorSchema>;

export const ReceiptCardSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    topic: z.string().min(1),
    topic_short: z.string().min(1),
    pull_quote: z.string().min(40).max(400),
    claims: z.array(ClaimBlockSchema).min(1).max(3),
    receipt: z.object({
      intro: z.string().min(1),
      anchors: z.array(DataAnchorSchema).min(3).max(6),
    }),
    what_data_cannot_settle: z.string().optional(),
    comparables: z.array(ComparableSchema).optional(),
    meta: z.object({
      last_reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      next_review: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  })
  .superRefine((card, ctx) => {
    const anchors = new Set<string>();
    for (const a of card.receipt.anchors) {
      if (anchors.has(a.sub_section_anchor)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate sub_section_anchor: " + a.sub_section_anchor,
          path: ["receipt", "anchors"],
        });
      }
      anchors.add(a.sub_section_anchor);
    }
    for (const c of card.claims) {
      if (c.source.retrieved < "2024-01-01") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Claim source must be from 2024-01-01 or later (campaign window). Got " + c.source.retrieved,
          path: ["claims"],
        });
      }
    }
  });
export type ReceiptCard = z.infer<typeof ReceiptCardSchema>;
```

### Validation invariants

Enforced by Zod at JSON load time. Failed validation blocks the build.

- `slug` matches `/^[a-z0-9-]+$/` and is unique across the corpus.
- `pull_quote` between 40 and 400 characters.
- `claims` length 1 to 3.
- `receipt.anchors` length 3 to 6.
- All `sub_section_anchor` values within a card are unique.
- All `claim.source.url` are valid URLs (Zod `z.string().url()`).
- All `claim.source.retrieved` dates are 2024-01-01 or later.
- All `as_of` dates and meta dates are ISO YYYY-MM-DD.
- No em dash character (U+2014) anywhere in any string field.
- All `Citation.tier` values are in `{T1, T2, T3, T4}`.

### File layout

- `web/public/data/receipts/crime-trends.json`
- `web/public/data/receipts/tax-burden.json`
- `web/public/data/receipts/housing-supply.json`
- `web/public/data/receipts/ttc-performance.json`
- `web/public/data/receipts/encampment-response.json`

## Visual design

Inherits the warm-dark Documentary palette from Sprint 11. Deltas specific to receipts:

### Claim block
- Background `#1a0d0d` (warmer-darker than scenarios' `#1c1813`).
- 4px left border in `#c44848` (red accent, distinct from the ochre used in scenarios and elsewhere).
- Claim headline rendered in `font-mono` (ui-monospace) at body size, with proper open and close quote marks.
- Attribution and source URL below the claim, in muted `#8a8275`, mono.
- Top-right of the block: an "AUDITED" stamp glyph (red text, red border, transparent bg).
- When a `response_from_source` is present, it appears below the source URL with the label "Response from source." in mono uppercase, body in serif.

### Exhibit blocks
- Each `DataAnchor` rendered as `<section id={anchor.sub_section_anchor}>`.
- Heading line: "Exhibit 1." (or 2, 3, ...) in mono uppercase, ochre, followed by the `sub_claim` in serif.
- `finding` in serif body.
- `metric` rendered as a callout block: large tabular figures (Source Serif Pro), set off from the body, with the source citation row underneath using the existing `ScenarioTierBadge` component for tier consistency.
- `caveats` (when present) in italic serif, muted, prefixed with "Caveat."
- `as_of` rendered at the bottom of the exhibit in mono uppercase: "AS OF 2024-12-31" muted.

### Card structure on page
1. Topic header. Topic statement (Source Serif Pro, large) plus dateline meta.
2. Claim blocks (1 to 3, stacked).
3. Receipt intro (1 to 2 sentences).
4. Exhibits 1 to N.
5. What data cannot settle (when present, italic serif, ochre left border, dimmer panel).
6. Comparables (optional, reused tabbed-comparables UI from Sprint 10).
7. Footer. Methodology link, next-review date.

### Index tile
- Topic short, pull-quote (truncated to 140 chars), claim count ("3 claims audited"), last-reviewed date.
- On hover: 1px red border (matching the AUDITED accent) instead of the ochre hover used on scenario tiles.

### OG image
Variant `type=receipt&slug=<slug>` mirrors the scenario OG layout but with the red accent line and the "AUDITED" stamp, so social shares signal the rebuttal posture. `type=receipts-index` is a generic /receipts cover.

## Editorial guardrails (encoded in schema and prompt)

1. **Verbatim, sourced, retrievable.** No paraphrasing. The claim quote is exactly what the source said. The source URL is required and must resolve to a primary source (video, transcript, press release, candidate's own social account, bylined op-ed). Schema enforces `url` as required.
2. **Time-bounded.** Source `retrieved` date must be 2024-01-01 or later. Older quotes are out of scope. Schema enforces this.
3. **Attribution-balanced.** The launch corpus must include claims from each candidate currently in the race. Operator's editorial responsibility, verified at publish time. (We do not enforce this in schema because it is a corpus-level property, not a per-card property.)
4. **No editorial commentary in the claim block.** The card presents the verbatim quote, attribution, source URL, and (when present) the source's response. The card never says "X is lying" or "X is wrong." The receipt section presents the data and lets the data speak.
5. **Honest about what data does not settle.** When a claim has parts the data cannot answer (subjective experience of safety, perceived service quality, etc.), the `what_data_cannot_settle` field acknowledges that explicitly.

## Agent integration

### Tool schema

Adds an 8th read-only tool to the agent's existing 7. The agent now has: `list_candidates`, `search_records`, `lookup_council_vote`, `get_synthesis`, `get_record_detail`, `get_scenario_card`, `get_claim_audit`, plus the terminal `emit_card`.

```typescript
{
  name: "get_claim_audit",
  description: "Retrieve a curated receipt that audits a specific factual claim against Toronto Open Data. Use when the user asks 'is X really true', 'fact-check', 'is crime really up', 'what do the numbers actually show', or any question that asks the truth of a quantitative claim about Toronto. Do NOT use for 'what is the candidate's position', 'how did they vote', 'what would happen if'. This tool returns curated reviewed receipts or a no-match response. Never generate audit content yourself.",
  input_schema: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string", description: "The user's verbatim question" },
      topic_hint: {
        type: "string",
        description: "Best-guess topic slug if recognisable: crime-trends, tax-burden, housing-supply, ttc-performance, encampment-response.",
      },
    },
  },
},
```

Returns one of:

```typescript
{ status: "matched", slug: string, topic_short: string, pull_quote: string, anchor?: string }
{ status: "no_match" }
```

### Match algorithm

Mirrors `get_scenario_card`. Keyword-overlap scoring across `topic`, `topic_short`, `pull_quote`, plus the `sub_claim` of each anchor (so a match against a sub-claim returns the most relevant anchor). Topic-hint exact-match boost. Conservative threshold tuned against hand-written test queries (3 per topic, 5 off-topic).

When the query matches a specific sub-claim more strongly than the card overall, the tool returns the anchor as well as the card. The agent's stamp URL becomes `/receipts/<slug>#<anchor>` so the reader lands directly on the relevant exhibit.

### System prompt addition

A new rule (rule 12 if rule 11 is the scenario rule from Sprint 10):

> When the user asks whether a specific factual claim about Toronto is true. Triggers include "is X really up", "fact-check", "what do the numbers show", "is it true that", or any question that contests a quantitative claim. Do NOT trigger on questions about positions, votes, statements, or implications (those use rules 5, 7, or 11). Call get_claim_audit once with the verbatim query and a topic_hint. If matched, emit a single_answer card with the returned pull_quote and one stamp pointing to /receipts/<slug> (or /receipts/<slug>#<anchor> when the tool returns an anchor). If no_match, emit a single_answer card saying the claim has not been audited yet, with a suggestion to ask about a related candidate position. Never generate audit content yourself.

### Receipt rendering

The agent emits a standard `SingleAnswerCard`. No new card type. Existing renderer handles it. The stamp pattern lets the receipt URL (with optional fragment) flow through cleanly.

## Launch corpus

Five cards. Topics locked from the brainstorm.

| Slug | Topic | Sub-claims to address |
|---|---|---|
| `crime-trends` | Crime in Toronto, 2018 to present | Auto theft, violent crime, gun violence, neighborhood comparison |
| `tax-burden` | Toronto's residential tax burden in regional context | Effective rate, comparable cities (Mississauga, Vaughan, Markham, Calgary), trend over term |
| `housing-supply` | Housing starts and pipeline | CMHC starts trend, building permits, Open Door delivered units, affordable share |
| `ttc-performance` | TTC ridership, safety, service | Ridership recovery curve, on-time performance, incidents per million rides, fare evasion |
| `encampment-response` | Encampments, shelter outcomes, Streets to Homes | Streets to Homes placements, shelter occupancy, exits to housing, overdose trends |

Five research subagents will be dispatched (Sprint 10 pattern) to produce markdown outputs containing verbatim attributed claims, Toronto Open Data anchors, and editorial framing. Conversion to JSON happens after.

## Sprint sequencing

Editorial work and engineering parallelise.

- **Phase 1 (engineering, parallel with research):** schema, validator, receipt-loader, ReceiptClaimBlock, ReceiptExhibit, ReceiptCard, ReceiptCardTile components. /receipts index and /receipts/[slug] detail routes. Agent tool wiring. /api/og receipt variant. Methodology page update. Sitemap update. All built against placeholder JSON fixtures.
- **Phase 2 (research lands):** convert the 5 markdown outputs to validated JSON. Visual review on preview deploy.
- **Phase 3 (final wiring):** match-algorithm tuning against real cards. Methodology page update.
- **Phase 4 (ship):** production deploy. Acceptance criteria verification.

## Acceptance criteria

1. All 5 launch receipt cards live at `/receipts/<slug>` and pass Zod schema validation.
2. `/receipts` index lists all 5 cards with topic_short, pull_quote, claim count, last-reviewed date.
3. Each receipt page renders deep-link-able exhibit anchors. Visiting `/receipts/<slug>#<anchor>` scrolls to and highlights the relevant exhibit.
4. Agent's `get_claim_audit` retrieves the correct card for at least 3 hand-written test queries per topic (15 queries total). Returns `no_match` for at least 5 hand-written off-topic queries.
5. When the agent retrieves a card with a clear sub-claim match, it returns an anchor and the stamp URL includes the fragment.
6. `no_match` events log to Redis list `receipts:unmatched`.
7. `/api/og?type=receipt&slug=<slug>` returns image/png with red accent and AUDITED stamp visible.
8. Methodology page updated with the receipt framework and editorial guardrails.
9. Sitemap includes `/receipts` and all 5 `/receipts/<slug>` URLs.
10. Em-dash count across all rendered receipt pages on production: 0.
11. All Vitest suites pass. New tests cover: schema validation (valid card, missing url on claim source, retrieved date before 2024, duplicate anchor IDs, comparables count out of bounds), agent tool (matched per topic with and without anchor, no_match, Redis logging).
12. Launch corpus contains claims attributed to at least two candidates in the race (Bradford and Chow). Verified at publish time.
13. Visual review confirms /receipts is recognisably distinct from /scenarios (red accent, AUDITED stamp, monospace claim text), but inherits the warm-dark Documentary aesthetic.

## Risks and mitigations

- **Defamation exposure.** Naming candidates and quoting them, then publishing data that contradicts them, gets close to "X said Y but Y is false." Mitigation: claim block presents quote and source only, never editorialises. Receipt section presents data and lets data speak. `response_from_source` field provides right of reply. Time-bound to 2024-01-01+ keeps the campaign window narrow. All quotes verbatim with retrievable URLs.
- **Selection bias / partisan appearance.** If receipts only audit one candidate, the site reads as opposition research. Mitigation: corpus-level attribution-balance check at publish time. Operator must include claims from each major candidate. Acceptance criterion 12.
- **Stale data drifting.** Hand-curated cards drift. Mitigation: every anchor displays its `as_of` date prominently; card-level `last_reviewed` and `next_review` make staleness visible. Sprint 13 may add automation if drift becomes a problem.
- **Agent retrieval over-triggering.** Like Sprint 10's rule 11 issue, the receipt rule could over-fire on questions that should hit other tools. Mitigation: rule 12 explicitly excludes "positions", "votes", "statements", "implications" (which route to existing rules). Tested against off-topic queries in acceptance criterion 4.
- **Reader misreads receipts as advocacy.** Mitigation: language tone in the receipt section uses "the data shows X" not "X is wrong." `what_data_cannot_settle` field forces honest acknowledgment of limits. Visual treatment marks audit posture without editorialising.
