# Sprint 9. Redesign and Chat Agent

**Date:** 2026-05-04
**Owner:** ara@thespringteam.ca
**Status:** Approved (verbal). Ready for implementation plan.
**Successor:** Sprint 10 (policy scenario modeling, separate spec to be written after this ships).

## Goal

Transform mayoralrecord.com from a multi-tab dossier site into an ask-and-receipt civic transparency tool. Three primary surfaces. A central command bar with intent chips. A streaming chat-style answer with structured receipt cards. A comparison variant for multi-candidate questions. Documentary type system with editorial drop caps on prose. Vercel Next.js front end backed by an agent that uses the existing Phase 1 through 7 dossier as its only data source.

The product philosophy is "feature rich, low UI." The data stays as rich as it is today (5,905 records, 378 verified council votes, 18 synthesis cells across 2 candidates). The front door simplifies to one chat input and a small set of typographically considered surfaces.

## Context

What is live today at mayoralrecord.com:

- Per-candidate dossier pages at `/bradford` and `/chow` with 10 tabs each (Said vs. Done, Positions, Pledges, Actions, Endorsements, Appearances, Quotes, By Topic, By Neighbourhood, Posts Not Surfaced, Methodology). Dense.
- A landing card grid at `/` listing both candidates.
- An interactive `/issues` page with topic-priority polling and an agenda-gap chart.
- A Pol.is deliberation embed at `/issues/transit-funding/discuss`.
- Static pages: `/privacy`, `/terms`, `/methodology`, `/about`, `/compare` (stub).
- Vercel Functions: `/api/vote`, `/api/aggregate`, `/api/issue-vote`, `/api/issues-aggregate`, `/api/og`.
- Cloudflare Web Analytics beacon, Cloudflare Turnstile, Upstash Redis, Anthropic API integration.
- The data pipeline: triage (Haiku), extraction (Opus), Deepgram transcription, council-vote matching, synthesis. Produces JSON dossiers consumed by the front end.

The pipeline stays. The data layer stays. The front end is rebuilt.

## Non-goals

- No new data sources. No coverage ingestion (news, op-eds, podcasts). That stays Sprint 11 or later.
- No policy scenario modeling. That is Sprint 10.
- No backend pipeline changes (triage, extract, synthesize, match remain as-is).
- No removal of the synthesis editorial review process. Existing gates apply.
- No changes to candidate manifest schema or records.jsonl shape.
- No new candidate onboarding (that is operational work, covered by the runbook).
- No deprecation of `/api/vote` or `/api/issue-vote` at the function level. Their UI surfaces are removed; the endpoints stay running for any future re-introduction.

## Architecture

```
Browser
  |
  v
Next.js 15 (App Router) on Vercel
  |
  +-- Server Components: shell, static pages, surfaced cards
  +-- Client Components: <CommandBar>, <ReceiptStream>, <Stamp>, <DropCap>
  |
  v
/api/ask  (Server-Sent Events, Fluid Compute)
  |
  v
Agent loop: Claude Sonnet 4.6
  |
  Tools (read-only, fast):
    search_records(handle, topic?, query?)
    lookup_council_vote(agenda_item OR keywords+date)
    get_synthesis(handle, topic)
    list_candidates()
    get_record_detail(shortcode)
    list_recent_questions()
  |
  Reads: /public/data/*.json (the candidate dossiers and synthesis cells we already build)
  No new database. No Redis except for rate-limit and recent-questions log.
  |
  v
Stream: tool_use events, then a final structured-card JSON payload
  |
  v
Front end renders verification chips during stream, then resolves into a receipt card
```

Front-end stack: Next.js 15 App Router, Tailwind CSS for system styles, no UI library, no animation library beyond CSS transitions. Bundle target: under 60KB JS for the landing route.

Backend stack: Vercel Functions on Fluid Compute (Node 24). Single new function (`/api/ask`). Existing Sprint 8A functions remain unchanged.

Latency budget. Target under 2 seconds from query submit to first verification chip rendering. Under 5 seconds to the final receipt card. Sonnet runs at roughly 80 tokens per second, with most queries taking 1 to 3 tool round trips. Achievable.

## Design system: Documentary with editorial drop caps

Type:
- Sans: Inter for UI, headings, chrome. 400 / 500 / 600 weights.
- Serif: Source Serif Pro for synthesis prose and any long-form body text. 400 and 700.
- Mono: ui-monospace, SF Mono, Menlo. For section labels, stamps, citation chips, agenda item numbers.

Color:
- Background: `#fbfbf9` (near-white with slight warmth).
- Ink: `#1c1c1c` (near-black).
- Muted: `#5a5a55` (warm gray, for secondary text).
- Accent: `#a07223` (archival ochre). Used sparingly. Section labels, drop caps, hover states, the "verified" stamp tint.
- Stamp neutral: `#f6f3ea` background with `#d8cfbd` border and `#5a4a2a` text.
- Stamp verified: `#fff8eb` background with `#b59238` border and `#7a5e2a` text.
- Success (used only on the "Verified, drafting answer" line): `#1a5b1a`.

Microdetails:
- Drop caps. Source Serif Pro 700. Roughly 32px tall on landing card, 28px on side-by-side comparison columns. Color: ochre. Float left, tight margin. Renders on synthesis prose only. Does not render on factual bullet lists, council vote summaries, or one-line answers.
- Stamps. Uniform shape (rounded 2px, hairline border, mono type, small caps with letterspacing). Two flavors: neutral beige (citation count, source type) and ochre-tinted with star prefix (`★ verified`).
- Section labels. Mono, 9.5px, uppercase, ochre, letter-spacing 0.14em. Examples: `SURFACED FROM THE RECORD`, `KEY POSITIONS`, `WHERE THEY DIVERGE`. Used as the design's primary structural rhythm.
- Section dividers. A 1px hairline between sections. When the divider has a label, the label sits inline within the rule. No box-around-everything approach.
- Geographic micro-mark. The header strip on every page shows `RECORD . 2026-05-04` (left or right) and `43.6532° N . 79.3832° W` (opposite corner). Tiny, ochre, mono. The only Toronto identity signal in the redesigned site.
- No em dashes. Anywhere. Use periods, colons, commas, parentheses. The synthesis SYSTEM_PROMPT must enforce this on generated content (see Phase 5 below).
- Hover states. Underline appears (text-underline-offset 3px), color deepens slightly. 200ms ease.
- No animations beyond fades and underline transitions.

## Phase 1: The invisible landing

Route: `/` (Next.js server component shell with client-component CommandBar and ReceiptStream).

Layout, top to bottom:
1. Header strip. `THE MAYORAL RECORD` (left, mono, ochre). `RECORD . 2026-05-04` and coordinates (right, mono, muted).
2. Title block. Inter 600, 30px. "The Mayoral Record."
3. Tagline. Source Serif italic, 14px, muted. "Toronto's 2026 mayoral race, sourced and queryable."
4. Command bar. White, hairline border, soft shadow. Placeholder: "Ask about a candidate, a topic, or a vote." Right side: `↵ ASK` mono pill in ochre. Press Enter or click the pill to submit.
5. Intent chips, two rows max, centered. Locked labels: `Housing record`, `Transit record`, `Public safety`, `Tax & fiscal`, `Parks & environment`, `Infrastructure`, `Social services`, `Small business`, `Civic engagement`, `Governance & ethics`. Click submits a default query for that topic.
6. Section divider with label. The label `SURFACED FROM THE RECORD` (mono, ochre, uppercase) sits inline on a 1px hairline rule that runs full-width with the label punching through the rule. No glyph dashes around the label.
7. Three surfaced cards in a 1-1-1 grid. Cards rendered server-side from real data. Card types: `Stance evolved`, `Verified vote`, `From the synthesis`. Drop cap renders only on the `From the synthesis` card.
8. Footer. Hairline above. Inter 11px muted gray. "Independent civic-transparency project. No campaign affiliation." Followed by links: Methodology, Privacy, Terms, All candidates.

Surfaced cards are picked at build time (or revalidated hourly) from the existing dossier data:
- `Stance evolved`: pick a candidate-topic cell whose synthesis label is `evolving` or `shifted`. Today: Bradford on transit (evolving since 2023). If none, fall back to a synthesis card.
- `Verified vote`: pick a recent council vote from `data/votes/matches.jsonl` with confidence above 0.95. Pair with the IG record that triggered the match.
- `From the synthesis`: rotate through all synthesis cells. Showcase one Bradford topic and one Chow topic across visits.

When the user submits a query, the surfaced cards animate out (fade) and the receipt card animates in at the same vertical position.

## Phase 2: The receipt card grammar

The agent emits one of three card types as a structured JSON payload at the end of the SSE stream. Type chosen by the model based on query intent.

### Type 1. SingleAnswerCard

```ts
type SingleAnswerCard = {
  type: "single_answer";
  query_restated: string;          // "How did Bradford vote on the watercraft ban?"
  answer: string;                  // "Bradford voted YES on motion 2024.GG12.7..."
  evidence: Stamp[];
  context?: {                      // optional, drop-cap'd Source Serif paragraph
    body: string;
    citations: string[];           // shortcodes referenced in body
  };
  follow_ups: string[];            // 3 to 4 chip labels
};

type Stamp = {
  label: string;                   // "COUNCIL . 2024.GG12.7"
  href: string;                    // primary source URL
  flavor: "neutral" | "verified";
  icon?: "council" | "ig" | "video" | "verified";
};
```

Renders as: query restate, verification trail (see Phase 3), then a card with Answer (one line, Inter 600 22px), evidence stamps row, optional Context section with drop cap on the Source Serif body, follow-up chips at the foot.

### Type 2. ComparisonCard

```ts
type ComparisonCard = {
  type: "comparison";
  query_restated: string;
  candidates: ComparisonCandidate[];   // 2 to N (N = all primary candidates)
  topic: string;                       // "Housing", "Transit", etc.
  divergences: {                       // 2 to 3 bullets, the editorial value
    headline: string;                  // bold lead-in
    body: string;                      // sentence after the headline
  }[];
  follow_ups: string[];
};

type ComparisonCandidate = {
  slug: string;
  display_name: string;
  consistency_dot: "green" | "yellow" | "red" | "gray";
  consistency_label: string;           // "Evolving since 2023", "Consistent since 2014"
  record_count: number;
  summary: string;                     // 80-150 word synthesis, drop-cap'd
  key_positions: { stance: string; citations: string[] }[];   // 3 max
  council_votes: { vote: "YES" | "NO" | "ABSENT"; agenda_item: string; title: string }[];  // 3 max
  evidence: Stamp[];                   // per-candidate stamps
};
```

Renders as: query restate, collapsed verification trail (`Verified. N sources cross-referenced.`), then a card with:
- Editable candidate-selector at top (chips with × to remove, + to add, topic switcher inline).
- Candidate column headers with consistency dot, label, record count.
- "Where they diverge" section with the divergences list in Source Serif.
- Side-by-side rows: Summary (drop cap on each), Key positions (numbered citations), Council votes.
- Evidence row with all candidates' stamps merged.
- Follow-up chips.

Layout. Two candidates: 50/50 columns. Three candidates: 33/33/33. Four or more: horizontally scrollable column band, each column min-width 280px. Beyond 3 candidates the agent should also offer a `Pivot to topic-by-topic view` follow-up chip.

### Type 3. RecordTrailCard

For queries that require showing the work over time. "How has Bradford's housing position evolved?" or "Show me everything Chow said about transit in 2024."

```ts
type RecordTrailCard = {
  type: "record_trail";
  query_restated: string;
  theme: string;                       // "Bradford's housing positions, 2018 to present"
  entries: TrailEntry[];               // chronological
  follow_ups: string[];
};

type TrailEntry = {
  date: string;                        // ISO
  label: string;                       // "Position", "Pledge", "Council vote", "Action"
  body: string;                        // one sentence
  evidence: Stamp[];
};
```

Renders as: query restate, verification trail, then a vertical timeline. Each entry: date in mono on the left, body in Source Serif on the right, stamps below. Connected by a hairline timeline rule. Used sparingly. The agent should default to SingleAnswerCard or ComparisonCard unless the query explicitly asks for trail or evolution.

### Schema validation

The front end validates the agent's payload against the type definitions on receive. Invalid payloads render a `Could not produce a sourced answer` fallback with a `Try a different question` chip and the original query restated. The fallback is the only acceptable failure mode. No "I'm an AI" apologies.

## Phase 3: The verification agent

The agent loop runs in `/api/ask` as a Vercel Function with SSE streaming.

Tools (read-only, fast):

```ts
// Search records.jsonl across all primary candidates (or one).
search_records({
  handle?: string,                     // omit for all
  topic?: string,                      // one of VALID_TOPICS
  query?: string,                      // free-text for fuzzy match against summary/source_quote
  kind?: "position" | "pledge" | "action" | "endorsement" | "appearance" | "quote",
  limit?: number,
}) → { records: Record[], total: number };

// Look up a council vote by agenda item or keywords + date window.
lookup_council_vote({
  agenda_item?: string,                // e.g., "2024.GG12.7"
  councillor_handle?: string,
  keywords?: string,
  date_window_days?: number,           // default 90
}) → { votes: CouncilVote[], total: number };

// Fetch a synthesis cell.
get_synthesis({ handle: string, topic: string }) → SynthesisCell;

// List all primary candidates with their landing-card data.
list_candidates() → CandidateManifest[];

// Get full detail for one record by shortcode.
get_record_detail({ shortcode: string }) → Record;

// Recent reader questions (for the surfaced cards on landing, and for the agent
// to suggest follow-ups based on what others are asking).
list_recent_questions({ limit?: number }) → string[];
```

Each tool reads from `/public/data/*.json` files generated by the existing build pipeline. No new database. No live network calls beyond the Anthropic API itself.

Stream events emitted by `/api/ask`:

```ts
{ type: "tool_call", tool: string, args: object, status: "running" }
{ type: "tool_call", tool: string, args: object, status: "complete", result_summary: string }
{ type: "tool_call", tool: string, args: object, status: "error", message: string }
{ type: "card", payload: SingleAnswerCard | ComparisonCard | RecordTrailCard }
{ type: "done" }
```

The front end renders each `tool_call` event as a verification chip:
- Running: ochre arrow prefix, status text in muted gray, no result summary yet.
- Complete: ochre arrow prefix, status text in ink, result summary in mono on the right (e.g., "3 hits", "1 match").
- Error: red prefix, error message in muted gray, retry button.

After `card` arrives, the verification trail collapses to a single line: `✓ Verified. N sources cross-referenced.` with a `SHOW TRAIL ↓` mono pill on the right. Click expands to a scrollable list of all tool calls made.

Trail length. The verification trail is unlimited but rendered in a max-height-300px scrollable container. For typical queries (1 to 3 tool calls) this never scrolls. For complex comparison queries (5 to 8 tool calls) it scrolls within the container without inflating the card height.

Confidence and hedging. The agent should not output speculative claims. If a query asks for prediction or speculation ("will X be elected", "would this policy work"), the agent responds with a SingleAnswerCard whose answer is "This site documents what candidates have said and how they have voted. It does not predict outcomes." with follow-up chips offering related sourced questions.

## Phase 4: Migration plan

Routes:
- `/` New landing.
- `/candidates/[slug]` Per-candidate deep-dive page. Reachable via the `Show full record` follow-up chip. Renders the existing per-candidate dossier in the new aesthetic. Less prominent than today (no longer the default landing target, but accessible for users who want to read).
- `/privacy`, `/terms`, `/methodology`, `/about` Existing pages, restyled in Documentary aesthetic. Content unchanged.
- `/issues` Deprecated as a UI. The interactive polling and gap chart go away. The `/issues` URL redirects to `/?q=Compare+candidates+on+issues`. The agent answers with a ComparisonCard.
- `/issues/transit-funding/discuss` Preserved. The Pol.is deliberation surface stays as-is.
- `/sitemap.xml`, `/robots.txt` Regenerated to reflect the new routes.
- `/api/og` Continues. Updated to handle `?type=answer&q=...` for share-the-answer social cards.
- `/api/ask` New (this sprint).
- `/api/vote`, `/api/aggregate`, `/api/issue-vote`, `/api/issues-aggregate` Continue running. Removed from the UI. Could be re-surfaced later if useful.

URL redirects (in `vercel.json` or middleware):
- `/bradford` → `/candidates/bradford`
- `/chow` → `/candidates/chow`
- `/compare` → `/?q=Compare+candidates`

The current vanilla HTML site at `site/` is replaced by a Next.js app. Implementation order:
1. Scaffold a new `web/` directory at the repo root with Next.js 15 App Router.
2. Port the static pages (privacy, terms, methodology, about) as Next.js pages with the Documentary system.
3. Build the landing route with Server Components for the shell and surfaced cards, Client Components for CommandBar and the ReceiptStream.
4. Build `/api/ask` and the agent tools.
5. Build the per-candidate `/candidates/[slug]` deep-dive page.
6. Update Vercel project to deploy `web/` instead of `site/`.
7. Set up the redirects.
8. Archive the existing `site/` directory in git history. Move it to `legacy-site/` on disk for one sprint as a safety net, then delete in Sprint 11.

The `build_site.py` pipeline still runs and produces JSON dossiers. The output path changes from `site/candidates/<slug>.json` to `web/public/data/candidates/<slug>.json`. The synthesis cells move to `web/public/data/synthesis/<handle>/<topic>.json`. Same data, new home.

## Phase 5: Synthesis prompt updates

The current synthesis SYSTEM_PROMPT permits em dashes in the model's output. Several published synthesis paragraphs use them. With the no-em-dash rule locked in, we need to:

1. Add a rule to SYSTEM_PROMPT in `scripts/lib/synthesis.py`:
   > "Never use em dashes (the U+2014 character). Use periods, colons, commas, or parentheses instead. En dashes for date ranges (2018 to 2022) and hyphens are fine."
2. Bump the prompt. SYSTEM_PROMPT_HASH changes. All 18 synthesis cells regenerate on next batch run. Cost: roughly $10.
3. Update `docs/methodology` (the synthesis prompt is published verbatim there) with the new prompt text.
4. Document this rule in the runbook.

This is a small task included in Sprint 9 (rather than left for later) because the new front end surfaces synthesis content prominently and we want it clean from day one.

## What survives, what dies, what is new

| Layer | Survives | Dies | New |
|---|---|---|---|
| Data | All 5,905 records, 378 council matches, 18 synthesis cells, manifests, the build pipeline, `data/votes/matches.jsonl`, `data/<handle>/synthesis/*.json` | Nothing | Static JSON dossiers under `web/public/data/` |
| Frontend | Privacy, Terms, Methodology, About content (restyled), Pol.is deliberation page | 10-tab dashboards, voting widgets, Pol.is link prominent on landing, agenda-gap chart, issue-priority polling UI, landing card grid, all current chrome (TTC red, CN Tower, subway stripe, brand-overline, double header) | Next.js App Router, command bar, intent chips, three receipt card types, verification chip stream, Documentary type system |
| Backend | Vercel Functions (Fluid Compute), Upstash Redis (rate limiting, recent-questions log), Cloudflare Turnstile (now gates `/api/ask`), `/api/vote`, `/api/aggregate`, `/api/issue-vote`, `/api/issues-aggregate`, `/api/og` | Nothing at the function level. Some functions have no UI surface but stay deployed. | `/api/ask` (streaming SSE), agent tool definitions, query log writer |
| Brand | "The Mayoral Record" word-mark, the no-affiliation disclaimer | TTC red, CN Tower, subway stripe, the heavy editorial chrome | Quiet sans-serif word-mark, archival ochre accent, geographic micro-mark, drop caps on prose |
| Operations | Runbook, editorial-review checklist, methodology disclosure, Cloudflare Web Analytics | Nothing | Updated runbook entries for the new endpoints, agent tool catalog |

## Risks and tradeoffs

1. **Discoverability cliff.** A chat-first interface with no obvious browse path can leave first-time visitors empty-handed. Mitigations: the 10 intent chips, the 3 surfaced cards, the follow-up chips on every receipt. Plan to telemetrize empty-result rates and iterate the chip set in the first weeks after ship.
2. **Runtime accuracy as a new risk.** Today the synthesis is reviewed before deploy. With ask-and-respond, every answer is fresh. Mitigations: the verification trail makes the work visible, every claim is stamped to a source the user can self-check, the agent declines to predict, the schema validation catches malformed responses.
3. **LLM cost is per-question now, not per-build.** Sonnet 4.6 at roughly $0.003 per query, expecting 1,000 queries per day, lands around $90 per month. Modest. Still want a per-IP rate limit (Turnstile + Upstash). Beyond a cost ceiling, fall back to a queue or a "high traffic, please try again" message.
4. **Migration risk.** Existing inbound links to `/bradford` and `/chow` need to keep working. Redirects must land before the new site goes live. Existing `og:image` URLs from social-card cache may serve stale images for hours; acceptable.
5. **Editorial review process must adapt.** The 4-check pass on synthesis paragraphs (`docs/editorial-review.md`) still applies before each batch regen. New: spot-check the agent's answers in the first week. Save chat transcripts to a private log we can audit.
6. **Pol.is integration.** Currently linked from the deprecated `/issues` page. After Sprint 9 the deliberation page has no inbound link from the landing or chat. Either (a) add a `Open the deliberation on transit funding` follow-up chip when relevant, or (b) accept that the deliberation surface gets lower traffic. Default position: (a), low-effort.
7. **The 10 intent chips are aliases for default queries.** When clicked, they submit something like "Show all candidates' positions and votes on housing." That implies a ComparisonCard response with all primary candidates. As more candidates declare, the chip query stays the same; the result widens. Keep this in mind when scaling beyond 3 candidates.

## Acceptance criteria

Sprint 9 is "done" when:

1. mayoralrecord.com loads with the new Documentary-aesthetic landing (CommandBar, 10 intent chips, 3 surfaced cards rendered from real data, footer with Privacy/Terms/Methodology/All-candidates links).
2. Submitting a query in the CommandBar streams verification chips into the page, then renders a SingleAnswerCard, ComparisonCard, or RecordTrailCard.
3. All three card types render correctly for representative test queries.
4. Each of the 10 intent chips submits a default ComparisonCard query for its topic.
5. Surfaced cards on landing show real data (no placeholders).
6. Stamps link to primary sources (council vote URL or Instagram URL).
7. The comparison receipt allows adding/removing candidates and switching topics inline.
8. `/candidates/bradford` and `/candidates/chow` render as deep-dive pages reachable via follow-up chips.
9. `/bradford` redirects to `/candidates/bradford`. Same for chow.
10. `/privacy`, `/terms`, `/methodology`, `/about` rendered in Documentary aesthetic with content preserved.
11. `/issues` redirects to a chat query. `/issues/transit-funding/discuss` preserved.
12. `/sitemap.xml` regenerated. `/robots.txt` updated.
13. `/api/og` continues working. New variant `?type=answer&q=...` available.
14. Cloudflare Web Analytics beacon fires on every public page.
15. Cloudflare Turnstile gates `/api/ask` (silent challenge, same pattern as the deprecated vote endpoints).
16. No em dashes anywhere in copy or generated content.
17. Synthesis SYSTEM_PROMPT updated to forbid em dashes; all 18 cells regenerated.
18. Existing tests pass. New tests cover: agent tool implementations (search_records, lookup_council_vote, etc.), card-shape schema validation, the no-em-dash linter on built HTML.
19. Operator review of the live site confirms: no UI dead-ends, no 500s on common queries, no synthesis paragraphs containing em dashes.

## Open considerations

1. **Agent system prompt for `/api/ask`.** Will need its own carefully-tuned prompt that mirrors the synthesis prompt's discipline: positions only, no character claims, no speculation, every claim cited, no em dashes. Draft included as part of Sprint 9 implementation.
2. **Recent-questions log.** Whether to surface "247 questions answered this week" with a recent-five list. Privacy concern: even anonymized, surfacing other readers' questions can shape what new readers ask. Default position: log on the back end for our analytics, do not surface in the UI in Sprint 9. Revisit if the discoverability data suggests it would help.
3. **Mobile vs. desktop.** The wireframes are desktop-first. Mobile breakpoints: stack column-headers vertically, collapse the comparison rows into accordion sections, surfaced cards stack to one column. Address in implementation, not in the spec.
4. **Pol.is page styling.** The deliberation page at `/issues/transit-funding/discuss` has its own Pol.is iframe. We restyle the surrounding chrome (header, tagline, footer) to match Documentary. The iframe itself is Pol.is's responsibility.
5. **Voting widget API endpoints.** Not removed but no UI references them after Sprint 9. Decision deferred. Could be re-introduced as agent-callable ("show me what readers think about X") in Sprint 11+.
6. **Dark mode.** Out of scope. The Documentary aesthetic is designed light-only. If users want dark mode in the future, that is a separate Sprint.
7. **Internationalization.** Out of scope. Site is English-only. The pipeline already handles French content within records (Opus is multilingual), but the UI chrome stays English.
