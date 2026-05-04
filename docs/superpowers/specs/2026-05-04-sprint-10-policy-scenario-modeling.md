# Sprint 10. Policy Scenario Modeling

**Date:** 2026-05-04
**Status:** Spec. Ready for implementation plan.
**Idea doc:** `docs/superpowers/ideas/2026-05-04-sprint-10-policy-scenario-modeling.md`
**Builds on:** Sprint 9 redesign (`docs/superpowers/specs/2026-05-04-sprint-9-redesign.md`).

## Goal

Help readers reason about what candidate positions actually mean by surfacing curated, evidence-backed analysis of comparable jurisdictions, status-quo context, and incidence research. Ship 5 launch scenario cards plus the infrastructure to publish more weekly.

## Motivation

The current site stops at "what they said + what they voted." A reader looking at "cut development charges 25 percent" or "city as developer" gets candidate language but no help reasoning about what those mechanisms actually deliver, to whom, on what timeframe. Sprint 10 adds a curated layer: structured policy scenario cards that surface incidence research, status-quo context, comparable jurisdiction outcomes, and (where literature supports) plural projections, all under hard editorial discipline so the layer never becomes advocacy.

## Non-goals

This sprint explicitly does NOT include:
- Agent-generated modeling content. Every word a reader sees is curated and reviewed.
- Mega-cards spanning more than one issue. One card per topic.
- News or op-ed coverage ingestion (slated for a later sprint).
- Pol.is integration on scenario cards. The /scenarios surface is read-only at launch.
- Email digests of unmatched queries. Pull model only at launch.
- Data visualizations on cards. Text plus numerical citations only at launch. Charts are a later iteration if the format lands.
- Multi-issue comparison views. Each card is self-contained.

## Architecture

### New routes and surfaces

- `/scenarios`. Index page listing all live scenario cards. Documentary type system. Each card shown as a small tile with topic, pull-quote, last-reviewed date, next-scheduled-review date.
- `/scenarios/[slug]`. Full ScenarioCard render at canonical URL. Server Component. Loads JSON via the existing data-loader pattern.
- `/admin/scenario-requests`. Shared-secret-gated admin page. Lists deduped Redis-logged unmatched queries with frequency counts. "Promote to card skeleton" button generates a JSON skeleton at `web/public/data/scenarios/<slug>.json` for the operator to fill out.
- `/api/og?type=scenario&slug=<slug>`. Extends existing `/api/og` route to render scenario card OG images.
- `/methodology`. Existing route updated with 4-tier source system explanation and scenario card framework.

### New code surfaces

- `web/lib/scenario-types.ts`. TypeScript interfaces and Zod validator for ScenarioCard JSON.
- `web/lib/scenario-loader.ts`. List and get scenario cards. Mirrors `web/lib/agent/data-loader.ts` pattern.
- `web/components/ScenarioCard.tsx`. Full card renderer (Layout B with Who-Benefits leading, tabbed comparables).
- `web/components/ScenarioCardTile.tsx`. Small tile for the index page.
- `web/components/ScenarioComparableTabs.tsx`. Client component for the tabbed comparables UI.
- `web/lib/agent/scenario-tool.ts`. Implementation of `get_scenario_card`. Topic-fuzzy match plus Redis logging on no-match.
- `web/lib/agent/system-prompt.ts`. Updated to mention scenario retrieval flow.
- `web/lib/agent/tool-schemas.ts`. Adds `get_scenario_card` to TOOL_SCHEMAS (the agent's 7th tool).
- `web/app/api/admin/scenario-requests/route.ts`. Admin endpoint returning deduped Redis-logged query list.
- `web/app/api/admin/promote-to-skeleton/route.ts`. Admin endpoint that generates a skeleton JSON file from a query.
- `web/app/api/og/route.ts`. Extends to handle `type=scenario`.

### Data flow

1. Operator authors `web/public/data/scenarios/<slug>.json`. Schema-validated at build.
2. `/scenarios` renders the index by listing all valid JSON files at the path.
3. `/scenarios/[slug]` renders the full card via the ScenarioCard component.
4. Reader asks chat agent a "what does this mean?" question. Agent recognises a modeling question, calls `get_scenario_card` with topic hint and verbatim query.
5. Tool matches against the corpus. On match: returns `{ status: "matched", slug, topic_short, pull_quote }`. Agent emits a `SingleAnswerCard` whose answer is the pull-quote and which links to `/scenarios/[slug]`.
6. On no match: tool logs `{ query, timestamp, agent_reasoning, ip_hash }` to Redis list `scenarios:unmatched`, returns `{ status: "no_match" }`. Agent emits a `SingleAnswerCard` saying "this hasn't been modeled yet" with a request-this-scenario CTA.
7. Operator periodically reviews `/admin/scenario-requests`, promotes high-frequency or high-value queries to JSON skeletons. Operator runs deep research in Claude Desktop, fills the skeleton, opens a PR, deploys.

## Data model

### TypeScript shape

```typescript
// web/lib/scenario-types.ts

type Tier = "T1" | "T2" | "T3" | "T4";

interface Citation {
  tier: Tier;
  label: string;
  url?: string;
  retrieved?: string;
}

interface CandidatePosition {
  candidate_handle: string;
  candidate_name: string;
  summary: string;
  citations: Citation[];
}

interface Mechanism {
  candidate_handle: string;
  summary: string;
}

interface Comparable {
  name: string;
  period: string;
  summary: string;
  outcome: string;
  citations: Citation[];
  caveats: string;
}

interface Projection {
  scenario_label: string;
  range_or_value: string;
  citation: Citation;
  notes?: string;
}

type ProjectionsBlock =
  | { kind: "plural"; intro: string; items: Projection[] }
  | { kind: "thin"; rationale: string };

interface ScenarioCard {
  slug: string;
  topic: string;
  topic_short: string;
  pull_quote: string;

  who_benefits: {
    intro: string;
    mechanisms: Mechanism[];
    literature_row: Citation[];
  };

  positions: CandidatePosition[];

  status_quo: {
    summary: string;
    existing_policy_stack: { label: string; citations: Citation[] }[];
    citations: Citation[];
  };

  comparables: Comparable[];

  projections: ProjectionsBlock;

  time_horizon?: string;

  meta: {
    last_reviewed: string;
    next_review: string;
    methodology_notes?: string;
  };
}
```

### Validation invariants

Enforced by Zod at JSON load time. Failed validation blocks the build.

- `slug` matches `/^[a-z0-9-]+$/` and is unique across the corpus.
- `pull_quote` non-empty, between 40 and 400 characters.
- `who_benefits.mechanisms.length >= 1`.
- `positions.length >= 1`. Each `candidate_handle` resolves to a directory present under `web/public/data/`. New candidates are ingested (their dossier directory created) before they can appear in scenario card JSON. This couples scenario authoring to the existing candidate ingestion path rather than maintaining a separate allowlist.
- `comparables.length >= 3 && <= 5`.
- If any citation in the card has `tier: "T4"`, `meta.methodology_notes` is non-empty.
- No em dash character (U+2014) anywhere in any string field. Programmatic guard mirrors the Sprint 9 synthesis em-dash check.
- `meta.last_reviewed` and `meta.next_review` are ISO 8601 dates. `next_review` is after `last_reviewed`.
- Every `Citation.tier` value is in `{T1, T2, T3, T4}`.

### File layout

- `web/public/data/scenarios/housing-supply-mechanism.json`
- `web/public/data/scenarios/transit-operating-funding.json`
- `web/public/data/scenarios/property-tax-stance.json`
- `web/public/data/scenarios/public-safety-approach.json`
- `web/public/data/scenarios/climate-parks-investment.json`

## Visual design

Layout B from the brainstorm session: Who-Benefits leads, candidate positions follow, status quo with existing policy stack, tabbed comparables, optional projections, optional time horizon.

### Card section order

1. Header. Topic statement (Source Serif Pro, 30px). Meta line (last reviewed, next review).
2. Who Benefits panel. Tinted background (#f5f2ea), 4px ochre left border. Two-column candidate-mechanism layout. Literature citation row at the bottom.
3. Candidate positions. Two-column or N-column flex layout. Source Serif headings, Inter body, citation row per candidate.
4. Status quo. Single full-width section. Prose paragraph, then bulleted "existing policy stack" list, then citation row.
5. Comparable jurisdictions. Tabs (one per jurisdiction). One jurisdiction visible at a time. Active tab has ochre top border. Tab content shows summary, outcome, caveats, citations.
6. Projections. Either plural projections list (each with label, range or value, citation) or the explicit "thin literature" rationale.
7. Time horizon. Single sentence, when present.
8. Footer. Methodology link, next-review date, share link.

### Source-tier badge treatment

- T1: ochre border (#a07223), ochre text. Highest evidentiary weight.
- T2: default ink (#1c1c1c) border and text.
- T3: default ink border and text. Same visual weight as T2.
- T4: muted gray (#5a5a55) border, muted text, slightly darker tinted background (#f0eee8). Visually quieter to signal "in-house, lower weight."

Badges are rendered as inline-block monospace pills with 1px border, 2px padding, uppercase. Same component used inline within citation rows.

### Index page tile

Each tile shows: topic_short, pull_quote (truncated to ~140 chars), last_reviewed date as a monospace label. Tile is a link to `/scenarios/[slug]`. Hover state: 1px ochre border. Tiles arranged in a 2-column grid on desktop, single column on mobile.

### OG images

`/api/og?type=scenario&slug=<slug>` renders an OG image with topic_short as the headline (Source Serif Pro, large) and pull_quote as the subhead, on the Documentary palette. Mirrors the existing landing/candidate OG patterns.

## Source-tier system

Cited in `/methodology` page. Each tier represents a different evidentiary weight.

- **T1. Primary government data.** City of Toronto budget documents, Auditor General reports, Statistics Canada releases, CMHC data, planning department published data, federal and provincial budget documents.
- **T2. Independent analysis.** Wellesley Institute, IMFG, OECD, CHRA, Toronto Region Board of Trade, Conference Board, BIA-commissioned studies, investigative journalism with traceable primary sources.
- **T3. Peer-reviewed academic.** DOI-bearing journal articles only.
- **T4. Mayoral Record extrapolation.** In-house arithmetic or projection. Used rarely. Requires an explicit methodology paragraph (`meta.methodology_notes` field) describing assumptions, inputs, and limits.

The reader can dismiss a T4 claim more aggressively than a T1 claim. The visual treatment of badges reinforces this gradient.

## Editorial workflow

### Card authoring

1. Operator runs deep research in Claude Desktop using the prompt files at `research/sprint-10/`. One run per card.
2. Brings back Markdown output.
3. Markdown is converted to JSON at `web/public/data/scenarios/<slug>.json` (one-shot conversion either by operator or by Claude in the engineering session).
4. Schema validation runs at build. Zod failures block the deploy.
5. Operator opens preview deploy, reads the card on `/scenarios/[slug]`, edits inline if anything reads off.
6. Merge to main. Production deploy. `meta.last_reviewed` updated to merge date.

### Unmatched query backlog

1. Reader asks chat agent a modeling question.
2. Agent calls `get_scenario_card`. No match found.
3. Tool logs `{ query, timestamp, agent_reasoning, ip_hash }` to Redis list `scenarios:unmatched` (capped to last 1000 entries).
4. Operator visits `/admin/scenario-requests`. Page lists last 100 deduped queries with frequency counts and agent_reasoning excerpts.
5. Operator clicks "promote to skeleton" on a high-value query. System generates `web/public/data/scenarios/<proposed-slug>.json` with topic, slug, and pull_quote stub plus empty other fields.
6. Operator opens a Claude Desktop research run on the new topic, fills the skeleton, deploys.

### Editorial cadence

- Sprint 10 ships all 5 launch cards on day one.
- Post-launch, target one new card per week. Cadence reflected on `/scenarios` index via the `next_review` date on each card.
- Quarterly review cycle on existing cards: `next_review` date triggers a refresh pass to update outdated comparables, add new literature, refresh `last_reviewed` date.

## Agent integration

### Tool schema

Adds a 7th tool to the agent's existing 6 read-only tools.

```typescript
{
  name: "get_scenario_card",
  description: "Retrieve a curated policy scenario card for the user's question. Use when the user asks 'what would this mean', 'who benefits', 'what would happen if', or any question that asks about implications of a candidate's position rather than what they said. Never generate modeling content yourself; this tool returns curated, reviewed cards or a no-match response.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The user's verbatim question" },
      topic_hint: {
        type: "string",
        description: "Best-guess topic slug, if recognisable: housing-supply-mechanism, transit-operating-funding, property-tax-stance, public-safety-approach, climate-parks-investment, or null"
      }
    },
    required: ["query"]
  }
}
```

Returns one of:

```typescript
{ status: "matched", slug: string, topic_short: string, pull_quote: string }
{ status: "no_match" }
```

### Match algorithm

Implementation choice for the plan phase. Constraints:
- Deterministic (same input always returns same result).
- Fast (< 100ms; runs inside agent loop).
- Conservative on matches (better to return no_match and log than to match the wrong card).

Likely approach: keyword overlap scoring across `topic`, `topic_short`, and `pull_quote` fields, plus a topic-hint exact-match boost. Threshold tuned against the 15 hand-written test queries (3 per topic).

### Agent system prompt update

Adds a section explaining when to call `get_scenario_card`:

> **When the user asks about implications.** Questions like "what would this mean," "who benefits," "what would happen if," "how does this compare to," or "is this realistic" are scenario-modeling questions. Call `get_scenario_card` with the verbatim query and your best-guess topic hint. If matched, emit a `SingleAnswerCard` whose answer body is the returned `pull_quote`, with a single Stamp linking to `/scenarios/[slug]` (label: "Read full scenario card"). If `no_match`, emit a `SingleAnswerCard` saying the question hasn't been modeled yet and offering to log the request.

### Receipt rendering

The agent emits standard `SingleAnswerCard` shape. No new card type. The renderer detects a scenario stamp via the URL pattern and renders the stamp with the existing `verified` flavour and a "scenario" icon glyph.

## Launch corpus

Five cards in Bradford-vs-Chow signature topics. Schema is N-candidates from day one; future entrants get added to existing cards as content tasks.

| Slug | Topic |
|---|---|
| `housing-supply-mechanism` | City as developer, or private-sector primary? |
| `transit-operating-funding` | TTC operating cost and revenue tools 2026 to 2034 |
| `property-tax-stance` | Restraint vs at-or-above-inflation residential tax direction |
| `public-safety-approach` | Policing and enforcement vs community and harm reduction |
| `climate-parks-investment` | Parks, ravines, climate-resilience infrastructure |

Research prompts at `research/sprint-10/01-housing-supply-mechanism.md` through `research/sprint-10/05-climate-parks-investment.md`.

## Editorial constraints (encoded in the schema and the prompts)

- No em dashes anywhere. Periods, commas, colons, or parentheses instead.
- Evidence-based language. "Research on X incidence finds Y%" not "X benefits group Z."
- Both candidates analysed under the same framework. Same questions asked of each mechanism.
- When literature is mixed or thin, say so explicitly. Plural projections only when the literature supports a confident range. The "thin literature" projections shape exists exactly for this case.
- Real citations only. Real authors, real years, real DOIs/URLs.
- Comparable jurisdictions caveats are explicit (legal regime, scale, time-period mismatch).

## Acceptance criteria

Each item testable against production state.

1. All 5 launch cards live at `/scenarios/<slug>` and pass Zod schema validation.
2. `/scenarios` index page lists all 5 cards with topic_short, pull_quote, last_reviewed date.
3. Agent's `get_scenario_card` tool retrieves the correct card for at least 3 hand-written test queries per topic (15 queries total). Returns `no_match` for at least 5 hand-written off-topic queries.
4. `no_match` events log to Redis list `scenarios:unmatched`. List capped at 1000 entries.
5. `/admin/scenario-requests` page renders deduped query list with frequency counts when authenticated; returns 401 otherwise.
6. `/admin/promote-to-skeleton` endpoint generates a valid (validation-passing) skeleton JSON file when called with a query and proposed slug.
7. `/api/og?type=scenario&slug=<slug>` returns image/png at 1200x630 with topic_short and pull_quote rendered in the Documentary palette.
8. Methodology page updated with 4-tier source system explanation and scenario framework.
9. Sitemap includes `/scenarios` and all 5 `/scenarios/<slug>` URLs.
10. Em-dash count across all rendered scenario pages on production: 0 (verified via curl + grep).
11. All Vitest suites pass. New schema validator tests cover at least: valid card, missing required field, invalid tier value, em-dash content, T4 without methodology_notes, comparables count out of bounds.
12. New agent-tool tests cover at least: matched query for each launch topic, no_match query, Redis logging on no_match.
13. Scenario card rendered HTML on production passes a manual editorial review of all 5 cards before launch.

## Sprint sequencing

Editorial work and engineering work parallelise. The deep research runs are the long pole.

- Phase 1 (engineering, parallel with research): scaffold schema, validator, scenario-loader, ScenarioCard component, ScenarioCardTile, /scenarios index, /scenarios/[slug], /api/og scenario variant, agent tool wiring, admin page. All built against placeholder JSON fixtures matching the schema.
- Phase 2 (research lands): convert the 5 Markdown research outputs to validated JSON. Visual review on preview deploy.
- Phase 3 (final wiring): agent tool match-algorithm tuning against real cards. /admin/scenario-requests on real Redis. Methodology page update.
- Phase 4 (ship): production deploy. Acceptance criteria verification on production.

## Risks and mitigations

- **LLM confabulation in deep research outputs.** Mitigation: prompt files force tier-tagged citations and a self-check; conversion to JSON validates citation structure; manual editorial review before launch.
- **Implicit framing via comparable jurisdiction selection.** Mitigation: each card includes 3-5 comparables across different policy theories where literature exists (Vienna and Houston for housing represent opposed theories), and caveats are explicit. The prompt files require this.
- **False precision in projections.** Mitigation: `ProjectionsBlock` is a discriminated union with a "thin" shape. The schema makes "no singular projection published" a first-class output. Prompts enforce plural-only.
- **Reader misreads "Who Benefits" as advocacy.** Mitigation: language tone reviewed in the brainstorm session ("research finds N% capitalises into land values" vs "Bradford's policy benefits developers"). Visual panel treatment makes it the leading section but the citation row at its bottom signals evidentiary grounding.
- **Editorial burden of 5 cards in one sprint.** Mitigation: deep research runs parallelise, prompts are self-contained, conversion is mechanical. If a card runs over, defer to weekly drop and ship 4 of 5 on launch day rather than fabricate the 5th. Document the deferred card in the launch announcement.
- **Schema drift after launch.** Mitigation: Zod validator is the single source of truth and runs at build time on every JSON file. Adding a field is a code+content change in one PR.
