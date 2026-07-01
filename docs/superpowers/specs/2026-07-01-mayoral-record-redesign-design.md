# The Mayoral Record — Redesign Design Spec

**Date:** 2026-07-01
**Status:** Approved for planning
**Topic:** Broad UI/visual redesign of mayoralrecord.com (Next.js app in `web/`)

---

## 1. Overview

The Mayoral Record is an "official record" for Toronto's 2026 mayoral race: an
ask box backed by a sourced AI agent, plus curated cards (comparisons, single
answers, record trails, scenarios, receipts) and a verification trail that
shows the agent's tool calls.

The current UI is a dark "newsprint" theme. It works but reads dated — closer to
a classified-ads / e-zine layout than a modern civic product. This redesign
keeps the **authoritative-archive** identity but modernizes the visual language,
drenches it in **Toronto** cues, and moves to a **dual light/dark theme that
follows the OS** with a persistent override. It also folds in two known defects
and adds one new feature (an auto-derived "Featured comparison" module).

### Goals

- Modern, credible, data-journalism visual system ("Transit" skin: near-black +
  rocket red + subway yellow + consistency green, with Toronto skyline / City
  Hall / rocket motifs).
- Dual theme that **follows `prefers-color-scheme`** by default, with a toggle
  that overrides and persists, and **no flash of wrong theme**.
- One shared token system so every user-facing surface inherits the redesign.
- Fix the verification-trail overflow and the flaky ask-submit.
- Add an auto-derived, evidence-gated **Featured comparison** homepage module.

### Non-goals

- No change to the agent/tool backend (`app/api/ask/route.ts`, `lib/agent/*`)
  beyond what theming/markup requires. The answer-card contract stays as-is
  (recently fixed).
- No new runtime dependencies. **Tailwind + CSS variables only** — no UI kit, no
  animation library, no icon package (inline SVG for motifs).
- No new copyright-sensitive content ingestion.
- The Featured module never *generates* prose; it only surfaces verbatim cited
  records.

### Hard constraints

- **Tailwind-only, no new deps.**
- Stays server-rendered; theme resolves before first paint (no FOUC).
- The trust signals (verification trail, "N sources cross-referenced",
  consistency dots, evidence stamps) are preserved — restyled, never removed.
- Accessibility and SSR/perf are strong defaults (WCAG AA contrast both themes,
  keyboard-navigable, `prefers-reduced-motion` respected), not release gates.

---

## 2. Visual system — "Transit" skin

### Palette (semantic tokens)

Colors move from hardcoded hex in `tailwind.config.ts` to **CSS variables** with
one value set per theme. Tailwind color keys keep their existing names so most
components need no class changes — only the variable values differ per theme.

| Token (CSS var)   | Tailwind key   | Light "document" | Dark "reading" | Role |
|-------------------|----------------|------------------|----------------|------|
| `--bg`            | `bg`           | `#f4f2ee`        | `#121110`      | page background |
| `--surface`       | `surface`      | `#ffffff`        | `#1a1815`      | cards |
| `--surface-2`     | `surface-2`    | `#faf9f7`        | `#201d19`      | insets / rows |
| `--ink`           | `ink`          | `#17150f`        | `#ece7db`      | primary text |
| `--ink-2`         | `ink-2`        | `#4a4640`        | `#b8b2a4`      | secondary text |
| `--muted`         | `muted`        | `#7d7566`        | `#8a8275`      | metadata / mono |
| `--rule`          | `rule`         | `#e4e1d8`        | `#2a2620`      | hairlines / borders |
| `--accent`        | `accent`       | `#da251d`        | `#e5463d`      | rocket red (primary action, labels) |
| `--accent-ink`    | `accent-ink`   | `#ffffff`        | `#14110d`      | text on accent |
| `--signal`        | `signal`       | `#f2c200`        | `#f2c200`      | subway yellow (result chips, highlights) |
| `--signal-ink`    | `signal-ink`   | `#111111`        | `#111111`      | text on signal |
| `--success`       | `success`      | `#2b8a3e`        | `#57b45e`      | consistency green |
| `--masthead-bg`   | `masthead`     | `#111111`        | `#0c0b0a`      | dark hero band (both themes) |
| `--masthead-ink`  | `masthead-ink` | `#ffffff`        | `#f5f2ea`      | text on masthead |

Consistency-dot colors (green/yellow/red/gray) map to `--success`, `--signal`,
`--accent`, `--muted` respectively.

Note: the hero/masthead band stays **dark in both themes** (the Transit
identity). Only the body surfaces flip between light and dark.

### Type

- Keep Inter (sans, UI + display) and Source Serif Pro (serif) already loaded
  via the Google Fonts `<link>` in `app/layout.tsx`. Serif is reserved for
  verbatim quotes and the wordmark; everything else is Inter.
- Display headlines: bold (700/800), tight tracking (`-0.5px`), large.
- Metadata / tool names / result chips: `font-mono`, tabular nums.

### Chrome

- Rounded surfaces (`rounded-xl` cards, `rounded-full` pill controls), real
  depth via subtle box-shadow (one shadow token, e.g.
  `shadow-[0_8px_24px_rgba(0,0,0,0.10)]`; softened in dark).
- The ask box becomes a **pill** with an inset submit button.
- Toronto motifs as inline SVG: a reusable skyline (CN Tower + City Hall twin
  curved towers + low buildings) and a rocket wordmark glyph. One shared
  `components/TorontoSkyline.tsx` and `components/RocketMark.tsx`, colored via
  `currentColor` so they theme automatically.

---

## 3. Theming mechanism

### Requirements

- Default = follow the OS (`prefers-color-scheme`).
- A toggle lets the user force light or dark; the choice persists
  (`localStorage`), and reverting to "system" clears it.
- No flash of the wrong theme on first paint, including for a persisted
  override, and the common "follow system" case must work even with JS disabled.

### Approach

CSS-first so the no-JS / no-override path never flashes:

```css
/* globals.css */
:root            { /* light tokens */ }
@media (prefers-color-scheme: dark) {
  :root:not(.light) { /* dark tokens */ }   /* system dark, unless forced light */
}
:root.dark  { /* dark tokens */ }            /* forced dark, even on a light OS */
:root.light { /* light tokens */ }           /* forced light, even on a dark OS */
```

- With no override class, the media query alone resolves the correct theme
  before paint — no JS needed, no flash.
- An override only adds a class (`.light`/`.dark`) to `<html>`. To avoid a flash
  when an override is stored, a **tiny inline script in `<head>`** (before the
  stylesheet renders content) reads `localStorage.theme` and sets the class
  synchronously. The script is inlined (not imported) so it runs before paint.

Tailwind config: `darkMode: ['class', ':root.dark']` is unnecessary because
colors are variable-driven; we do **not** rely on Tailwind's `dark:` variant.
All theming flows through the CSS variables, so components use plain
`bg-surface text-ink` etc. and get the right values automatically.

### Components

- `components/ThemeToggle.tsx` (client): a **three-state cycle** — System →
  Light → Dark → System. "System" removes `localStorage.theme` and the override
  class (CSS media query takes over); "Light"/"Dark" write
  `localStorage.theme` and set `<html>`'s `.light`/`.dark` class. Shows the
  current state (icon + label). Lives in `Header.tsx`.
- Inline theme-init script added to `app/layout.tsx` `<head>`.

---

## 4. Homepage — "front page"

`app/page.tsx` currently renders `<LandingShell surfacedSlot={<SurfacedCards />} />`.
The redesign restructures the landing into a front-page composition:

1. **Masthead / hero** (dark band): wordmark + rocket mark, skyline silhouette,
   headline, subhead, **pill ask box (hero)**, topic chips.
2. **Featured comparison** module (new — see §6), rotating.
3. **Surfaced from the record** — the existing `SurfacedCards`, restyled.
4. **Receipt / scenario of the day** — reuse existing tiles, restyled.

`LandingShell` is refactored to accept the new slots (hero, featured, surfaced,
spotlight) rather than a single `surfacedSlot`. Keep it a server component;
only the ask box, featured rotation, and theme toggle are client components.

---

## 5. Answer view + card restyle

Restyle in the new token system (structure unchanged unless noted):

- **Verification trail** (`VerificationTrail.tsx`) — rebuilt as a checklist:
  each row is `✓ tool · args` on the left (in a `min-w-0 flex-1` container so
  long args truncate with ellipsis) and the `result_summary` as a **signal
  (yellow) chip** on the right that is `shrink-0` and allowed to wrap
  (`break-words`). This is the fix for the overflow defect (see §7.1). The
  collapsed "Verified. N sources cross-referenced." summary stays.
- **ComparisonCard.tsx** — candidate columns as cards: name + consistency dot +
  record count header (accent left-border), key positions, YES/NO council-vote
  chips, source line; a "Where they diverge" callout; follow-up chips. Apply the
  same `min-w-0`/wrap discipline anywhere a value sits opposite a label in a
  flex row (the overflow anti-pattern also appears at `ComparisonCard.tsx:24`).
- **SingleAnswerCard.tsx**, **RecordTrailCard.tsx**, **Stamp.tsx**,
  **FollowUpChips.tsx**, **Chips.tsx** — restyle to tokens; no structural change.

---

## 6. New feature — auto-derived Featured comparison

A homepage module that rotates through a queue of two entry types, populated
**automatically from existing data** and gated on real evidence.

### Entry types

```ts
// lib/featured-types.ts
export type FeaturedEntry = ContradictionEntry | DivergenceEntry;

export interface EvidenceRef {
  shortcode: string;   // resolves to a real record
  quote: string;       // verbatim source_quote (never generated)
  date: string;        // ISO date of the record
  source: string;      // e.g. "CP24", "Council 2024.GG12.7"
}

export interface ContradictionEntry {
  kind: "contradiction";
  slug: string;
  display_name: string;
  topic: string;              // topic slug
  topic_label: string;        // human label, e.g. "the land transfer tax"
  earlier: EvidenceRef;
  later: EvidenceRef;
  consistency: "shifted" | "evolving";
  score: number;              // ranking weight
}

export interface DivergenceEntry {
  kind: "divergence";
  topic: string;
  topic_label: string;
  a: { slug: string; display_name: string } & EvidenceRef & { vote?: "YES" | "NO" | "ABSENT" };
  b: { slug: string; display_name: string } & EvidenceRef & { vote?: "YES" | "NO" | "ABSENT" };
  score: number;
}
```

### Derivation (`lib/featured.ts`)

`getFeaturedComparisons(): FeaturedEntry[]` runs against the static data already
loaded by `lib/agent/data-loader.ts` and the synthesis / records / council-vote
sources. It runs server-side (build/SSR), returns a ranked queue.

- **Contradiction detection:** for each `(candidate, topic)` synthesis cell
  labeled `shifted` (and, lower-weight, `evolving`), find two cited records with
  a meaningful date gap whose stances oppose. Emit a `ContradictionEntry` using
  the records' verbatim `source_quote`. Score by consistency severity + date
  gap + source strength.
- **Divergence detection:** for each topic where ≥2 candidates have synthesis,
  compute a divergence score. Strongest signal: the same agenda item where two
  candidates cast **opposing council votes**. Next: contrasting key positions.
  Emit a `DivergenceEntry` with each side's verbatim anchor + vote. Score by
  opposition strength.

### Evidence guardrail (must-hold)

An entry is emitted **only if** every `EvidenceRef.shortcode` resolves to a real
record, each `quote` is a verbatim `source_quote` (not synthesized), and — for
contradictions — the synthesis cell actually carries a `shifted`/`evolving`
label. Entries failing any check are dropped. If the queue is empty, the module
does not render. This keeps the module inside the "never generate, only surface
cited records" ethos and prevents weak/unfair pairings.

### Component (`components/FeaturedComparison.tsx`, client)

Receives the queue as a prop (derived server-side, passed from `page.tsx`).
Renders the current slide (contradiction or divergence layout), rotation dots,
and auto-advance (paused on hover/focus, disabled under
`prefers-reduced-motion`). Tapping a divergence prefills the ask box / routes to
the full comparison query; tapping a contradiction routes to the candidate +
topic. Keyboard-navigable dots.

---

## 7. Defect fixes

### 7.1 Verification-trail overflow

**Root cause:** `VerificationTrail.tsx:52` renders `result_summary` in a span
with `ml-auto` inside a `flex items-center gap-2` row; the row has no `min-w-0`
and the value span has no shrink/wrap, so long values (e.g. `"180 hits, showing
25"`) overflow off the right edge.

**Fix:** restructure the completed-row markup to:

```tsx
<div className="flex items-start gap-2">
  <span className="text-success font-mono shrink-0">✓</span>
  <span className="min-w-0 flex-1 truncate">{verb} <span className="…">{args}</span></span>
  {e.result_summary && (
    <span className="shrink-0 max-w-[42%] break-words font-mono text-[10.5px] bg-signal text-signal-ink rounded-full px-2 py-[3px]">
      {e.result_summary}
    </span>
  )}
</div>
```

Apply the same discipline to the running/error rows and to
`ComparisonCard.tsx:24`.

### 7.2 Flaky ask submit

**Root cause (two layers):**
1. `turnstile-client.ts:24` — `tryRender` polls `window.turnstile` every 200ms
   with no cap; if the Turnstile script never loads, the returned promise never
   resolves.
2. `CommandBar.tsx:12-20` — `handleSubmit` `await`s that promise with no timeout
   and no `try/catch/finally`; a hung promise leaves `busy` stuck `true`, which
   permanently disables the submit button.

**Fix:**
- `getTurnstileToken`: race the render against an overall timeout (e.g. ~8s)
  that resolves `""` (server treats empty token as a failed challenge — the
  desired behavior), and cap the `tryRender` polling attempts so it can't loop
  forever. Clean up the injected container/timer.
- `CommandBar.handleSubmit`: wrap in `try { … } finally { setBusy(false); }` so
  `busy` always resets, even on throw/timeout. Keep the empty-query / already-
  busy guard.

---

## 8. Scope — surfaces to restyle

All user-facing surfaces, on the one token system:

- Home (`app/page.tsx`, `LandingShell`, `SurfacedCards`, hero, Featured).
- Answer cards (`SingleAnswerCard`, `ComparisonCard`, `RecordTrailCard`) +
  `VerificationTrail` + `Stamp`, `FollowUpChips`, `Chips`.
- Candidate pages (`app/candidates`, `[slug]`, `CandidateStatStrip`,
  `ConsistencyTimeline`, `MorePositions`, `SaidVsDone*`, `Sparkline`).
- Scenarios (`app/scenarios`, `[slug]`, `ScenarioCard*`, `ScenarioComparableTabs`,
  `ScenarioTierBadge`).
- Receipts (`app/receipts`, `[slug]`, `ReceiptCard*`, `ReceiptClaimBlock`,
  `ReceiptExhibit`, `ReceiptStream`).
- Chrome: `Header` (+ ThemeToggle), `Footer`, `StaticPage`, `Dateline`,
  `DropCap`, `LandingShell`.
- Static pages (about, methodology, privacy, terms).

Global-first: migrate `tailwind.config.ts` + `globals.css` to the token system
so most surfaces re-theme centrally; then per-surface polish.

---

## 9. Testing

- **Featured engine:** unit tests (vitest) for `getFeaturedComparisons` —
  contradiction/divergence detection, ranking, and the evidence guardrail
  (drops entries with unresolved shortcodes or synthesized quotes; empty queue
  when no evidence).
- **Turnstile timeout:** test that `getTurnstileToken` resolves `""` after the
  timeout when `window.turnstile` never appears, and that `CommandBar` re-enables
  after a hung/timed-out token (busy resets).
- **Verification trail:** structural test that the completed row uses the
  shrink/wrap classes (guards against regressing the overflow).
- **Existing suites** (card validation etc.) stay green.
- Theming + visual polish verified manually in both themes (light/dark, system
  switch, forced override, no-flash).

---

## 10. Risks & open questions

- **Auto-derived fairness:** even gated, an auto pairing could read as
  editorializing. Mitigation: strict evidence gate + ranking that favors
  council-vote oppositions (hard facts) over inferred stance contrasts. If a
  pairing still feels off in practice, a small curated denylist can be added
  later (out of scope now).
- **Data sufficiency:** contradiction detection depends on synthesis cells
  carrying `shifted`/`evolving` labels with ≥2 opposing cited records. If sparse,
  the queue leans on divergences; if fully empty, the module hides.
- **Theme token migration surface area:** touching `tailwind.config.ts` +
  `globals.css` re-themes everything at once — the plan sequences a global token
  task first, then per-surface verification, to catch any component relying on a
  removed hardcoded hex.

---

## 11. File structure (created / modified)

**Created**
- `lib/featured-types.ts`, `lib/featured.ts` (+ tests)
- `components/FeaturedComparison.tsx`
- `components/ThemeToggle.tsx`
- `components/TorontoSkyline.tsx`, `components/RocketMark.tsx`

**Modified (primary)**
- `tailwind.config.ts` (hardcoded hex → CSS-variable-backed tokens)
- `app/globals.css` (token definitions per theme + component classes)
- `app/layout.tsx` (inline theme-init script; skin)
- `app/page.tsx`, `components/LandingShell.tsx` (front-page composition)
- `components/CommandBar.tsx`, `lib/turnstile-client.ts` (defect 7.2)
- `components/VerificationTrail.tsx` (defect 7.1 + restyle)
- `components/Header.tsx` (ThemeToggle), `components/Footer.tsx`
- All card/candidate/scenario/receipt components (restyle to tokens — §8)
