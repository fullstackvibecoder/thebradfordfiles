# Homepage Editorial Redesign — Design Spec

**Date:** 2026-07-02
**Topic:** Restructure The Mayoral Record homepage (below the ask box) into an editorial front page with real visual hierarchy.
**Scope:** `web/` Next.js frontend only. No pipeline/data-schema changes.

---

## Problem

The current homepage below the ask box is three disconnected widgets stacked in a narrow centered column: a Featured comparison carousel (780px), topic Chips (680px), and a "Surfaced from the record" grid (840px). On the live site (confirmed via screenshots, both skins) this reads as:

1. **No visual hierarchy** — every element is the same low contrast; the eye lands nowhere.
2. **Wasted hero** — large vertical void around a small title + thin-outline ask box.
3. **Dead space** — ~800px content in a ~2000px viewport → large empty side margins.
4. **Broken Surfaced grid** — 3-column grid with only 2 cards leaves an empty third column; card heights are wildly uneven (one wall of text, one 3-liner) → ragged bottom, no truncation.
5. **Three widgets, not one page** — three widths, three headers, three card styles.

## Goal

One cohesive editorial front page that draws the eye: a dominant **lead story**, a purposeful **section rail**, and a **uniform surfaced grid** — all in a single content frame that fills the viewport and works in both light and dark skins.

## Chosen direction (approved via visual companion)

- **Layout A1 — Lead + Section rail.** Two-column body under the hero: main column (lead story + surfaced grid) on the left, a section rail on the right.
- **Lead treatment L1 — Bold split panel.** The featured comparison rendered as two color-blocked halves (Bradford = accent/red, Chow = success/green) with a centered "VS" medallion and large pull-quotes. Keeps the existing carousel rotation across multiple splits.
- **Rail** contains **Sections** (topic name + record count, click runs the topic query) and **Candidates** (name + total record count, links to dossier).
- **Surfaced grid**: uniform fixed-height cards, truncated body with a "Read the record ›" affordance, links to the relevant dossier.
- Mobile: rail stacks **below** the main column.

---

## Global Constraints

- **Tailwind-only. No new npm dependencies.** (line-clamp is built into Tailwind 3.4 — allowed.)
- **Theme via existing CSS-variable tokens only.** Use `bg-surface`, `bg-surface-2`, `border-rule`, `text-ink`, `text-ink-2`, `text-muted`, `border-accent`, `border-success`, `bg-masthead`, `text-masthead-ink`, `text-accent`, etc. **No hardcoded hex** in components — the mockups used hex only for prototyping; both skins must work by consuming tokens.
- **Preserve the `!state.query` gating** in `LandingShell`: the editorial front page shows only when there is no active query; an active query still swaps to `ReceiptStream`.
- **Preserve the Turnstile flow**: section/candidate/chip interactions that trigger a search must go through the existing `getTurnstileToken` → `submit` path (same as today's `onChipPick`).
- **Preserve accessibility & motion**: carousel keeps `prefers-reduced-motion` opt-out, pause-on-hover/focus, and `aria-current` dots; rail sections/candidates are keyboard-focusable buttons/links.
- No changes to `data/`, the pipeline, or `web/public/data/` schema. New counts are derived at render time from existing fields.

---

## Architecture

Data is loaded server-side in `app/page.tsx` and passed as plain-object props into the client `LandingShell`, which distributes it to child components. This keeps `fs`-touching code on the server and interactive handlers on the client (the existing pattern).

```
app/page.tsx (server)
 ├─ getFeaturedComparisons()   → featured: FeaturedEntry[]      (existing)
 ├─ getSectionCounts()         → sections: SectionCount[]       (NEW lib/sections.ts)
 ├─ listCandidates()           → candidates: CandidateSummary[] (existing loader, mapped)
 └─ <SurfacedCards />          → surfaced grid (server, existing — restyled)
        ▼ props
LandingShell (client, existing — restructured to A1 two-column)
 ├─ Hero (masthead + CommandBar)                 (tightened)
 ├─ main:  FeaturedComparison (restyled → L1)  +  surfacedSlot
 └─ rail:  SectionRail (NEW)                       (sections + candidates)
```

## Components & files

### 1. NEW `web/lib/sections.ts`
Derives per-topic record counts for the rail.

- **Interface:**
  ```ts
  export interface SectionCount {
    topic: string;        // e.g. "housing"
    label: string;        // display label, e.g. "Housing"
    count: number;        // total records with this topic across all candidates
    query: string;        // the search query to run on click (reuse intent-chips wording)
  }
  export function getSectionCounts(): SectionCount[];
  ```
- **Behavior:** for each `topic` in `TOPICS` (from `featured-types`), sum `getRecordsForHandle(slug).length` where `record.topic === topic`, across `listCandidates()`. Map to a display label and a query string. Return sorted by `count` descending, **excluding topics with count 0**. Cap at the top 6 for the rail (rest remain reachable via search).
- **Labels/queries:** reuse the existing topic→query wording. Add a `topic`-keyed lookup (small map in this file) so labels are title-case ("Housing", "Public safety") and queries match the current `INTENT_CHIPS` phrasing. `INTENT_CHIPS` stays as-is for any other use; `sections.ts` owns the rail's list.

### 2. NEW `web/components/SectionRail.tsx` (client)
- **Props:**
  ```ts
  { sections: SectionCount[];
    candidates: { slug: string; display_name: string; record_count: number }[];
    onSectionPick: (query: string) => void; }
  ```
- **Renders** two blocks:
  - **Sections** — a monospace uppercase "Sections" label, then each `SectionCount` as a full-width button (`label` left, `count ›` right in tabular-nums). Click → `onSectionPick(query)`.
  - **Candidates** — "Candidates" label, then each candidate as a link (`<a href={/candidates/${slug}}>`) with a small color dot (accent for the top-record candidate, success for the second, muted otherwise — purely decorative), name, and `record_count` right-aligned (tabular-nums).
- **Styling:** `bg-surface` items, `border border-rule`, tokenized text. Rail is `border-l border-rule pl-…` on desktop only.

### 3. MODIFY `web/components/FeaturedComparison.tsx` → L1 bold split panel
- Keep the component's data contract (`entries: FeaturedEntry[]`), rotation logic, reduced-motion opt-out, pause-on-hover/focus, and `aria-current` dots.
- Replace the inner `Slide`/`Side` markup with the **L1** treatment:
  - Kicker (`Lead · Where they split` / `Lead · Contradiction`) + a large topic headline.
  - Two color-blocked halves: side A `border-t-4 border-accent` on a subtle `bg-surface-2`/accent-tinted panel; side B `border-t-4 border-success`. Each shows candidate name (bold), source (mono muted), and the pull-quote (serif italic, larger than today).
  - Centered circular **VS** medallion overlapping the seam.
  - For a `contradiction` entry, the two halves are "Earlier" vs "Later" for the same candidate (keep current earlier/later data), with the consistency label beneath.
- Widen to the main-column width (no longer a fixed 780px island).

### 4. MODIFY `web/components/SurfacedCards.tsx` → uniform grid
- Keep `pickSurfacedCards()` data.
- Card becomes fixed-height flex column: label (kicker) → title → **truncated** body (`line-clamp-4`, `flex-1 overflow-hidden`) → **"Read the record ›"** footer link.
- Each card links to the relevant dossier: `/candidates/${candidate_slug}` (all three card types carry `candidate_slug`).
- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-…`. Because `pickSurfacedCards()` returns up to 3, on `lg` a 3-up row is full; fewer cards still read as intentional (no empty-column artifact because cards size to content columns, not a fixed 3-track with holes — use `auto-fit`-style behavior by letting the grid hold exactly the returned count). **Decision:** render the grid track count = `min(cards.length, 3)` so 2 cards give a clean 2-up, not a 3-up with a hole.
- Drop the hairline "Surfaced from the record" divider header style; use the same section label style as the rest of the page for consistency.

### 5. MODIFY `web/components/LandingShell.tsx` → A1 structure
- **Hero:** tighten vertical padding; keep masthead band, `RocketMark` + title, tagline, `CommandBar`. Make the ask box read as the hero (it already does after tightening — no size change required beyond spacing).
- **Body:** when `!state.query`, render a max-width container (`max-w-[1100px] mx-auto px-…`) with a responsive two-column layout:
  - `flex-col lg:flex-row` (or `grid lg:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)]`).
  - **Main** (left): `FeaturedComparison` (L1) then `surfacedSlot`.
  - **Rail** (right): `SectionRail`, with `onSectionPick` wired to the existing token→submit path (rename/replace today's `onChipPick`).
  - On mobile the rail comes **after** main (DOM order = main then rail; on desktop use order utilities or grid columns so rail sits right).
- Remove the standalone `<Chips>` render (its role is absorbed by `SectionRail`). `Chips.tsx` and `intent-chips.ts` may remain in the repo (unused by the homepage) unless the plan finds no other consumer — if unused, the plan should delete `Chips.tsx` and leave `intent-chips.ts` only if referenced elsewhere.
- Active-query branch (`<ReceiptStream>`) is unchanged.

### 6. MODIFY `web/app/page.tsx`
- Call `getSectionCounts()` and `listCandidates()` (mapping to `{slug, display_name, record_count}` with `record_count` falling back to `getRecordsForHandle(slug).length` when the landing field is absent).
- Pass `sections`, `candidates`, and existing `featured` into `LandingShell`.

---

## Data flow

1. `page.tsx` (server, at build/render): loads `featured`, `sections`, `candidates`; renders `SurfacedCards` (server).
2. Props serialize to the client `LandingShell`.
3. `LandingShell` renders hero + two-column body; passes `entries` to `FeaturedComparison`, `sections`/`candidates`/`onSectionPick` to `SectionRail`, and `surfacedSlot` through.
4. User interaction: ask box submit, section click (→ query submit via Turnstile), candidate click (→ navigate), all as today.

## Counts — correctness notes

- **Candidate record count:** prefer `CandidateLanding.record_count`; fall back to `getRecordsForHandle(slug).length`.
- **Section count:** number of records whose `record.topic === topic`, summed across candidates. Records without a `topic` are ignored. This is a display signal of depth, not an exact editorial claim — acceptable to count raw records.
- Counts render with `.nums-tabular` for aligned digits.

## Error / empty handling

- `getSectionCounts()` returns `[]` if no data → `SectionRail` renders only the Candidates block (or nothing if that's empty too). `LandingShell` renders the main column full-width if the rail is empty.
- `FeaturedComparison` already returns `null` on empty entries — main column then leads with the surfaced grid.
- `SurfacedCards` already returns `null` on empty.

## Testing

Follow existing vitest patterns (`web/lib/*.test.ts`, component tests with the current setup).

1. **`lib/sections.test.ts`** — with a fixture data dir (`setDataDir`): counts tally correctly per topic, zero-count topics excluded, sorted descending, capped at 6, query/label mapping correct.
2. **`SectionRail` test** — renders sections with counts, calls `onSectionPick` with the right query on click, renders candidate links with `href="/candidates/<slug>"` and counts.
3. **`SurfacedCards` test** (extend existing if present) — cards render with truncation classes and a "Read the record ›" link to `/candidates/<slug>`; grid track count equals card count when < 3.
4. **`FeaturedComparison` test** (extend existing) — L1 renders both sides with accent/success classes, VS medallion, topic headline; contradiction entry renders earlier/later; dots + rotation preserved.
5. **Build green + full `vitest run`.** Manual: production build screenshot in both skins (dark + light) confirming hierarchy and no empty-column/ragged-height artifacts.

## Out of scope

- No changes to the L3 "Said vs Done" vote-pill idea on the lead (deferred; the surfaced grid already surfaces a verified vote).
- No new topic/landing data fields; no pipeline runs.
- No redesign of the active-query `ReceiptStream` view.
