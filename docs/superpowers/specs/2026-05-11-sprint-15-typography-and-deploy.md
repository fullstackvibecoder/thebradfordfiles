# Sprint 15. Typography Pass and Vercel Auto-Deploy Fix

**Date:** 2026-05-11
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 11 (warm-dark Documentary aesthetic), Sprint 13 (auto-pull infrastructure), Sprint 14 (source expansion).

## Goal

Two-track sprint. Track A: fix Vercel auto-deploy so git pushes (bot and operator) consistently land on production without manual `vercel --prod --yes` intervention. Track C: refine typography and add three small inline information marks (consistency timeline, sparkline, as-of staleness color) across the three data-dense surfaces (receipts, scenarios, candidate pages) to surface editorial care without adding new chrome.

## Motivation

The site has accumulated four editorial surfaces in twelve sprints. The most-recent visible design move was Sprint 11's warm-dark conversion. The surface area has grown substantially since (scenarios, receipts, auto-refresh, stat strips), and the visible polish has not kept pace.

Two specific gaps motivate this sprint:

1. **Vercel auto-deploy is unreliable.** Sprint 13's bot pushes skip auto-deploy; Sprint 14 showed that operator pushes also skip it occasionally. Production has needed manual `vercel --prod --yes` after every meaningful push for the last several sprints. This is friction tax on every future sprint and on the weekly cron's data-fresh promise. A focused investigation + remediation closes the gap.

2. **The visible polish lag.** Documentary-style editorial sites use typographic richness (tabular figures, oldstyle figures, small caps, drop caps, fleurons/asterisms) and inline information marks (sparklines, consistency timelines, stat strips) to communicate care without adding UI elements. The current site has the foundation (Source Serif Pro for prose, Inter for UI, ui-monospace for labels) but does not yet activate the font features available, and renders numbers and dates with proportional figures that drift visually in tables. Three small new components on three data-dense surfaces would compound across every reader visit.

## Non-goals

- Site-wide typography pass. Static pages (privacy, terms, methodology, about) and chat receipt rendering are not in scope.
- Masthead redesign. Sprint 11 already shipped the dateline strip; this sprint does not revisit it.
- Asymmetric layouts, margin notes, or other structural moves. Those are bigger redesigns that would need their own design conversation.
- OG image typography updates. In-page rendering only.
- Sparkline interactivity beyond a hover tooltip. No click-through, no drilling.
- New content surfaces or new agent tools.
- News and op-ed ingestion. Slated for Sprint 16+.

## Track A: Vercel auto-deploy fix

### Investigation approach

The symptom: pushes to `origin/main` land on git but Vercel does not auto-build. Likely root causes to investigate in order:

1. **Vercel project's Ignored Build Step.** A custom command may be returning non-zero (skip build) for the actual diff paths. Inspect via Vercel REST API: `GET /v9/projects/<projectId>` for the `commandForIgnoringBuildStep` field, and via Dashboard -> Project -> Settings -> Git.
2. **`vercel.json` or `vercel.ts` at the project root.** If present, may declare `ignoreCommand` or branch filters.
3. **GitHub integration auth.** The Vercel GitHub App may have lost write access to the repo, causing push webhooks to fail silently. Check via Dashboard -> Integrations.
4. **Production branch setting.** Vercel may be configured to auto-deploy from a branch other than `main` (e.g. `production`). Check via Dashboard -> Project -> Settings -> Git -> Production Branch.
5. **Specific actor filter.** Some Vercel project configs limit auto-deploy to specific GitHub users via the Web UI or via an env-var-driven `ignoreCommand`.
6. **Bot author classification.** Vercel may treat `data-refresh[bot]` as a different actor; the same may apply to commits authored by `actions@github.com`.

### Remediation

The fix depends on root cause. Common remediations:

- Remove or correct an `ignoreCommand` that was returning non-zero for valid paths.
- Reauthorize the Vercel GitHub App.
- Set the production branch correctly.
- Add an `auto-deploy: true` toggle in project settings.

### Verification

After applying the fix:

1. Push a no-op commit to `main` from the operator (`aramamo`). Observe a Vercel build fire within ~30 seconds.
2. Trigger the data-refresh workflow manually (`gh workflow run data-refresh.yml`). If the run produces a bot commit, observe a Vercel build fire after the bot push.

### Documentation

A short note at `docs/superpowers/notes/2026-05-11-vercel-deploy-fix.md` records the root cause and the remediation applied, so the next time it breaks the operator knows where to look.

## Track C: Typography pass

### Font feature activation

CSS additions in `web/app/globals.css` (via `@layer components` for utility classes) and Tailwind utility classes applied in components. No new font files. No new components for font features.

| Feature | CSS property | Where applied |
|---|---|---|
| Tabular numerals | `font-variant-numeric: tabular-nums` | Numeric `metric` field in scenario and receipt anchors, candidate stat strip numbers, record-count displays, all citation date renders (`as_of`, `retrieved`, `last_reviewed`, `next_review`) |
| Oldstyle figures | `font-variant-numeric: oldstyle-nums` | Body prose with embedded numbers: `finding`, `summary`, `pull_quote`, synthesis cell summary text |
| Small caps | `font-variant-caps: all-small-caps` | Tier badges (T1/T2/T3/T4), "AUDITED" stamp, "EXHIBIT N" headings, "AS OF YYYY-MM-DD" lines, dateline strip "VOL I . NO N . MORNING EDITION" elements |
| Drop caps | (existing `.drop-cap` utility extended) | Currently only on synthesis cells. Sprint 15 extends to: scenario card Who-Benefits intro paragraph, receipt pull-quote display on detail page |
| Asterisms | `⁂` rendered as a centered separator between major sections | Long scenario cards (between Comparables and Projections sections), long receipts (between Exhibits and "What data cannot settle" section) |

Implementation note: Source Serif Pro carries oldstyle and tabular figure variants natively. Inter supports both via OpenType features but renders the same glyph at most sizes; the visual effect is most noticeable on Source Serif. Small caps are real (not faked CSS small caps) in both Source Serif and Inter.

### New components

#### `ConsistencyTimeline` (`web/components/ConsistencyTimeline.tsx`)

A small inline component: five colored ticks in a horizontal row, one tick per topic group, colored by consistency status.

```typescript
interface ConsistencyTimelineProps {
  slug: string;  // candidate slug
}
```

The component reads the candidate's synthesis cells via `getSynthesis(slug, topic)` for the five topic groups: housing, transit, safety_crime, taxes_fiscal, social_services. Each cell's `consistency.label` field ("consistent" / "evolving" / "shifted" / null) determines tick color:

- "consistent" -> green `#3a8a3a`
- "evolving" -> yellow `#d4a548`
- "shifted" -> red `#d44848`
- null / no cell -> muted `#4a4234` (placeholder tick)

The five ticks render as 8px squares separated by 2px gaps, total 50px wide × 8px tall. Tooltip on hover shows the topic name and label.

Visual treatment: ticks rendered as `<span>` elements with `bg-[#...]` Tailwind classes. No SVG, no JS for rendering (just for tooltip).

Slots:
- Candidate page header, directly under the candidate name and role line
- Scenario card candidate-position blocks (one timeline per candidate position card)
- Receipt claim blocks (when the claim is attributed to a known candidate; resolved by matching `claim.attribution` to a candidate by name)

#### `Sparkline` (`web/components/Sparkline.tsx`)

A tiny inline SVG chart of 12 monthly data points showing record-posting cadence over the last 12 months.

```typescript
interface SparklineProps {
  slug: string;  // candidate slug
}
```

The component reads the candidate's records via `getRecordsForHandle(slug)`, groups by `post_date.slice(0, 7)` (YYYY-MM), counts records per month, takes the last 12 months ending today, normalises to a 0-1 scale by max, and renders as an SVG `<path>` with a single ochre stroke at 1px weight.

SVG dimensions: 60px wide × 16px tall. Plotted line uses ochre `#c4923a` against transparent bg. No axes, no labels, no animation. Tooltip on hover (HTML title attribute) shows the latest 3 months and their counts as a text summary.

Slots:
- Candidate stat strip, beside the "Records" stat (after the number)
- Scenario card candidate-position blocks, beside the candidate name
- Receipt claim blocks (when attributed to a known candidate)

Edge cases:
- If the candidate has no records or fewer than 3 months of data, render nothing (return null).
- If all records are in the most recent month, draw a flat line near the top.

#### As-of staleness color treatment (no new component)

Sprint 15 extends `web/components/ReceiptExhibit.tsx` (and equivalent rendering paths in scenario cards) so the existing `as_of` date renders with a date-comparison-driven color class:

```typescript
function ageOf(asOf: string): "fresh" | "normal" | "stale" {
  const days = Math.floor((Date.now() - Date.parse(asOf)) / 86400000);
  if (days < 14) return "fresh";
  if (days < 60) return "normal";
  return "stale";
}
```

Color mapping:
- `fresh`: `text-[#7aa67a]` (muted green; reads "this is current")
- `normal`: existing muted (no change)
- `stale`: `text-[#5a5a55] italic` (visibly dimmer; reads "this is aging")

Applied to the `as_of` line in every receipt exhibit and (optionally) every scenario comparable's `period` line. Editorial signal of data freshness; pairs with the auto-refresh story.

### Test plan additions

- Vitest tests for `ConsistencyTimeline`: 4 tests covering each consistency label color + missing cell fallback.
- Vitest tests for `Sparkline` data derivation: 4 tests covering month grouping, last-12 windowing, normalisation, and the no-data return-null case.
- Vitest test for `ageOf` helper: 3 tests for the three buckets.
- No new tests for font features (these are CSS; visual smoke test at deploy time).

## Acceptance criteria

1. Vercel auto-deploy fires for both `aramamo` and `data-refresh[bot]` pushes. Verified with one no-op operator push and one workflow_dispatch run after the fix.
2. Tabular numerals applied to numeric metric, exhibit, stat-strip, and citation date renders across the three surfaces.
3. Oldstyle figures applied to body prose fields (`finding`, `summary`, `pull_quote`, synthesis summaries).
4. Small caps applied to tier badges, AUDITED stamp, EXHIBIT N headings, AS OF dates, dateline elements.
5. Drop caps active on scenario Who-Benefits intro paragraph and receipt pull-quote display.
6. Asterisms render between long-page sections as defined.
7. `ConsistencyTimeline` component renders on candidate pages, scenario candidate-position blocks, and receipt claim blocks (when applicable).
8. `Sparkline` component renders on candidate stat strip, scenario candidate-position blocks, receipt claim blocks (when applicable).
9. As-of staleness color treatment applied on every receipt exhibit and scenario comparable.
10. Existing 107 vitest tests continue to pass. New tests: at least 11 (4 ConsistencyTimeline + 4 Sparkline + 3 ageOf).
11. Em-dash count across all rendered pages: 0.
12. Production smoke test confirms visible new info marks on at least one candidate page, one scenario page, one receipt page.
13. Documentation note `docs/superpowers/notes/2026-05-11-vercel-deploy-fix.md` records the root cause and remediation.

## Risks and mitigations

- **Vercel investigation may not find a single root cause.** Multiple sources contribute. Mitigation: time-box the investigation to half a day; if remediation requires more, document partial findings and ship the rest of Sprint 15 anyway. The typography work does not depend on the deploy fix.
- **Drop caps may collide with prose that opens with quotation marks or numerals.** Source Serif Pro's drop cap rendering uses the first character; quotation marks render small and look wrong. Mitigation: check each prose field that gets a drop cap; if the field starts with a non-letter, skip the drop cap for that instance.
- **Sparkline rendering on mobile may overflow.** 60px wide should fit, but inline next to long candidate names may overlap. Mitigation: wrap sparkline in `<span className="inline-block ml-2 whitespace-nowrap">`; on viewport widths under 480px, hide the sparkline (`md:inline` style).
- **Consistency timeline may look hollow when most cells are missing.** Some candidates have synthesis on only 3 of 5 topic groups. Mitigation: the muted-color placeholder tick is explicit; readers see "this is a partial profile" rather than "this looks broken."
- **Font feature support varies by browser.** OpenType features are supported in all evergreen browsers since 2018. Older browsers degrade gracefully (proportional figures instead of tabular, etc.). No fallback work needed.
- **As-of staleness color may conflict with the warm-dark palette.** Green `#7aa67a` is muted but distinct. Test against the dark bg before commit; adjust hue if necessary.

## Sequencing

- Phase 1: Vercel deploy investigation + fix (Track A). Documented in notes file.
- Phase 2: Font feature activation (CSS / Tailwind across components on the three surfaces).
- Phase 3: `ConsistencyTimeline` component + tests + integration on all three slots.
- Phase 4: `Sparkline` component + data derivation + tests + integration on all three slots.
- Phase 5: As-of staleness color helper + integration in receipt exhibits and scenario comparables.
- Phase 6: Production deploy + acceptance criteria verification.
