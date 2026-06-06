# Sprint 19. "Said vs. Done" Rendering (Position ↔ Vote UI)

**Date:** 2026-06-06
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 18 (which produces `related_votes` on position/pledge dossier records). This sprint renders that data on the web candidate page.

## Goal

Surface the position↔vote pairings from Sprint 18 on the candidate page: under
each topic, show the candidate's stated positions paired with their council
votes on that topic ("Said vs. Done") — quote, then votes as a ledger, evidence
only, reader concludes. This is the agreed follow-up that makes Sprint 18's data
visible.

## Motivation

Sprint 18 added `related_votes` to position/pledge records (1,560 on Bradford
alone), but the candidate page is currently synthesis-only — it renders per-topic
prose and explicitly does not surface records (`// dossier loaded for future
use… not surfaced here yet`). The paired-vote evidence exists in
`web/public/data` but is invisible to readers. This sprint introduces the
record-level "Said vs. Done" surface that displays it.

## Neutrality constraint (inherited)

Evidence pairing, never verdict — consistent with Sprint 18. Each vote's
disposition is stated as plain fact (a neutral outlined "VOTED YES"/"VOTED NO"
mono pill, **not** a green/red approval badge), shown with the motion title,
result, and date, and linked to the council agenda item so the reader interprets
directionality and concludes. No `consistent`/`inconsistent` language, no score,
no badge implying judgment.

## Design

### Surface & placement

On `app/candidates/[slug]/page.tsx`, inside the existing per-topic loop, render a
`<SaidVsDone>` block **after** the synthesis prose of each topic section.

- The page's existing `void getDossier(slug)` becomes a real load of the
  candidate's records.
- A topic with no paired positions renders no block (no empty header).
- A candidate with no paired records anywhere (e.g. McVie) shows no Said-vs-Done
  content at all — the synthesis sections render exactly as today.
- The synthesis prose, header, consistency timeline, and stat strip are
  unchanged.

### Data shaping — `lib/said-vs-done.ts` (pure, tested)

Types:

```ts
export interface RelatedVote {
  agenda_item?: string;
  agenda_item_title?: string;
  vote_disposition?: string;   // "Yes" | "No" | ...
  result?: string;             // "Carried, 24-1"
  vote_date?: string;          // "2024-05-22 10:55 AM"
  vote_description?: string;
  confidence?: number;
}
export interface SaidVsDoneItem {
  shortcode: string;
  summary: string;             // the stated position
  post_date?: string;
  post_url?: string;
  kind: string;                // "position" | "pledge"
  votes: RelatedVote[];        // top maxVotesPerPosition, confidence-desc
  remainingVotes: number;      // count beyond the slice (for the expander)
}
export interface SaidVsDoneTopic {
  items: SaidVsDoneItem[];     // top maxPositions, strength-ranked
  remainingPositions: number;  // count beyond the slice
}
```

`RecordEntry` (in `lib/agent/data-loader.ts`) gains
`related_votes?: RelatedVote[]`.

Function:

```ts
buildSaidVsDone(
  records: RecordEntry[],
  topic: string,
  opts?: { maxPositions?: number; maxVotesPerPosition?: number },  // defaults 3, 3
): SaidVsDoneTopic
```

Behavior:
- Keep records where `kind ∈ {"position","pledge"}`, `topic === topic`, and
  `related_votes` is a non-empty array.
- **Position rank = pairing strength:** primary key = max `confidence` across the
  position's `related_votes`; tiebreak = number of related votes (desc). Slice to
  `maxPositions`; `remainingPositions` = filtered count − slice length.
- **Within a position:** sort `related_votes` by `confidence` desc; slice to
  `maxVotesPerPosition`; `remainingVotes` = total − slice length.
- Empty/missing → `{ items: [], remainingPositions: 0 }`.
- Pure: no I/O, no rendering, deterministic given inputs.

Helper `councilAgendaUrl(agendaItem: string): string` →
`https://secure.toronto.ca/council/agenda-item.do?item=<agendaItem>` (returns
`""` for an empty/undefined id so the component can omit the link).

### Component — `components/SaidVsDone.tsx` (ledger/timeline)

Server component taking `{ topic: SaidVsDoneTopic }` (the controller passes the
already-shaped data; the component does not load or shape). Renders nothing if
`items` is empty. Per item:

- **Said:** a mono dateline (`post_date · kind · @handle ↗` linking `post_url`)
  then the `summary` quote in serif.
- **Done:** an indented, left-ruled timeline (matching `RecordTrailCard`); each
  vote = a neutral outlined mono pill (`VOTED ${disposition.toUpperCase()}`) +
  `agenda_item_title` (serif) + a mono sub-line `result · vote_date[:10] ·
  agenda_item` linking `councilAgendaUrl(agenda_item)`.
- A small **client** sub-component `SaidVsDoneExpander` handles "show N more
  votes" per item and "show all M positions" at the block level (state is
  client-side; the default slice is server-rendered for no-JS/SSR).

Styling reuses existing tokens (`bg-[#1c1813]`, `border-rule`, `text-accent`,
`label`, serif/mono) — no new design system.

### Data flow

```
web/public/data/candidates/<slug>.json (records w/ related_votes from Sprint 18)
        │  getDossierRecords(slug)  (data-loader)
        ▼
app/candidates/[slug]/page.tsx — per topic:
        buildSaidVsDone(records, topic)  →  SaidVsDoneTopic
        ▼
  <SaidVsDone topic={...} />  (ledger render + client expanders)
```

## Error handling

- Record missing `summary` → skipped (a pairing with no stated text isn't
  useful). 
- Vote missing `agenda_item` → render the row without the agenda link (still
  show title/disposition/result/date).
- Vote missing `vote_disposition` → omit the pill (still show the motion + date).
- `related_votes` absent or `[]` → the record isn't a Said-vs-Done item.
- Malformed dossier (no `records`) → `getDossierRecords` already returns `[]`;
  every topic block is empty; page renders synthesis only.

## Testing

`web/tests/said-vs-done.test.ts` (vitest, mirroring `consistency-timeline.test.ts`
style — logic tests, no React render):

- topic filtering: only `position`/`pledge` with matching `topic` and non-empty
  `related_votes` are included; an `action` record with `council_verification` is
  excluded.
- strength ranking: a position whose best vote has higher `confidence` ranks
  above one with more-but-weaker votes; verify order.
- top-N slicing: with 5 qualifying positions and `maxPositions: 3`, `items`
  length 3 and `remainingPositions` 2; with 5 votes and `maxVotesPerPosition: 3`,
  `votes` length 3 and `remainingVotes` 2.
- within-position vote order: votes sorted confidence-desc.
- a `pledge` is included alongside `position`s.
- empty: no qualifying records → `{ items: [], remainingPositions: 0 }`.
- `councilAgendaUrl("2024.CC19.4")` → the expected URL; `councilAgendaUrl("")`
  → `""`.

## Non-goals

- Any consistency verdict, score, or color-coded approval/disapproval.
- Changes to the synthesis sections, candidate header, consistency timeline, or
  stat strip.
- A new route/page (the surface is nested in the existing candidate page).
- Rendering on the chat/receipts surfaces (candidate page only this sprint).
- Re-running the Python matcher or changing Sprint 18 data (the data already
  exists in `web/public/data`).
- Fixing the known intra-day `vote_date` sort nit from Sprint 18 (cosmetic;
  votes here are re-sorted by `confidence`, so it doesn't surface).

## Rollout

1. Add `related_votes` to `RecordEntry` + a `getDossierRecords(slug)` typed
   loader (or confirm the existing records loader is usable) in `data-loader.ts`.
2. `lib/said-vs-done.ts` — `buildSaidVsDone` + `councilAgendaUrl` + tests.
3. `components/SaidVsDone.tsx` + `SaidVsDoneExpander` (client).
4. Wire into `app/candidates/[slug]/page.tsx` per-topic loop.
5. Verify against real data locally (`npm run dev` / build) — Bradford and Chow
   show pairings, McVie shows none.
