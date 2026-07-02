# Homepage Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure The Mayoral Record homepage below the ask box into a cohesive editorial front page (bold split lead + section rail + uniform surfaced grid) with real visual hierarchy.

**Architecture:** Server component `app/page.tsx` loads featured comparisons, section counts, and candidate summaries, passing them as plain-object props to the client `LandingShell`, which renders a two-column body: a main column (restyled `FeaturedComparison` lead + restyled `SurfacedCards` grid) and a new `SectionRail`. All styling consumes existing CSS-variable Tailwind tokens so both light and dark skins work.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 3.4 (line-clamp is core), Vitest. No new npm dependencies.

## Global Constraints

- **Tailwind-only. No new npm dependencies.** (line-clamp is built into Tailwind 3.4.)
- **Theme via existing CSS-variable tokens only** — `bg-surface`, `bg-surface-2`, `border-rule`, `text-ink`, `text-ink-2`, `text-muted`, `border-accent`, `border-success`, `bg-masthead`, `text-masthead-ink`, `text-accent`, `bg-accent`, `bg-success`, `bg-muted`. **No hardcoded hex** in components (no `text-[#…]`, `bg-[#…]`, `border-[#…]`).
- **Preserve the `!state.query` gating** in `LandingShell`: the editorial front page shows only when there is no active query; an active query swaps to `ReceiptStream`.
- **Preserve the Turnstile flow**: any interaction that triggers a search goes through `getTurnstileToken(siteKey)` → `submit(query, token)` (the existing `onChipPick` path).
- **Preserve accessibility & motion** in the carousel: `prefers-reduced-motion` opt-out, pause-on-hover/focus, `aria-current` dots.
- No changes to `data/`, the pipeline, or `web/public/data/` schema. Counts derive at render time from existing fields (`record.topic`, `CandidateLanding.record_count`).

**Codebase test idiom (read before writing any test):**
- Tests live in `web/tests/**/*.test.ts` (`.ts` only — never `.tsx`). Vitest runs with `globals: false`, so **every test file imports `{ test, expect }` (and `beforeEach` if needed) from `"vitest"`**.
- **Pure-logic libs** get real unit tests with a temp fixture data dir: `mkdtempSync` + `setDataDir(tmp)` + `writeFileSync` (see `tests/data-loader.test.ts`).
- **Components** are tested by reading their source text and asserting on it: `readFileSync(new URL("../components/X.tsx", import.meta.url), "utf-8")` then `expect(src).toMatch(...)` (see `tests/verification-trail.test.ts`, `tests/no-legacy-hex.test.ts`). There is **no** `@testing-library/react` — do not render components in tests.
- Run all tests from `web/`: `npx vitest run`. Run one file: `npx vitest run tests/<name>.test.ts`.

---

### Task 1: `lib/sections.ts` — section counts + candidate summaries

**Files:**
- Create: `web/lib/sections.ts`
- Test: `web/tests/sections.test.ts`

**Interfaces:**
- Consumes: `listCandidates()`, `getRecordsForHandle(slug)`, `CandidateLanding` from `@/lib/agent/data-loader`; `TOPICS` from `@/lib/featured-types`.
- Produces:
  - `interface SectionCount { topic: string; label: string; count: number; query: string; }`
  - `interface CandidateSummary { slug: string; display_name: string; record_count: number; }`
  - `getSectionCounts(): SectionCount[]` — per-topic record tallies across all candidates, zero-count topics excluded, sorted by count desc, capped at 6.
  - `getCandidateSummaries(): CandidateSummary[]` — one per candidate, `record_count` from `CandidateLanding.record_count` or fallback to record array length.

- [ ] **Step 1: Write the failing test**

Create `web/tests/sections.test.ts`:

```ts
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir } from "@/lib/agent/data-loader";
import { getSectionCounts, getCandidateSummaries } from "@/lib/sections";

let tmp: string;

function writeLanding(candidates: unknown[]) {
  writeFileSync(join(tmp, "landing.json"), JSON.stringify({ candidates }));
}
function writeDossier(slug: string, records: unknown[]) {
  mkdirSync(join(tmp, "candidates"), { recursive: true });
  writeFileSync(join(tmp, "candidates", `${slug}.json`), JSON.stringify({ records }));
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-sections-"));
  setDataDir(tmp);
});

test("getSectionCounts tallies records per topic across candidates, excludes zero, sorts desc", () => {
  writeLanding([
    { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
    { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
  ]);
  writeDossier("bradford", [
    { shortcode: "A", kind: "position", topic: "housing" },
    { shortcode: "B", kind: "position", topic: "housing" },
    { shortcode: "C", kind: "position", topic: "transit" },
    { shortcode: "D", kind: "position" }, // no topic -> ignored
  ]);
  writeDossier("chow", [
    { shortcode: "E", kind: "position", topic: "housing" },
    { shortcode: "F", kind: "position", topic: "transit" },
  ]);
  const s = getSectionCounts();
  expect(s[0]).toMatchObject({ topic: "housing", label: "Housing", count: 3 });
  expect(s[1]).toMatchObject({ topic: "transit", label: "Transit", count: 2 });
  // topics with zero records are absent
  expect(s.find(x => x.topic === "social_services")).toBeUndefined();
  // every section carries a non-empty search query
  expect(s[0].query.length).toBeGreaterThan(0);
});

test("getSectionCounts caps at 6 sections", () => {
  writeLanding([{ slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" }]);
  const topics = ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics"];
  writeDossier("bradford", topics.map((t, i) => ({ shortcode: `R${i}`, kind: "position", topic: t })));
  expect(getSectionCounts()).toHaveLength(6);
});

test("getCandidateSummaries prefers record_count, falls back to record array length", () => {
  writeLanding([
    { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford", record_count: 5650 },
    { slug: "chow", display_name: "Olivia Chow", surname: "Chow" }, // no record_count
  ]);
  writeDossier("chow", [{ shortcode: "E", kind: "position", topic: "housing" }, { shortcode: "F", kind: "position", topic: "transit" }]);
  const c = getCandidateSummaries();
  expect(c[0]).toEqual({ slug: "bradford", display_name: "Brad Bradford", record_count: 5650 });
  expect(c[1]).toEqual({ slug: "chow", display_name: "Olivia Chow", record_count: 2 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/sections.test.ts`
Expected: FAIL — cannot resolve `@/lib/sections` / `getSectionCounts is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/sections.ts`:

```ts
import { listCandidates, getRecordsForHandle } from "@/lib/agent/data-loader";
import { TOPICS } from "@/lib/featured-types";

export interface SectionCount {
  topic: string;
  label: string;
  count: number;
  query: string;
}

export interface CandidateSummary {
  slug: string;
  display_name: string;
  record_count: number;
}

const SECTION_LABELS: Record<string, string> = {
  housing: "Housing",
  transit: "Transit",
  safety_crime: "Public safety",
  taxes_fiscal: "Tax & fiscal",
  parks_environment: "Parks & environment",
  infrastructure: "Infrastructure",
  civic_engagement: "Civic engagement",
  governance_ethics: "Governance & ethics",
  small_business_economy: "Small business",
  social_services: "Social services",
};

const SECTION_QUERIES: Record<string, string> = {
  housing: "What are the candidates' positions and votes on housing?",
  transit: "What are the candidates' positions and votes on transit?",
  safety_crime: "What are the candidates' positions on public safety?",
  taxes_fiscal: "What are the candidates' positions and votes on taxes and fiscal policy?",
  parks_environment: "What are the candidates' positions on parks and environment?",
  infrastructure: "What are the candidates' positions on infrastructure?",
  civic_engagement: "What are the candidates' positions on civic engagement?",
  governance_ethics: "What are the candidates' positions on governance and ethics?",
  small_business_economy: "What are the candidates' positions on small business and the economy?",
  social_services: "What are the candidates' positions on social services?",
};

export function getSectionCounts(): SectionCount[] {
  const recordsBySlug = listCandidates().map(c => getRecordsForHandle(c.slug));
  const out: SectionCount[] = [];
  for (const topic of TOPICS) {
    let count = 0;
    for (const recs of recordsBySlug) {
      for (const r of recs) if (r.topic === topic) count++;
    }
    if (count === 0) continue;
    out.push({ topic, label: SECTION_LABELS[topic] ?? topic, count, query: SECTION_QUERIES[topic] ?? "" });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 6);
}

export function getCandidateSummaries(): CandidateSummary[] {
  return listCandidates().map(c => ({
    slug: c.slug,
    display_name: c.display_name,
    record_count: c.record_count ?? getRecordsForHandle(c.slug).length,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/sections.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/sections.ts web/tests/sections.test.ts
git commit -m "feat(homepage): section counts + candidate summaries lib"
```

---

### Task 2: `SectionRail.tsx` — right-rail sections + candidates

**Files:**
- Create: `web/components/SectionRail.tsx`
- Test: `web/tests/section-rail.test.ts`

**Interfaces:**
- Consumes: `SectionCount`, `CandidateSummary` from `@/lib/sections` (Task 1).
- Produces: `SectionRail({ sections, candidates, onSectionPick }: { sections: SectionCount[]; candidates: CandidateSummary[]; onSectionPick: (query: string) => void })` — client component. Section rows call `onSectionPick(section.query)`; candidate rows are `<a href={`/candidates/${slug}`}>`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/section-rail.test.ts`:

```ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/SectionRail.tsx", import.meta.url), "utf-8");

test("SectionRail is a client component", () => {
  expect(src).toMatch(/^["']use client["']/);
});

test("section rows trigger the search via onSectionPick with the section query", () => {
  expect(src).toMatch(/onSectionPick\(\s*s\.query\s*\)/);
});

test("candidate rows link to the dossier route", () => {
  expect(src).toMatch(/href=\{`\/candidates\/\$\{c\.slug\}`\}/);
});

test("counts render with tabular numerals and record_count is shown", () => {
  expect(src).toMatch(/nums-tabular/);
  expect(src).toMatch(/record_count/);
});

test("SectionRail uses theme tokens and no hardcoded hex", () => {
  expect(src).toMatch(/border-rule/);
  expect(src).not.toMatch(/text-\[#|bg-\[#|border-\[#/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/section-rail.test.ts`
Expected: FAIL — `ENOENT` reading `SectionRail.tsx`.

- [ ] **Step 3: Write minimal implementation**

Create `web/components/SectionRail.tsx`:

```tsx
"use client";
import type { SectionCount, CandidateSummary } from "@/lib/sections";

const DOT = ["bg-accent", "bg-success"];

export function SectionRail({
  sections,
  candidates,
  onSectionPick,
}: {
  sections: SectionCount[];
  candidates: CandidateSummary[];
  onSectionPick: (query: string) => void;
}) {
  if (sections.length === 0 && candidates.length === 0) return null;
  return (
    <aside className="lg:border-l lg:border-rule lg:pl-6">
      {sections.length > 0 && (
        <div className="mb-8">
          <div className="label mb-3">Sections</div>
          <div className="flex flex-col gap-1.5">
            {sections.map(s => (
              <button
                key={s.topic}
                type="button"
                onClick={() => onSectionPick(s.query)}
                className="flex items-center justify-between bg-surface border border-rule rounded-md px-3 py-2 text-[13px] text-ink hover:border-accent transition-colors"
              >
                <span>{s.label}</span>
                <span className="font-mono text-[11px] text-muted nums-tabular">{s.count} ›</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {candidates.length > 0 && (
        <div>
          <div className="label mb-3">Candidates</div>
          <div className="flex flex-col">
            {candidates.map((c, i) => (
              <a
                key={c.slug}
                href={`/candidates/${c.slug}`}
                className="flex items-center gap-2.5 py-2 border-b border-rule text-[13px] text-ink hover:text-accent transition-colors"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${DOT[i] ?? "bg-muted"}`} />
                <span>{c.display_name}</span>
                <span className="ml-auto font-mono text-[11px] text-muted nums-tabular">{c.record_count.toLocaleString()}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/section-rail.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/components/SectionRail.tsx web/tests/section-rail.test.ts
git commit -m "feat(homepage): SectionRail (topic counts + candidate links)"
```

---

### Task 3: Restyle `FeaturedComparison.tsx` → L1 bold split lead

**Files:**
- Modify: `web/components/FeaturedComparison.tsx` (full rewrite of markup; keep rotation/a11y logic)
- Test: `web/tests/featured-comparison-view.test.ts`

**Interfaces:**
- Consumes: `FeaturedEntry`, `ContradictionEntry`, `DivergenceEntry` from `@/lib/featured-types` (unchanged prop contract: `FeaturedComparison({ entries }: { entries: FeaturedEntry[] })`).
- Produces: same export name/signature; only the rendered markup changes.

- [ ] **Step 1: Write the failing test**

Create `web/tests/featured-comparison-view.test.ts`:

```ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/FeaturedComparison.tsx", import.meta.url), "utf-8");

test("L1 lead color-blocks the two sides with accent and success top borders", () => {
  expect(src).toMatch(/border-t-4/);
  expect(src).toMatch(/border-accent/);
  expect(src).toMatch(/border-success/);
});

test("L1 lead shows a centered VS medallion", () => {
  expect(src).toMatch(/VS/);
});

test("carousel keeps reduced-motion opt-out and aria-current dots", () => {
  expect(src).toMatch(/prefers-reduced-motion/);
  expect(src).toMatch(/aria-current/);
});

test("lead no longer pins a fixed 780px island width", () => {
  expect(src).not.toMatch(/max-w-\[780px\]/);
});

test("FeaturedComparison uses tokens and no hardcoded hex", () => {
  expect(src).not.toMatch(/text-\[#|bg-\[#|border-\[#/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/featured-comparison-view.test.ts`
Expected: FAIL — current file still has `max-w-[780px]` and no `border-t-4`.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `web/components/FeaturedComparison.tsx` with:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { FeaturedEntry, ContradictionEntry, DivergenceEntry } from "@/lib/featured-types";

function Half({ name, quote, source, meta, accent }: { name: string; quote: string; source: string; meta?: string; accent: "a" | "b" }) {
  return (
    <div className={`flex-1 min-w-0 p-5 bg-surface-2 border-t-4 ${accent === "a" ? "border-accent" : "border-success"}`}>
      <div className="font-sans font-extrabold text-[16px] text-ink flex items-center gap-2">
        {name}{meta && <span className="font-mono text-[9px] text-muted">{meta}</span>}
      </div>
      <div className="font-mono text-[9px] text-muted mt-0.5">{source}</div>
      <p className="font-serif italic text-[15px] leading-relaxed text-ink-2 mt-3">“{quote}”</p>
    </div>
  );
}

function VsMedallion() {
  return (
    <div className="relative flex items-center justify-center px-1 self-stretch">
      <div className="absolute inset-y-0 w-px bg-rule" />
      <span className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-rule font-mono text-[11px] font-bold text-accent">VS</span>
    </div>
  );
}

function Slide({ entry }: { entry: FeaturedEntry }) {
  if (entry.kind === "contradiction") {
    const e = entry as ContradictionEntry;
    return (
      <div className="p-5">
        <span className="font-mono text-[9px] font-bold tracking-label uppercase text-accent">Lead · Contradiction</span>
        <h3 className="font-sans font-extrabold text-[24px] tracking-tight text-ink mt-1 mb-4">{e.display_name} on {e.topic_label}</h3>
        <div className="flex items-stretch">
          <Half name={e.earlier.date?.slice(0, 4) || "Earlier"} quote={e.earlier.quote} source={e.earlier.source} accent="a" />
          <VsMedallion />
          <Half name={e.later.date?.slice(0, 4) || "Later"} quote={e.later.quote} source={e.later.source} accent="b" />
        </div>
        <div className="font-mono text-[10px] font-bold text-accent mt-3">▸ position {e.consistency}</div>
      </div>
    );
  }
  const e = entry as DivergenceEntry;
  return (
    <div className="p-5">
      <span className="font-mono text-[9px] font-bold tracking-label uppercase text-accent">Lead · Where they split</span>
      <h3 className="font-sans font-extrabold text-[24px] tracking-tight text-ink mt-1 mb-4">Split on {e.topic_label}</h3>
      <div className="flex items-stretch">
        <Half name={e.a.display_name} quote={e.a.quote} source={e.a.source} meta={e.a.vote} accent="a" />
        <VsMedallion />
        <Half name={e.b.display_name} quote={e.b.quote} source={e.b.source} meta={e.b.vote} accent="b" />
      </div>
    </div>
  );
}

export function FeaturedComparison({ entries }: { entries: FeaturedEntry[] }) {
  const [i, setI] = useState(0);
  const paused = useRef(false);
  useEffect(() => {
    if (entries.length < 2) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => { if (!paused.current) setI(p => (p + 1) % entries.length); }, 7000);
    return () => clearInterval(id);
  }, [entries.length]);
  if (entries.length === 0) return null;
  const entry = entries[Math.min(i, entries.length - 1)];
  return (
    <section
      className="w-full"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onFocusCapture={() => { paused.current = true; }}
      onBlurCapture={() => { paused.current = false; }}
    >
      <div className="bg-surface border border-rule rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <Slide entry={entry} />
        {entries.length > 1 && (
          <div className="flex gap-1.5 justify-center pb-4">
            {entries.map((_, n) => (
              <button
                key={n}
                onClick={() => setI(n)}
                aria-label={`Show featured item ${n + 1}`}
                aria-current={n === i ? "true" : undefined}
                className={`h-[7px] rounded-full transition-all ${n === i ? "w-5 bg-accent" : "w-[7px] bg-rule"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/featured-comparison-view.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/components/FeaturedComparison.tsx web/tests/featured-comparison-view.test.ts
git commit -m "feat(homepage): L1 bold split-panel lead treatment"
```

---

### Task 4: Restyle `SurfacedCards.tsx` → uniform grid

**Files:**
- Modify: `web/components/SurfacedCards.tsx` (full rewrite; keep `pickSurfacedCards`, `TOPIC_LABELS`, `cardLabel`, `cardTitle` logic)
- Test: `web/tests/surfaced-cards-view.test.ts`

**Interfaces:**
- Consumes: `pickSurfacedCards()`, `SurfacedCard` from `@/lib/surfaced` (unchanged). Each `SurfacedCard` carries `candidate_slug`.
- Produces: same export name `SurfacedCards` (server component, no props).

- [ ] **Step 1: Write the failing test**

Create `web/tests/surfaced-cards-view.test.ts`:

```ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/SurfacedCards.tsx", import.meta.url), "utf-8");

test("cards truncate the body with line-clamp so heights stay uniform", () => {
  expect(src).toMatch(/line-clamp-4/);
  expect(src).toMatch(/overflow-hidden/);
});

test("cards link to the candidate dossier and show a read-the-record affordance", () => {
  expect(src).toMatch(/href=\{`\/candidates\/\$\{c\.candidate_slug\}`\}/);
  expect(src).toMatch(/Read the record/);
});

test("grid track count matches card count (no empty third column)", () => {
  expect(src).toMatch(/GRID_COLS/);
});

test("SurfacedCards uses tokens and no hardcoded hex", () => {
  expect(src).toMatch(/border-rule/);
  expect(src).not.toMatch(/text-\[#|bg-\[#|border-\[#/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/surfaced-cards-view.test.ts`
Expected: FAIL — current file has no `line-clamp-4`, no `GRID_COLS`, no `/candidates/` link.

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `web/components/SurfacedCards.tsx` with:

```tsx
import { pickSurfacedCards, type SurfacedCard } from "@/lib/surfaced";

const TOPIC_LABELS: Record<string, string> = {
  housing: "Housing",
  transit: "Transit",
  safety_crime: "Public safety",
  taxes_fiscal: "Tax & fiscal",
  parks_environment: "Parks & environment",
  infrastructure: "Infrastructure",
  civic_engagement: "Civic engagement",
  governance_ethics: "Governance & ethics",
  small_business_economy: "Small business",
  social_services: "Social services",
};

// Literal class strings so Tailwind's JIT scanner picks them up.
const GRID_COLS: Record<number, string> = {
  0: "grid-cols-1",
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

function cardLabel(c: SurfacedCard): string {
  if (c.type === "stance_evolved") return "Stance evolved";
  if (c.type === "verified_vote") return "Verified vote";
  return "From the synthesis";
}

function cardTitle(c: SurfacedCard): string {
  if (c.type === "stance_evolved") return `${c.candidate_name} on ${TOPIC_LABELS[c.topic] ?? c.topic}`;
  if (c.type === "verified_vote") return `${c.candidate_name} voted ${c.vote_disposition} on ${c.agenda_item}`;
  return `${c.candidate_name} on ${TOPIC_LABELS[c.topic] ?? c.topic}`;
}

export function SurfacedCards() {
  const cards = pickSurfacedCards();
  if (cards.length === 0) return null;
  const cols = GRID_COLS[Math.min(cards.length, 3)] ?? GRID_COLS[3];
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px bg-rule flex-1" />
        <span className="label">Surfaced from the record</span>
        <div className="h-px bg-rule flex-1" />
      </div>
      <div className={`grid ${cols} gap-3.5`}>
        {cards.map((c, i) => (
          <a
            key={i}
            href={`/candidates/${c.candidate_slug}`}
            className="flex flex-col h-[220px] bg-surface border border-rule rounded-lg p-4 hover:border-accent transition-colors"
          >
            <div className="label mb-2">{cardLabel(c)}</div>
            <div className="font-sans font-semibold text-[15px] leading-snug text-ink mb-2 tracking-tight">{cardTitle(c)}</div>
            <p className="font-serif text-[12.5px] leading-relaxed text-ink-2 flex-1 overflow-hidden line-clamp-4">{c.body}</p>
            <span className="font-mono text-[10px] font-bold text-accent mt-3">Read the record ›</span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/surfaced-cards-view.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/components/SurfacedCards.tsx web/tests/surfaced-cards-view.test.ts
git commit -m "feat(homepage): uniform surfaced grid with truncation + dossier links"
```

---

### Task 5: Assemble A1 layout — `LandingShell.tsx` + `page.tsx`, remove Chips

**Files:**
- Modify: `web/components/LandingShell.tsx` (full rewrite)
- Modify: `web/app/page.tsx` (full rewrite)
- Delete (conditional): `web/components/Chips.tsx` — only if no consumer remains after this task (grep in Step 3).
- Test: `web/tests/landing-shell.test.ts`

**Interfaces:**
- Consumes: `SectionRail` (Task 2); `getSectionCounts`, `getCandidateSummaries`, `SectionCount`, `CandidateSummary` (Task 1); `FeaturedComparison` (Task 3); `SurfacedCards` (Task 4); existing `CommandBar`, `useReceiptStream`, `ReceiptStream`, `getTurnstileToken`, `RocketMark`, `TorontoSkyline`.
- Produces: `LandingShell({ featuredSlot, surfacedSlot, sections, candidates })` — new required props `sections: SectionCount[]` and `candidates: CandidateSummary[]`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/landing-shell.test.ts`:

```ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../components/LandingShell.tsx", import.meta.url), "utf-8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf-8");

test("LandingShell renders the SectionRail with sections, candidates, and a pick handler", () => {
  expect(shell).toMatch(/import \{ SectionRail \}/);
  expect(shell).toMatch(/<SectionRail[\s\S]*sections=\{sections\}[\s\S]*candidates=\{candidates\}[\s\S]*onSectionPick=\{onSectionPick\}/);
});

test("section picks go through the Turnstile token -> submit path", () => {
  expect(shell).toMatch(/async function onSectionPick/);
  expect(shell).toMatch(/getTurnstileToken\(siteKey\)/);
  expect(shell).toMatch(/submit\(query, token\)/);
});

test("editorial front page renders only when there is no active query, in a two-column body", () => {
  expect(shell).toMatch(/!state\.query &&/);
  expect(shell).toMatch(/lg:flex-row/);
  expect(shell).toMatch(/state\.query && <ReceiptStream/);
});

test("the standalone Chips block is gone from the homepage", () => {
  expect(shell).not.toMatch(/<Chips/);
});

test("page.tsx loads sections + candidates and passes them to LandingShell", () => {
  expect(page).toMatch(/getSectionCounts/);
  expect(page).toMatch(/getCandidateSummaries/);
  expect(page).toMatch(/sections=\{sections\}/);
  expect(page).toMatch(/candidates=\{candidates\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/landing-shell.test.ts`
Expected: FAIL — `LandingShell` still imports/renders `Chips`, no `SectionRail`, and `page.tsx` lacks the new loaders.

- [ ] **Step 3: Write minimal implementation**

First confirm whether `Chips` has any other consumer:

Run: `cd web && grep -rn "components/Chips\|from \"@/components/Chips\"\|<Chips" app components | grep -v LandingShell`
- If this prints nothing, delete the file in this task: `git rm web/components/Chips.tsx`.
- If it prints other consumers, leave `Chips.tsx` in place (do not delete). Either way, `intent-chips.ts` stays (still valid data; `sections.ts` owns the rail list independently).

Replace the entire contents of `web/components/LandingShell.tsx` with:

```tsx
"use client";
import { CommandBar } from "@/components/CommandBar";
import { SectionRail } from "@/components/SectionRail";
import { ReceiptStream, useReceiptStream } from "@/components/ReceiptStream";
import { getTurnstileToken } from "@/lib/turnstile-client";
import { RocketMark } from "@/components/RocketMark";
import { TorontoSkyline } from "@/components/TorontoSkyline";
import type { SectionCount, CandidateSummary } from "@/lib/sections";

export function LandingShell({
  featuredSlot,
  surfacedSlot,
  sections,
  candidates,
}: {
  featuredSlot?: React.ReactNode;
  surfacedSlot: React.ReactNode;
  sections: SectionCount[];
  candidates: CandidateSummary[];
}) {
  const { state, submit, reset } = useReceiptStream();
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || undefined;

  async function onSectionPick(query: string) {
    const token = await getTurnstileToken(siteKey);
    submit(query, token);
  }

  async function onFollowUp(query: string) {
    if (!query) { reset(); return; }
    const token = await getTurnstileToken(siteKey);
    submit(query, token);
  }

  function onCommandSubmit(query: string, token: string) {
    submit(query, token);
  }

  return (
    <div className="min-h-screen">
      <div className="bg-masthead text-masthead-ink relative overflow-hidden pb-10">
        <div className="text-center pt-8 px-8 relative z-10">
          <div className="flex items-center justify-center gap-2 mb-2">
            <RocketMark className="w-6 h-6" />
            <div className="font-sans font-semibold text-[30px] leading-[1.1] tracking-tight">The Mayoral Record</div>
          </div>
          <p className="font-serif italic text-[14px] leading-[1.5] text-muted max-w-[560px] mx-auto">Toronto's 2026 mayoral race, sourced and queryable.</p>
        </div>
        <div className="mt-7 relative z-10">
          <CommandBar onSubmit={onCommandSubmit} />
        </div>
        <TorontoSkyline className="absolute inset-x-0 bottom-0 h-10 text-white/15" />
      </div>

      {!state.query && (
        <div className="max-w-[1100px] mx-auto px-6 py-10 flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0 flex flex-col gap-8">
            {featuredSlot}
            {surfacedSlot}
          </div>
          <div className="lg:w-[280px] shrink-0">
            <SectionRail sections={sections} candidates={candidates} onSectionPick={onSectionPick} />
          </div>
        </div>
      )}
      {state.query && <ReceiptStream state={state} onFollowUp={onFollowUp} />}
    </div>
  );
}
```

Replace the entire contents of `web/app/page.tsx` with:

```tsx
import { SurfacedCards } from "@/components/SurfacedCards";
import { LandingShell } from "@/components/LandingShell";
import { FeaturedComparison } from "@/components/FeaturedComparison";
import { getFeaturedComparisons } from "@/lib/featured";
import { getSectionCounts, getCandidateSummaries } from "@/lib/sections";

export default function Home() {
  const featured = getFeaturedComparisons();
  const sections = getSectionCounts();
  const candidates = getCandidateSummaries();
  return (
    <LandingShell
      featuredSlot={<FeaturedComparison entries={featured} />}
      surfacedSlot={<SurfacedCards />}
      sections={sections}
      candidates={candidates}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/landing-shell.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/components/LandingShell.tsx web/app/page.tsx web/tests/landing-shell.test.ts
git rm --cached web/components/Chips.tsx 2>/dev/null || true   # only if deleted in Step 3
git commit -m "feat(homepage): assemble A1 editorial layout (lead + rail + grid)"
```

---

### Task 6: Full suite + production build verification (both skins)

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `cd web && npx vitest run`
Expected: PASS — all pre-existing tests plus the 4 new files (`sections`, `section-rail`, `featured-comparison-view`, `surfaced-cards-view`, `landing-shell`). No failures.

- [ ] **Step 2: Production build**

Run: `cd web && npm run build`
Expected: build completes with no errors (Upstash Redis "url/token missing" warnings and the NFT-trace warning are pre-existing and expected locally).

- [ ] **Step 3: Manual visual check (both skins)**

Start the production server and screenshot the homepage in light and dark:
Run: `cd web && PORT=3100 npm run start` (background), then load `http://localhost:3100/`.
Confirm: one dominant split lead, a right rail with section counts + candidates, a uniform surfaced grid (no empty third column, no ragged heights), single content frame, no dead side-space. Toggle the theme (ThemeToggle) and confirm both skins read correctly with no hardcoded-color artifacts. Stop the server when done.

- [ ] **Step 4: Commit (only if Step 3 surfaced fixable nits handled in prior tasks)**

No commit if verification is clean. If a nit is found, fix it in the owning task's file, re-run that task's test + `npm run build`, then commit with a `fix(homepage): …` message.

---

## Notes for the implementer

- **Do not** add `@testing-library/react` or any dependency. Component tests assert on source text only.
- **Do not** introduce hardcoded hex colors. Every color must be a token utility (`*-accent`, `*-success`, `*-rule`, `*-ink`, `*-ink-2`, `*-muted`, `*-surface`, `*-surface-2`, `*-masthead`, `*-masthead-ink`). The per-component tests include a `not.toMatch(/text-\[#|bg-\[#|border-\[#/)` guard.
- Tailwind JIT only sees **literal** class strings — that is why `GRID_COLS` and `DOT` hold full class names, never concatenated fragments.
- The `record.topic` field and `CandidateLanding.record_count` already exist in the shipped data; no data regeneration is required.
