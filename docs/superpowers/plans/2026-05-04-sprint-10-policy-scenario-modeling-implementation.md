# Sprint 10. Policy Scenario Modeling. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 5 curated policy scenario cards plus the infrastructure to publish more weekly. Cards live at `/scenarios/[slug]`, are retrievable by the chat agent via a new `get_scenario_card` tool, and unmatched queries log to Redis for an editorial backlog.

**Architecture:** New JSON content type at `web/public/data/scenarios/<slug>.json` validated by a Zod schema at load time. New routes `/scenarios` (index) and `/scenarios/[slug]` (detail) render via Server Components against the loader. Chat agent gains a 7th read-only tool that retrieves curated cards or logs no-match. New gated admin surface at `/admin/scenario-requests` reads the Redis log. All against the existing Documentary aesthetic from Sprint 9.

**Tech Stack:** Next.js 16.2.4 App Router, React 19 RC, TypeScript, Zod (new dependency), Tailwind CSS, Anthropic SDK, Upstash Redis, Vitest. Builds against `/Users/aramammo/thebradfordfiles/web/` (project root).

**Spec:** `docs/superpowers/specs/2026-05-04-sprint-10-policy-scenario-modeling.md`.

**Sequencing note.** Editorial work runs in parallel: 5 background research agents are producing content at `research/sprint-10/output/card-N-<topic>.md`. Tasks 1 to 22 build infrastructure against placeholder fixtures and do not depend on research output. Tasks 23 to 27 convert the research outputs to validated JSON files; if a research output is missing or stuck when its task is reached, defer that one card to a weekly drop and document the deferral.

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `web/lib/scenario-types.ts` | TS interfaces + Zod validator |
| `web/lib/scenario-loader.ts` | listScenarios, getScenario, setScenarioDataDir |
| `web/lib/agent/scenario-tool.ts` | get_scenario_card implementation, match + Redis logging |
| `web/components/ScenarioTierBadge.tsx` | T1/T2/T3/T4 badge component |
| `web/components/ScenarioComparableTabs.tsx` | client component, tabbed comparables |
| `web/components/ScenarioCard.tsx` | full card renderer, server component |
| `web/components/ScenarioCardTile.tsx` | small tile for index page |
| `web/app/scenarios/page.tsx` | index page |
| `web/app/scenarios/[slug]/page.tsx` | detail page |
| `web/app/admin/scenario-requests/page.tsx` | gated admin page |
| `web/app/api/admin/scenario-requests/route.ts` | admin endpoint, deduped Redis list |
| `web/app/api/admin/promote-to-skeleton/route.ts` | skeleton-generation endpoint |
| `web/public/data/scenarios/_fixture-valid.json` | test fixture (gitignored at deploy time) |
| `web/public/data/scenarios/housing-supply-mechanism.json` | content (Task 23) |
| `web/public/data/scenarios/transit-operating-funding.json` | content (Task 24) |
| `web/public/data/scenarios/property-tax-stance.json` | content (Task 25) |
| `web/public/data/scenarios/public-safety-approach.json` | content (Task 26) |
| `web/public/data/scenarios/climate-parks-investment.json` | content (Task 27) |
| `web/tests/scenario-types.test.ts` | validator tests |
| `web/tests/scenario-loader.test.ts` | loader tests |
| `web/tests/scenario-tool.test.ts` | agent tool tests |

### Modified files

| Path | Change |
|---|---|
| `web/package.json` | Add `zod` dependency |
| `web/lib/agent/tool-schemas.ts` | Add `get_scenario_card` schema |
| `web/lib/agent/system-prompt.ts` | Add scenario-retrieval guidance |
| `web/lib/agent/tools.ts` | Wire scenario-tool into dispatcher |
| `web/app/api/og/route.ts` | Add `type=scenario` variant |
| `web/app/methodology/page.tsx` | Add 4-tier source system + scenario framework |
| `web/app/sitemap.xml/route.ts` | Add /scenarios + /scenarios/[slug] URLs (or wherever sitemap lives) |

---

## Task 0. Verify Sprint 9 baseline

**Files:** none modified.

- [ ] **Step 1: Confirm clean working tree**

```bash
cd /Users/aramammo/thebradfordfiles
git status
```

Expected: `working tree clean` or only known unrelated changes. If unexpected changes exist, stop and ask.

- [ ] **Step 2: Run existing test suite**

```bash
cd /Users/aramammo/thebradfordfiles/web
npx vitest run
```

Expected: all tests pass (18 tests across card-validation, data-loader, agent-tools).

- [ ] **Step 3: Confirm production deploy is healthy**

```bash
/usr/bin/curl -sL -o /dev/null -w "%{http_code}\n" https://www.mayoralrecord.com/
```

Expected: `200`.

---

## Task 1. Add Zod dependency and create scenario-types.ts skeleton

**Files:**
- Modify: `web/package.json`
- Create: `web/lib/scenario-types.ts`

- [ ] **Step 1: Install zod**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm install zod
```

Expected: `zod` appears in `package.json` dependencies. `package-lock.json` updated.

- [ ] **Step 2: Create the type file with the four-tier and citation primitives**

Create `web/lib/scenario-types.ts`:

```typescript
import { z } from "zod";

export const TIERS = ["T1", "T2", "T3", "T4"] as const;
export type Tier = (typeof TIERS)[number];

export const CitationSchema = z.object({
  tier: z.enum(TIERS),
  label: z.string().min(1),
  url: z.string().url().optional(),
  retrieved: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/package.json web/package-lock.json web/lib/scenario-types.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): add zod and citation primitive for scenario cards

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2. Define the full ScenarioCard schema

**Files:**
- Modify: `web/lib/scenario-types.ts`

- [ ] **Step 1: Append candidate-position, mechanism, comparable, projection, and ScenarioCard schemas**

Append to `web/lib/scenario-types.ts`:

```typescript
export const CandidatePositionSchema = z.object({
  candidate_handle: z.string().min(1),
  candidate_name: z.string().min(1),
  summary: z.string().min(1),
  citations: z.array(CitationSchema),
});
export type CandidatePosition = z.infer<typeof CandidatePositionSchema>;

export const MechanismSchema = z.object({
  candidate_handle: z.string().min(1),
  summary: z.string().min(1),
});
export type Mechanism = z.infer<typeof MechanismSchema>;

export const ComparableSchema = z.object({
  name: z.string().min(1),
  period: z.string().min(1),
  summary: z.string().min(1),
  outcome: z.string().min(1),
  citations: z.array(CitationSchema),
  caveats: z.string().min(1),
});
export type Comparable = z.infer<typeof ComparableSchema>;

export const ProjectionSchema = z.object({
  scenario_label: z.string().min(1),
  range_or_value: z.string().min(1),
  citation: CitationSchema,
  notes: z.string().optional(),
});
export type Projection = z.infer<typeof ProjectionSchema>;

export const ProjectionsBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plural"),
    intro: z.string().min(1),
    items: z.array(ProjectionSchema).min(2).max(3),
  }),
  z.object({
    kind: z.literal("thin"),
    rationale: z.string().min(1),
  }),
]);
export type ProjectionsBlock = z.infer<typeof ProjectionsBlockSchema>;

export const ScenarioCardSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    topic: z.string().min(1),
    topic_short: z.string().min(1),
    pull_quote: z.string().min(40).max(400),
    who_benefits: z.object({
      intro: z.string().min(1),
      mechanisms: z.array(MechanismSchema).min(1),
      literature_row: z.array(CitationSchema),
    }),
    positions: z.array(CandidatePositionSchema).min(1),
    status_quo: z.object({
      summary: z.string().min(1),
      existing_policy_stack: z.array(
        z.object({
          label: z.string().min(1),
          citations: z.array(CitationSchema),
        })
      ),
      citations: z.array(CitationSchema),
    }),
    comparables: z.array(ComparableSchema).min(3).max(5),
    projections: ProjectionsBlockSchema,
    time_horizon: z.string().optional(),
    meta: z.object({
      last_reviewed: z.string(),
      next_review: z.string(),
      methodology_notes: z.string().optional(),
    }),
  })
  .superRefine((card, ctx) => {
    const allCitations: Citation[] = [];
    allCitations.push(...card.who_benefits.literature_row);
    for (const p of card.positions) allCitations.push(...p.citations);
    allCitations.push(...card.status_quo.citations);
    for (const e of card.status_quo.existing_policy_stack) allCitations.push(...e.citations);
    for (const c of card.comparables) allCitations.push(...c.citations);
    if (card.projections.kind === "plural") {
      for (const p of card.projections.items) allCitations.push(p.citation);
    }
    const hasT4 = allCitations.some((c) => c.tier === "T4");
    if (hasT4 && !card.meta.methodology_notes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cards with T4 citations require meta.methodology_notes",
        path: ["meta", "methodology_notes"],
      });
    }
  });
export type ScenarioCard = z.infer<typeof ScenarioCardSchema>;
```

- [ ] **Step 2: Add em-dash guard and validator function**

Append to `web/lib/scenario-types.ts`:

```typescript
const EM_DASH = "—";

export function containsEmDash(card: unknown): boolean {
  return JSON.stringify(card).includes(EM_DASH);
}

export interface ValidationResult {
  ok: boolean;
  card?: ScenarioCard;
  errors?: string[];
}

export function validateScenarioCard(input: unknown): ValidationResult {
  if (containsEmDash(input)) {
    return { ok: false, errors: ["Card contains an em dash (U+2014). Use periods, commas, colons, or parentheses instead."] };
  }
  const parsed = ScenarioCardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { ok: true, card: parsed.data };
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/scenario-types.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): scenario card zod schema + em dash guard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3. Validator tests + valid fixture

**Files:**
- Create: `web/tests/scenario-types.test.ts`
- Create: `web/tests/fixtures/valid-scenario.ts`

- [ ] **Step 1: Create a reusable valid-card factory**

Create `web/tests/fixtures/valid-scenario.ts`:

```typescript
import type { ScenarioCard } from "@/lib/scenario-types";

export function validScenario(overrides: Partial<ScenarioCard> = {}): ScenarioCard {
  return {
    slug: "test-scenario",
    topic: "Test topic statement that runs more than a handful of words.",
    topic_short: "Test topic",
    pull_quote: "Research finds that the test mechanism reaches different populations on different timeframes. Both candidates analyzed under the same framework.",
    who_benefits: {
      intro: "Research on the incidence of the test mechanism shows two patterns.",
      mechanisms: [
        { candidate_handle: "bradfordgrams", summary: "Pattern A. Two sentences with caveats." },
        { candidate_handle: "oliviachow", summary: "Pattern B. Two sentences with caveats." },
      ],
      literature_row: [
        { tier: "T2", label: "Wellesley Inst. 2024" },
        { tier: "T3", label: "JCH 2019" },
      ],
    },
    positions: [
      {
        candidate_handle: "bradfordgrams",
        candidate_name: "Brad Bradford",
        summary: "Position A in one to two sentences.",
        citations: [{ tier: "T1", label: "Bradford 2026 platform" }],
      },
      {
        candidate_handle: "oliviachow",
        candidate_name: "Olivia Chow",
        summary: "Position B in one to two sentences.",
        citations: [{ tier: "T1", label: "Chow 2026 platform" }],
      },
    ],
    status_quo: {
      summary: "Toronto currently does X with cited numbers.",
      existing_policy_stack: [
        { label: "Existing program A", citations: [{ tier: "T1", label: "City budget 2024" }] },
        { label: "Existing program B", citations: [{ tier: "T1", label: "Provincial doc 2023" }] },
      ],
      citations: [{ tier: "T1", label: "CMHC 2024" }],
    },
    comparables: [
      {
        name: "Vienna",
        period: "1990s to present",
        summary: "City did X over period Y.",
        outcome: "Outcome Z with numerical citation.",
        citations: [{ tier: "T2", label: "OECD 2023" }],
        caveats: "Different legal regime around land ownership.",
      },
      {
        name: "Singapore",
        period: "1960s to present",
        summary: "City did A over period B.",
        outcome: "Outcome C with numerical citation.",
        citations: [{ tier: "T3", label: "Phang 2018" }],
        caveats: "Different state capacity.",
      },
      {
        name: "Auckland",
        period: "2016 to 2023",
        summary: "City did D over period E.",
        outcome: "Outcome F with numerical citation.",
        citations: [{ tier: "T3", label: "Greenaway-McGrevy 2023" }],
        caveats: "Smaller scale than Toronto.",
      },
    ],
    projections: { kind: "thin", rationale: "Literature does not support a confident singular projection on this question. The comparable-jurisdiction outcomes above are the closest defensible numerical anchors." },
    meta: {
      last_reviewed: "2026-05-04",
      next_review: "2026-05-18",
    },
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/tests/scenario-types.test.ts`:

```typescript
import { test, expect } from "vitest";
import { validateScenarioCard } from "@/lib/scenario-types";
import { validScenario } from "./fixtures/valid-scenario";

test("validateScenarioCard accepts a fully-formed card", () => {
  const result = validateScenarioCard(validScenario());
  expect(result.ok).toBe(true);
  expect(result.card?.slug).toBe("test-scenario");
});

test("validateScenarioCard rejects a card missing pull_quote", () => {
  const card = validScenario();
  const broken = { ...card, pull_quote: undefined } as unknown;
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("pull_quote"))).toBe(true);
});

test("validateScenarioCard rejects a card with an invalid tier", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  broken.positions[0].citations[0].tier = "T7";
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard rejects content with an em dash", () => {
  const card = validScenario({ pull_quote: "Research — finds that the test mechanism reaches different populations." });
  const result = validateScenarioCard(card);
  expect(result.ok).toBe(false);
  expect(result.errors?.[0]).toContain("em dash");
});

test("validateScenarioCard requires methodology_notes when T4 citations are present", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  broken.who_benefits.literature_row.push({ tier: "T4", label: "Mayoral Record extrapolation" });
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("methodology_notes"))).toBe(true);
});

test("validateScenarioCard rejects fewer than 3 comparables", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  broken.comparables = broken.comparables.slice(0, 2);
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard rejects more than 5 comparables", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  const extra = broken.comparables[0];
  broken.comparables = [extra, extra, extra, extra, extra, extra];
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard rejects pull_quote shorter than 40 chars", () => {
  const card = validScenario({ pull_quote: "too short" });
  const result = validateScenarioCard(card);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard accepts a plural projections block", () => {
  const card = validScenario({
    projections: {
      kind: "plural",
      intro: "Literature supports a range.",
      items: [
        { scenario_label: "Low", range_or_value: "+2%", citation: { tier: "T3", label: "Author 2024" } },
        { scenario_label: "High", range_or_value: "+8%", citation: { tier: "T3", label: "Author 2024" } },
      ],
    },
  });
  const result = validateScenarioCard(card);
  expect(result.ok).toBe(true);
});
```

- [ ] **Step 3: Run tests to verify they fail (validator partly works, fixtures untested)**

```bash
cd /Users/aramammo/thebradfordfiles/web
npx vitest run tests/scenario-types.test.ts
```

Expected: all 9 tests PASS (validator was implemented in Task 2; this task adds the test coverage). If any fail, fix the validator before proceeding.

- [ ] **Step 4: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/tests/scenario-types.test.ts web/tests/fixtures/valid-scenario.ts
git commit -m "$(cat <<'EOF'
test(sprint-10): scenario validator coverage + valid fixture factory

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4. Scenario loader

**Files:**
- Create: `web/lib/scenario-loader.ts`

- [ ] **Step 1: Create the loader with setScenarioDataDir, listScenarios, getScenario**

Create `web/lib/scenario-loader.ts`:

```typescript
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateScenarioCard, type ScenarioCard } from "./scenario-types";

let SCENARIO_DIR = join(process.cwd(), "public", "data", "scenarios");

export function setScenarioDataDir(path: string): void {
  SCENARIO_DIR = path;
}

export function listScenarios(): ScenarioCard[] {
  if (!existsSync(SCENARIO_DIR)) return [];
  const files = readdirSync(SCENARIO_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_")
  );
  const out: ScenarioCard[] = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(SCENARIO_DIR, f), "utf-8"));
    const result = validateScenarioCard(raw);
    if (result.ok && result.card) out.push(result.card);
  }
  return out.sort((a, b) => a.topic_short.localeCompare(b.topic_short));
}

export function getScenario(slug: string): ScenarioCard | null {
  const path = join(SCENARIO_DIR, `${slug}.json`);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const result = validateScenarioCard(raw);
  return result.ok && result.card ? result.card : null;
}

export function listScenarioSlugs(): string[] {
  return listScenarios().map((c) => c.slug);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/scenario-loader.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): scenario loader with setScenarioDataDir

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5. Loader tests

**Files:**
- Create: `web/tests/scenario-loader.test.ts`

- [ ] **Step 1: Write the tests**

Create `web/tests/scenario-loader.test.ts`:

```typescript
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setScenarioDataDir, listScenarios, getScenario, listScenarioSlugs } from "@/lib/scenario-loader";
import { validScenario } from "./fixtures/valid-scenario";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-scenarios-"));
  setScenarioDataDir(tmp);
});

test("listScenarios returns empty when directory is empty", () => {
  expect(listScenarios()).toEqual([]);
});

test("listScenarios loads valid JSON files", () => {
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validScenario({ slug: "a", topic_short: "A topic" })));
  writeFileSync(join(tmp, "b.json"), JSON.stringify(validScenario({ slug: "b", topic_short: "B topic" })));
  const cards = listScenarios();
  expect(cards).toHaveLength(2);
  expect(cards.map((c) => c.slug)).toEqual(["a", "b"]);
});

test("listScenarios skips invalid JSON", () => {
  writeFileSync(join(tmp, "valid.json"), JSON.stringify(validScenario({ slug: "valid" })));
  writeFileSync(join(tmp, "broken.json"), JSON.stringify({ slug: "broken" }));
  const cards = listScenarios();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("valid");
});

test("listScenarios skips files starting with underscore", () => {
  writeFileSync(join(tmp, "_fixture-valid.json"), JSON.stringify(validScenario({ slug: "fixture" })));
  writeFileSync(join(tmp, "real.json"), JSON.stringify(validScenario({ slug: "real" })));
  const cards = listScenarios();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("real");
});

test("getScenario returns the card by slug", () => {
  writeFileSync(join(tmp, "housing.json"), JSON.stringify(validScenario({ slug: "housing", topic_short: "Housing" })));
  const card = getScenario("housing");
  expect(card?.slug).toBe("housing");
});

test("getScenario returns null for unknown slug", () => {
  expect(getScenario("nonexistent")).toBeNull();
});

test("listScenarioSlugs returns all valid slugs sorted by topic_short", () => {
  writeFileSync(join(tmp, "z.json"), JSON.stringify(validScenario({ slug: "z", topic_short: "Z" })));
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validScenario({ slug: "a", topic_short: "A" })));
  expect(listScenarioSlugs()).toEqual(["a", "z"]);
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
npx vitest run tests/scenario-loader.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/tests/scenario-loader.test.ts
git commit -m "$(cat <<'EOF'
test(sprint-10): scenario loader coverage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6. ScenarioTierBadge component

**Files:**
- Create: `web/components/ScenarioTierBadge.tsx`

- [ ] **Step 1: Create the component**

Create `web/components/ScenarioTierBadge.tsx`:

```tsx
import type { Tier } from "@/lib/scenario-types";

const TIER_STYLES: Record<Tier, { border: string; text: string; bg: string }> = {
  T1: { border: "border-[#a07223]", text: "text-[#a07223]", bg: "bg-[#fbfbf9]" },
  T2: { border: "border-[#1c1c1c66]", text: "text-[#1c1c1c]", bg: "bg-[#fbfbf9]" },
  T3: { border: "border-[#1c1c1c66]", text: "text-[#1c1c1c]", bg: "bg-[#fbfbf9]" },
  T4: { border: "border-[#5a5a55]", text: "text-[#5a5a55]", bg: "bg-[#f0eee8]" },
};

const TIER_TITLES: Record<Tier, string> = {
  T1: "Primary government data",
  T2: "Independent analysis",
  T3: "Peer-reviewed academic",
  T4: "Mayoral Record extrapolation",
};

export function ScenarioTierBadge({ tier }: { tier: Tier }) {
  const styles = TIER_STYLES[tier];
  return (
    <span
      className={`inline-block font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm mr-1 align-baseline ${styles.border} ${styles.text} ${styles.bg}`}
      title={TIER_TITLES[tier]}
    >
      {tier}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ScenarioTierBadge.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-10): scenario tier badge component (T1 to T4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7. ScenarioComparableTabs (client component)

**Files:**
- Create: `web/components/ScenarioComparableTabs.tsx`

- [ ] **Step 1: Create the client component**

Create `web/components/ScenarioComparableTabs.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Comparable } from "@/lib/scenario-types";
import { ScenarioTierBadge } from "./ScenarioTierBadge";

export function ScenarioComparableTabs({ comparables }: { comparables: Comparable[] }) {
  const [active, setActive] = useState(0);
  if (comparables.length === 0) return null;
  const current = comparables[active];

  return (
    <div>
      <div className="flex border-b border-[#1c1c1c33] mb-4">
        {comparables.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setActive(i)}
            className={`font-mono text-xs px-3 py-1.5 border border-b-0 -mb-px ${
              i === active
                ? "bg-[#fbfbf9] text-[#1c1c1c] border-[#a07223] font-semibold"
                : "bg-[#f0eee8] text-[#5a5a55] border-[#1c1c1c33]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div>
        <h5 className="font-serif text-base font-bold mb-1.5">
          {current.name}
          <span className="font-mono text-xs font-normal text-[#5a5a55] ml-2">{current.period}</span>
        </h5>
        <p className="text-sm mb-2">{current.summary}</p>
        <p className="text-sm mb-2"><strong>Outcome.</strong> {current.outcome}</p>
        <p className="text-xs text-[#5a5a55] italic mb-2">Caveats. {current.caveats}</p>
        <p className="text-xs text-[#5a5a55]">
          {current.citations.map((c, i) => (
            <span key={i}><ScenarioTierBadge tier={c.tier} />{c.label}{c.url ? ` (${c.url})` : ""}{i < current.citations.length - 1 ? " . " : ""}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ScenarioComparableTabs.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-10): tabbed comparable jurisdictions client component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8. ScenarioCard renderer (server component)

**Files:**
- Create: `web/components/ScenarioCard.tsx`

- [ ] **Step 1: Create the renderer**

Create `web/components/ScenarioCard.tsx`:

```tsx
import type { ScenarioCard as ScenarioCardData, Citation } from "@/lib/scenario-types";
import { ScenarioTierBadge } from "./ScenarioTierBadge";
import { ScenarioComparableTabs } from "./ScenarioComparableTabs";

function CitationRow({ citations }: { citations: Citation[] }) {
  return (
    <p className="text-xs text-[#5a5a55] mt-2">
      {citations.map((c, i) => (
        <span key={i}>
          <ScenarioTierBadge tier={c.tier} />
          {c.label}
          {c.url ? <> (<a href={c.url} className="underline" target="_blank" rel="noopener">link</a>)</> : null}
          {i < citations.length - 1 ? " . " : ""}
        </span>
      ))}
    </p>
  );
}

export function ScenarioCard({ card }: { card: ScenarioCardData }) {
  return (
    <article className="max-w-[760px] mx-auto px-4 py-8 bg-[#fbfbf9] text-[#1c1c1c]">
      <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight mb-1">{card.topic}</h1>
      <p className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] pb-4 mb-6 border-b border-[#1c1c1c1a]">
        Scenario . Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>

      <section className="bg-[#f5f2ea] border-l-4 border-[#a07223] px-6 py-5 mb-7">
        <h2 className="font-serif text-xl font-bold mb-3">Who would each mechanism reach?</h2>
        <p className="mb-4 text-sm">{card.who_benefits.intro}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {card.who_benefits.mechanisms.map((m) => {
            const pos = card.positions.find((p) => p.candidate_handle === m.candidate_handle);
            return (
              <div key={m.candidate_handle}>
                <h3 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mb-1.5">
                  {pos?.candidate_name ?? m.candidate_handle}
                </h3>
                <p className="text-sm">{m.summary}</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-[#5a5a55] mt-4 pt-3 border-t border-dotted border-[#5a5a55]">
          <strong className="text-[#1c1c1c]">Literature.</strong>{" "}
          {card.who_benefits.literature_row.map((c, i) => (
            <span key={i}><ScenarioTierBadge tier={c.tier} />{c.label}{i < card.who_benefits.literature_row.length - 1 ? " . " : ""}</span>
          ))}
        </p>
      </section>

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Candidate positions</h2>
      <div className={`grid gap-6 mb-6 ${card.positions.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
        {card.positions.map((p) => (
          <div key={p.candidate_handle}>
            <h3 className="font-serif text-base font-bold mb-1.5">{p.candidate_name}</h3>
            <p className="text-sm mb-2">{p.summary}</p>
            <CitationRow citations={p.citations} />
          </div>
        ))}
      </div>

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">
        Status quo. What Toronto already does.
      </h2>
      <p className="text-sm mb-2">{card.status_quo.summary}</p>
      <ul className="list-disc pl-5 text-sm mb-2 space-y-1">
        {card.status_quo.existing_policy_stack.map((e, i) => (
          <li key={i}>
            {e.label}
            <span className="text-xs text-[#5a5a55] ml-2">
              {e.citations.map((c, j) => (
                <span key={j}><ScenarioTierBadge tier={c.tier} />{c.label}{j < e.citations.length - 1 ? " . " : ""}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <CitationRow citations={card.status_quo.citations} />

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Comparable jurisdictions</h2>
      <ScenarioComparableTabs comparables={card.comparables} />

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Projections</h2>
      {card.projections.kind === "plural" ? (
        <>
          <p className="text-sm mb-2">{card.projections.intro}</p>
          <ul className="list-none pl-0 text-sm mb-2 space-y-2">
            {card.projections.items.map((p, i) => (
              <li key={i} className="border-l-2 border-[#1c1c1c33] pl-3">
                <strong>{p.scenario_label}.</strong> {p.range_or_value}
                {p.notes ? <> ({p.notes})</> : null}
                <span className="block text-xs text-[#5a5a55] mt-1">
                  <ScenarioTierBadge tier={p.citation.tier} />{p.citation.label}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm italic text-[#5a5a55]">{card.projections.rationale}</p>
      )}

      {card.time_horizon ? (
        <>
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Time horizon</h2>
          <p className="text-sm">{card.time_horizon}</p>
        </>
      ) : null}

      {card.meta.methodology_notes ? (
        <>
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Methodology</h2>
          <p className="text-sm text-[#5a5a55]">{card.meta.methodology_notes}</p>
        </>
      ) : null}

      <footer className="mt-10 pt-4 border-t border-[#1c1c1c1a] font-mono text-xs uppercase tracking-wider text-[#5a5a55]">
        <a href="/methodology" className="underline">Methodology</a>
        <span className="mx-2">.</span>
        Next review {card.meta.next_review}
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ScenarioCard.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-10): full scenario card renderer with who-benefits leading

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9. ScenarioCardTile

**Files:**
- Create: `web/components/ScenarioCardTile.tsx`

- [ ] **Step 1: Create the tile component**

Create `web/components/ScenarioCardTile.tsx`:

```tsx
import Link from "next/link";
import type { ScenarioCard } from "@/lib/scenario-types";

export function ScenarioCardTile({ card }: { card: ScenarioCard }) {
  return (
    <Link
      href={`/scenarios/${card.slug}`}
      className="block bg-[#fbfbf9] border border-[#1c1c1c33] hover:border-[#a07223] transition-colors p-5"
    >
      <h3 className="font-serif text-lg font-bold leading-snug mb-2">{card.topic_short}</h3>
      <p className="text-sm text-[#1c1c1c] mb-3 leading-relaxed">{card.pull_quote}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#5a5a55]">
        Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ScenarioCardTile.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-10): scenario card tile for index page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10. /scenarios index page

**Files:**
- Create: `web/app/scenarios/page.tsx`

- [ ] **Step 1: Create the index page**

Create `web/app/scenarios/page.tsx`:

```tsx
import type { Metadata } from "next";
import { listScenarios } from "@/lib/scenario-loader";
import { ScenarioCardTile } from "@/components/ScenarioCardTile";

export const metadata: Metadata = {
  title: "Scenarios . The Mayoral Record",
  description: "Curated, evidence-backed analysis of contested policy positions in the Toronto 2026 mayoral race.",
  openGraph: {
    title: "Scenarios . The Mayoral Record",
    description: "Curated policy scenario analysis. Toronto 2026 mayoral race.",
    images: [{ url: "/api/og?type=scenarios-index", width: 1200, height: 630 }],
  },
};

export default function ScenariosIndexPage() {
  const cards = listScenarios();

  return (
    <main className="max-w-[920px] mx-auto px-4 py-10">
      <header className="mb-8 pb-6 border-b border-[#1c1c1c1a]">
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight mb-3">Policy scenarios</h1>
        <p className="text-base leading-relaxed text-[#1c1c1c] max-w-[640px]">
          Curated analysis of contested positions in the Toronto 2026 race. Each card surfaces who each mechanism reaches, what Toronto already does, and what comparable cities have shown. Every claim cites its source.
        </p>
        <p className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-4">
          <a href="/methodology" className="underline">Methodology and source-tier system</a>
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="text-sm text-[#5a5a55] italic">No scenario cards published yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {cards.map((c) => (
            <ScenarioCardTile key={c.slug} card={c} />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/scenarios/page.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-10): /scenarios index page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11. /scenarios/[slug] detail page

**Files:**
- Create: `web/app/scenarios/[slug]/page.tsx`

- [ ] **Step 1: Create the detail page with metadata + static params**

Create `web/app/scenarios/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScenario, listScenarioSlugs } from "@/lib/scenario-loader";
import { ScenarioCard } from "@/components/ScenarioCard";

export async function generateStaticParams() {
  return listScenarioSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const card = getScenario(slug);
  if (!card) return { title: "Scenario not found . The Mayoral Record" };
  const ogUrl = `/api/og?type=scenario&slug=${encodeURIComponent(slug)}`;
  return {
    title: `${card.topic_short} . The Mayoral Record`,
    description: card.pull_quote,
    openGraph: {
      title: `${card.topic_short} . The Mayoral Record`,
      description: card.pull_quote,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: card.topic_short,
      description: card.pull_quote,
      images: [ogUrl],
    },
  };
}

export default async function ScenarioDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const card = getScenario(slug);
  if (!card) notFound();
  return <ScenarioCard card={card} />;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/scenarios/[slug]/page.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-10): /scenarios/[slug] detail page with static params and og

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12. Add get_scenario_card to TOOL_SCHEMAS

**Files:**
- Modify: `web/lib/agent/tool-schemas.ts`

- [ ] **Step 1: Append the new tool schema before emit_card**

In `web/lib/agent/tool-schemas.ts`, insert this entry into the `TOOL_SCHEMAS` array immediately before the `emit_card` entry:

```typescript
  {
    name: "get_scenario_card",
    description: "Retrieve a curated policy scenario card for the user's question. Use when the user asks 'what would this mean', 'who benefits', 'what would happen if', or any question that asks about implications of a candidate's position rather than what they said. Never generate modeling content yourself; this tool returns curated, reviewed cards or a no-match response. On match, emit a single_answer card whose answer is the returned pull_quote, with one stamp linking to /scenarios/<slug>. On no_match, tell the reader the question hasn't been modeled yet.",
    input_schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "The user's verbatim question" },
        topic_hint: {
          type: "string",
          description: "Best-guess topic slug if recognisable: housing-supply-mechanism, transit-operating-funding, property-tax-stance, public-safety-approach, climate-parks-investment.",
        },
      },
    },
  },
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/agent/tool-schemas.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): add get_scenario_card tool schema (7th agent tool)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13. scenario-tool.ts implementation

**Files:**
- Create: `web/lib/agent/scenario-tool.ts`

- [ ] **Step 1: Create the implementation**

Create `web/lib/agent/scenario-tool.ts`:

```typescript
import { listScenarios } from "@/lib/scenario-loader";

export type ScenarioToolInput = { query: string; topic_hint?: string };
export type ScenarioToolResult =
  | { status: "matched"; slug: string; topic_short: string; pull_quote: string }
  | { status: "no_match" };

export interface RedisLogger {
  lpush(key: string, value: string): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "for", "in", "on", "at", "by", "with",
  "and", "or", "but", "is", "are", "was", "were", "be", "been", "being",
  "what", "would", "this", "that", "do", "does", "did", "how", "why",
  "i", "you", "we", "they", "it", "us", "them", "if", "when", "where",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function score(query: string, haystack: string): number {
  const q = new Set(tokenize(query));
  const h = tokenize(haystack);
  if (q.size === 0 || h.length === 0) return 0;
  let hits = 0;
  for (const t of h) if (q.has(t)) hits += 1;
  return hits / q.size;
}

const MATCH_THRESHOLD = 0.4;

export async function getScenarioCard(
  input: ScenarioToolInput,
  logger: RedisLogger | null,
  agentReasoning: string
): Promise<ScenarioToolResult> {
  const cards = listScenarios();
  if (cards.length === 0) return { status: "no_match" };

  if (input.topic_hint) {
    const exact = cards.find((c) => c.slug === input.topic_hint);
    if (exact) {
      return { status: "matched", slug: exact.slug, topic_short: exact.topic_short, pull_quote: exact.pull_quote };
    }
  }

  let best: { card: typeof cards[number]; score: number } | null = null;
  for (const card of cards) {
    const haystack = `${card.topic} ${card.topic_short} ${card.pull_quote}`;
    const s = score(input.query, haystack);
    if (!best || s > best.score) best = { card, score: s };
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    return {
      status: "matched",
      slug: best.card.slug,
      topic_short: best.card.topic_short,
      pull_quote: best.card.pull_quote,
    };
  }

  if (logger) {
    const entry = JSON.stringify({
      query: input.query,
      timestamp: new Date().toISOString(),
      agent_reasoning: agentReasoning,
    });
    await logger.lpush("scenarios:unmatched", entry);
    await logger.ltrim("scenarios:unmatched", 0, 999);
  }

  return { status: "no_match" };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/agent/scenario-tool.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): scenario tool with keyword match + Redis no-match logging

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14. Tests for scenario-tool

**Files:**
- Create: `web/tests/scenario-tool.test.ts`

- [ ] **Step 1: Write the tests**

Create `web/tests/scenario-tool.test.ts`:

```typescript
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setScenarioDataDir } from "@/lib/scenario-loader";
import { getScenarioCard, type RedisLogger } from "@/lib/agent/scenario-tool";
import { validScenario } from "./fixtures/valid-scenario";

let tmp: string;
const housing = validScenario({
  slug: "housing-supply-mechanism",
  topic: "City as developer or private-sector primary",
  topic_short: "Housing supply",
  pull_quote: "Research finds the two mechanisms reach different populations on different timeframes. Bradford supply-side and Chow direct delivery target distinct beneficiary groups.",
});
const transit = validScenario({
  slug: "transit-operating-funding",
  topic: "TTC operating funding mechanism",
  topic_short: "Transit operating funding",
  pull_quote: "Toronto faces a structural transit operating gap through 2034. Bradford and Chow propose different revenue mechanisms with different incidence profiles.",
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-scn-tool-"));
  setScenarioDataDir(tmp);
  writeFileSync(join(tmp, "housing-supply-mechanism.json"), JSON.stringify(housing));
  writeFileSync(join(tmp, "transit-operating-funding.json"), JSON.stringify(transit));
});

class FakeLogger implements RedisLogger {
  pushed: string[] = [];
  trims: [string, number, number][] = [];
  async lpush(key: string, value: string) { this.pushed.push(`${key}:${value}`); return 1; }
  async ltrim(key: string, start: number, stop: number) { this.trims.push([key, start, stop]); return "OK"; }
}

test("matches via topic_hint exact", async () => {
  const r = await getScenarioCard(
    { query: "irrelevant text", topic_hint: "housing-supply-mechanism" },
    null,
    "agent reasoned about a hint"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("housing-supply-mechanism");
});

test("matches via keyword overlap when query mentions topic", async () => {
  const r = await getScenarioCard(
    { query: "What would happen if Toronto cut development charges to boost housing supply?" },
    null,
    "agent saw housing keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("housing-supply-mechanism");
});

test("matches transit query to transit card", async () => {
  const r = await getScenarioCard(
    { query: "Who pays for the TTC operating budget through 2034?" },
    null,
    "transit keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("transit-operating-funding");
});

test("returns no_match for clearly off-topic query", async () => {
  const logger = new FakeLogger();
  const r = await getScenarioCard(
    { query: "What is the best pizza topping?" },
    logger,
    "no scenario applies"
  );
  expect(r.status).toBe("no_match");
});

test("logs no_match queries to Redis with timestamp and reasoning", async () => {
  const logger = new FakeLogger();
  await getScenarioCard(
    { query: "Tell me about constellations." },
    logger,
    "scenario corpus does not cover astronomy"
  );
  expect(logger.pushed).toHaveLength(1);
  const entry = logger.pushed[0];
  expect(entry).toContain("scenarios:unmatched:");
  expect(entry).toContain("constellations");
  expect(entry).toContain("astronomy");
});

test("trims the Redis list to 1000 entries on each no_match", async () => {
  const logger = new FakeLogger();
  await getScenarioCard({ query: "completely unrelated" }, logger, "no match");
  expect(logger.trims).toEqual([["scenarios:unmatched", 0, 999]]);
});

test("returns no_match when no scenarios are loaded", async () => {
  const empty = mkdtempSync(join(tmpdir(), "tomr-empty-"));
  setScenarioDataDir(empty);
  const r = await getScenarioCard({ query: "anything" }, null, "no corpus");
  expect(r.status).toBe("no_match");
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
npx vitest run tests/scenario-tool.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/tests/scenario-tool.test.ts
git commit -m "$(cat <<'EOF'
test(sprint-10): scenario tool match + Redis logging coverage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15. Wire scenario tool into agent dispatcher and update system prompt

**Files:**
- Modify: `web/lib/agent/tools.ts`
- Modify: `web/lib/agent/system-prompt.ts`

- [ ] **Step 1: Read existing tools.ts dispatcher to find insertion point**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/web/lib/agent/tools.ts | /usr/bin/grep -n "switch\|case " | /usr/bin/head -20
```

Note the line number where the existing tool dispatch switch lives (near top of `runTool` or similar function).

- [ ] **Step 2: Add the scenario tool case**

In `web/lib/agent/tools.ts`, locate the function that dispatches tools by name (likely `runTool` or `executeAgentTool`). Add this import at the top of the file:

```typescript
import { getScenarioCard } from "@/lib/agent/scenario-tool";
import { Redis } from "@upstash/redis";
```

Add this case to the dispatch switch (right before the `emit_card` case if there is one, otherwise at the end before the default):

```typescript
    case "get_scenario_card": {
      const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
      const logger = url && token ? new Redis({ url, token }) : null;
      const reasoning = typeof input?.topic_hint === "string"
        ? `topic_hint: ${input.topic_hint}`
        : "no topic_hint provided";
      return await getScenarioCard(
        { query: String(input?.query ?? ""), topic_hint: input?.topic_hint as string | undefined },
        logger,
        reasoning
      );
    }
```

- [ ] **Step 3: Update agent system prompt**

In `web/lib/agent/system-prompt.ts`, find the existing rules list and add a new rule about scenario retrieval. The exact location depends on the prompt structure but should be at the same level as the rules about emit_card terminus and citation discipline. Append this rule:

```typescript
// Add as a rule in AGENT_SYSTEM_PROMPT:
`When the user asks about implications. Questions like "what would this mean", "who benefits", "what would happen if", "how does this compare to", or "is this realistic" are scenario-modeling questions. Call get_scenario_card with the verbatim query and your best-guess topic_hint (one of: housing-supply-mechanism, transit-operating-funding, property-tax-stance, public-safety-approach, climate-parks-investment). If matched, emit a single_answer card whose answer body is the returned pull_quote and which has exactly one stamp with label "Read full scenario card" and url "/scenarios/<slug>". If no_match, emit a single_answer card saying the question has not been modeled yet, with a suggestion to ask about a related candidate position instead. Never generate modeling content yourself.`
```

- [ ] **Step 4: Run all tests to confirm nothing regressed**

```bash
cd /Users/aramammo/thebradfordfiles/web
npx vitest run
```

Expected: all tests pass (existing 18 + new scenario tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/agent/tools.ts web/lib/agent/system-prompt.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): wire scenario tool into agent dispatcher and prompt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16. Admin endpoint: /api/admin/scenario-requests

**Files:**
- Create: `web/app/api/admin/scenario-requests/route.ts`

- [ ] **Step 1: Create the route**

Create `web/app/api/admin/scenario-requests/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SHARED_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === expected;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return NextResponse.json({ error: "redis_not_configured" }, { status: 503 });
  }
  const redis = new Redis({ url, token });
  const raw = await redis.lrange("scenarios:unmatched", 0, 99);

  type Entry = { query: string; timestamp: string; agent_reasoning: string };
  const entries: Entry[] = (raw as string[])
    .map((s): Entry | null => {
      try { return JSON.parse(s) as Entry; } catch { return null; }
    })
    .filter((e): e is Entry => e !== null);

  const groups = new Map<string, { query: string; count: number; latest: string; reasonings: string[] }>();
  for (const e of entries) {
    const key = e.query.toLowerCase().replace(/\s+/g, " ").trim();
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (e.timestamp > existing.latest) existing.latest = e.timestamp;
      existing.reasonings.push(e.agent_reasoning);
    } else {
      groups.set(key, { query: e.query, count: 1, latest: e.timestamp, reasonings: [e.agent_reasoning] });
    }
  }
  const items = [...groups.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));

  return NextResponse.json({ items, total_logged: entries.length });
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/api/admin/scenario-requests/route.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): admin endpoint for deduped scenario request log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17. Promote-to-skeleton endpoint

**Files:**
- Create: `web/app/api/admin/promote-to-skeleton/route.ts`

- [ ] **Step 1: Create the route**

Create `web/app/api/admin/promote-to-skeleton/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SHARED_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  return auth.slice(7) === expected;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null) as { slug?: string; topic_short?: string; topic?: string; query?: string } | null;
  if (!body?.slug || !/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  if (!body.topic || !body.topic_short) {
    return NextResponse.json({ error: "topic_required" }, { status: 400 });
  }

  const dir = join(process.cwd(), "public", "data", "scenarios");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${body.slug}.json`);
  if (existsSync(path)) {
    return NextResponse.json({ error: "slug_exists", path }, { status: 409 });
  }

  const skeleton = {
    slug: body.slug,
    topic: body.topic,
    topic_short: body.topic_short,
    pull_quote: `Skeleton for "${body.topic_short}". Replace with 1 to 3 sentences of evidentiary pull quote before publishing.`,
    who_benefits: { intro: "Replace with 1 to 2 sentences framing the incidence question.", mechanisms: [], literature_row: [] },
    positions: [],
    status_quo: { summary: "Replace with current Toronto state.", existing_policy_stack: [], citations: [] },
    comparables: [],
    projections: { kind: "thin", rationale: "Literature does not support a confident singular projection on this question. The comparable-jurisdiction outcomes above are the closest defensible numerical anchors." },
    meta: { last_reviewed: new Date().toISOString().slice(0, 10), next_review: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10) },
    _skeleton: { source_query: body.query ?? null, generated: new Date().toISOString() },
  };

  writeFileSync(path, JSON.stringify(skeleton, null, 2));
  return NextResponse.json({ ok: true, path: `/public/data/scenarios/${body.slug}.json` });
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/api/admin/promote-to-skeleton/route.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): promote-to-skeleton endpoint for editorial backlog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18. /admin/scenario-requests page

**Files:**
- Create: `web/app/admin/scenario-requests/page.tsx`

- [ ] **Step 1: Create the gated admin page**

Create `web/app/admin/scenario-requests/page.tsx`:

```tsx
"use client";

import { useState } from "react";

interface RequestItem {
  query: string;
  count: number;
  latest: string;
  reasonings: string[];
}

export default function ScenarioRequestsPage() {
  const [secret, setSecret] = useState("");
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/scenario-requests", {
        headers: { authorization: `Bearer ${secret}` },
      });
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        setLoading(false);
        return;
      }
      const data = await r.json();
      setItems(data.items as RequestItem[]);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  async function promote(item: RequestItem) {
    const slug = window.prompt(`Slug for "${item.query.slice(0, 60)}"?`);
    if (!slug) return;
    const topic = window.prompt(`Topic statement (full)?`);
    if (!topic) return;
    const topic_short = window.prompt(`Topic short?`);
    if (!topic_short) return;
    const r = await fetch("/api/admin/promote-to-skeleton", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ slug, topic, topic_short, query: item.query }),
    });
    const data = await r.json();
    if (r.ok) window.alert(`Skeleton written to ${data.path}`);
    else window.alert(`Error: ${data.error}`);
  }

  return (
    <main className="max-w-[920px] mx-auto px-4 py-10">
      <h1 className="font-serif text-3xl font-bold mb-6">Scenario request backlog</h1>
      <div className="mb-6 flex gap-2">
        <input
          type="password"
          placeholder="Admin shared secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="flex-1 border border-[#1c1c1c33] px-3 py-2 font-mono text-sm"
        />
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-[#1c1c1c] text-[#fbfbf9] font-mono text-sm uppercase tracking-wider">
          {loading ? "Loading..." : "Load"}
        </button>
      </div>
      {error ? <p className="text-red-700 text-sm mb-4">Error: {error}</p> : null}
      {items === null ? (
        <p className="text-sm text-[#5a5a55]">Enter the shared secret and click Load.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#5a5a55]">No unmatched queries logged yet.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item, i) => (
            <li key={i} className="border border-[#1c1c1c33] p-4">
              <p className="font-serif text-base mb-2">{item.query}</p>
              <p className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mb-2">
                {item.count}x . latest {item.latest}
              </p>
              {item.reasonings[0] ? <p className="text-xs text-[#5a5a55] italic mb-3">Agent reasoning: {item.reasonings[0]}</p> : null}
              <button
                onClick={() => promote(item)}
                className="font-mono text-xs uppercase tracking-wider px-3 py-1.5 border border-[#a07223] text-[#a07223]"
              >
                Promote to skeleton
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/admin/scenario-requests/page.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-10): /admin/scenario-requests gated page with promote action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19. /api/og scenario variant

**Files:**
- Modify: `web/app/api/og/route.ts`

- [ ] **Step 1: Read the current OG route to find the variant dispatch**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/web/app/api/og/route.ts
```

Note the existing variant pattern (likely a switch or if-chain on `searchParams.get("type")`).

- [ ] **Step 2: Add scenario and scenarios-index variants**

In `web/app/api/og/route.ts`, add a new branch for `type === "scenario"` and `type === "scenarios-index"`. The branch reads the `slug` param, calls `getScenario(slug)`, and renders an ImageResponse with `topic_short` and `pull_quote`. Pattern matches existing variants.

Add these imports at the top:

```typescript
import { getScenario } from "@/lib/scenario-loader";
```

Add this to the type-switch logic (placement depends on existing structure; add as a new case):

```typescript
  if (type === "scenario") {
    const slug = searchParams.get("slug") ?? "";
    const card = getScenario(slug);
    if (!card) {
      return new Response("not found", { status: 404 });
    }
    return new ImageResponse(
      (
        <div style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "#fbfbf9", color: "#1c1c1c", padding: "60px 80px",
          fontFamily: "Inter",
        }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 16, textTransform: "uppercase", letterSpacing: "0.12em", color: "#5a5a55", marginBottom: 24 }}>
            Scenario . The Mayoral Record
          </div>
          <div style={{ fontFamily: "Source Serif Pro", fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginBottom: 32, letterSpacing: "-0.02em" }}>
            {card.topic_short}
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: "#1c1c1c", maxWidth: 1000 }}>
            {card.pull_quote}
          </div>
          <div style={{ marginTop: "auto", fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#5a5a55", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            mayoralrecord.com/scenarios/{card.slug}
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  if (type === "scenarios-index") {
    return new ImageResponse(
      (
        <div style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "#fbfbf9", color: "#1c1c1c", padding: "60px 80px",
          fontFamily: "Inter",
        }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 16, textTransform: "uppercase", letterSpacing: "0.12em", color: "#5a5a55", marginBottom: 24 }}>
            Scenarios . The Mayoral Record
          </div>
          <div style={{ fontFamily: "Source Serif Pro", fontSize: 80, fontWeight: 700, lineHeight: 1.05, marginBottom: 32, letterSpacing: "-0.02em" }}>
            Policy scenarios
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: "#1c1c1c", maxWidth: 980 }}>
            Curated, evidence-backed analysis of contested positions in the Toronto 2026 race.
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/api/og/route.ts
git commit -m "$(cat <<'EOF'
feat(sprint-10): /api/og scenario and scenarios-index variants

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20. Methodology page update

**Files:**
- Modify: `web/app/methodology/page.tsx`

- [ ] **Step 1: Read existing methodology page**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/web/app/methodology/page.tsx
```

- [ ] **Step 2: Append the scenario card framework + 4-tier system as a new section**

Add this as a new section near the bottom of the existing methodology page content (just before the final disclaimer or footer block). Match the page's existing styling conventions. Replace the bracketed placeholders with the page's actual existing wrapper components:

```tsx
        <section className="mt-12 pt-8 border-t border-[#1c1c1c1a]">
          <h2 className="font-serif text-2xl font-bold mb-4">Policy scenario cards</h2>
          <p className="mb-3">
            Some pages on this site analyse contested positions through a "Policy Scenario" card. Cards live at <a href="/scenarios" className="underline">/scenarios</a>. Each one surfaces who each candidate's mechanism reaches, what Toronto already does, and what comparable cities have shown. Every claim cites its source.
          </p>
          <h3 className="font-serif text-lg font-bold mt-6 mb-2">Source-tier system</h3>
          <p className="mb-3">Every citation on a scenario card carries a tier badge. The four tiers track the actual evidentiary gradient:</p>
          <ul className="list-disc pl-5 space-y-2 text-sm mb-4">
            <li><strong>T1. Primary government data.</strong> City of Toronto budget, Auditor General reports, Statistics Canada releases, CMHC, planning department published data, federal and provincial budget documents.</li>
            <li><strong>T2. Independent analysis.</strong> Wellesley Institute, IMFG, OECD, CHRA, Toronto Region Board of Trade, Conference Board, BIA-commissioned studies, investigative journalism with traceable primary sources.</li>
            <li><strong>T3. Peer-reviewed academic.</strong> DOI-bearing journal articles only.</li>
            <li><strong>T4. Mayoral Record extrapolation.</strong> In-house arithmetic or projection. Used rarely. When a card includes a T4 claim, the card carries a methodology paragraph describing assumptions, inputs, and limits.</li>
          </ul>
          <h3 className="font-serif text-lg font-bold mt-6 mb-2">Editorial discipline</h3>
          <p className="mb-3 text-sm">
            The chat agent retrieves curated cards. It does not generate modeling content at query time. When a question does not match any curated card, the agent says so and the question logs to an editorial backlog. New cards are reviewed before publish, not auto-generated. When the underlying literature does not support a confident singular projection, the card says so explicitly rather than fabricating one.
          </p>
        </section>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/methodology/page.tsx
git commit -m "$(cat <<'EOF'
docs(sprint-10): methodology page adds 4-tier system + scenario framework

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 21. Sitemap update

**Files:**
- Modify: existing sitemap route (likely `web/app/sitemap.ts` or `web/app/sitemap.xml/route.ts`)

- [ ] **Step 1: Locate the sitemap source**

```bash
/usr/bin/find /Users/aramammo/thebradfordfiles/web/app -name "sitemap*"
```

- [ ] **Step 2: Add /scenarios + per-card URLs to the sitemap**

Open the sitemap source. Import the loader:

```typescript
import { listScenarioSlugs } from "@/lib/scenario-loader";
```

Add `/scenarios` as a top-level entry in the URLs array. Then add one entry per scenario slug:

```typescript
// Add to the array of sitemap entries:
{ url: `${origin}/scenarios`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
...listScenarioSlugs().map((slug) => ({
  url: `${origin}/scenarios/${slug}`,
  lastModified: new Date(),
  changeFrequency: "weekly" as const,
  priority: 0.7,
})),
```

(The `origin` variable name and exact array structure depends on the existing sitemap layout. Match conventions.)

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/sitemap*
git commit -m "$(cat <<'EOF'
feat(sprint-10): sitemap includes /scenarios and per-card URLs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22. Local build smoke test (pre-content)

**Files:** none modified.

- [ ] **Step 1: Run all tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
npx vitest run
```

Expected: every test passes (Sprint 9 tests + new Sprint 10 tests).

- [ ] **Step 2: Run a production build**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run build
```

Expected: build completes without TypeScript errors. Routes including `/scenarios` and `/scenarios/[slug]` (with no cards yet, returning empty index) appear in build output. Note: with zero scenario JSON files, generateStaticParams returns an empty array; that is fine.

- [ ] **Step 3: Run dev server and visually check empty index**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev
```

In another terminal:

```bash
/usr/bin/curl -sL http://localhost:3000/scenarios | /usr/bin/grep -oE "No scenario cards published yet"
```

Expected: prints `No scenario cards published yet`. Stop dev server.

- [ ] **Step 4: Commit a tag for the milestone (no code change)**

```bash
cd /Users/aramammo/thebradfordfiles
# Just confirm clean state; nothing to commit if nothing changed.
git status
```

---

## Tasks 23 to 27. Convert research outputs to JSON

**One task per launch card. Each task follows the same shape: read the Markdown research output, translate to JSON matching the schema, validate, edit, commit.**

For each card the workflow is:

- [ ] **Step 1: Read the research output**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/research/sprint-10/output/card-N-<topic>.md
```

If the file does not exist (research agent did not complete or failed), defer this card to a weekly drop. Document the deferral in `research/sprint-10/output/DEFERRED.md` and move to the next task.

- [ ] **Step 2: Convert Markdown to JSON**

Write the resulting JSON to `web/public/data/scenarios/<slug>.json`. The slug is the section "## SLUG" value from the research output. Map the Markdown sections to JSON fields:

| Markdown | JSON |
|---|---|
| `## TOPIC` | `topic` (verbatim) |
| `## SLUG` | `slug` (verbatim) |
| `## PULL QUOTE` | `pull_quote` |
| `## WHO BENEFITS` -> intro paragraph | `who_benefits.intro` |
| `### Bradford's mechanism` body | one entry in `who_benefits.mechanisms[]` with `candidate_handle: "bradfordgrams"` |
| `### Chow's mechanism` body | one entry in `who_benefits.mechanisms[]` with `candidate_handle: "oliviachow"` |
| `### Literature` row | `who_benefits.literature_row[]` (parse "Author (Tier, year) . Author ..." into citation objects) |
| `## POSITIONS` -> per candidate body | `positions[]` |
| `## STATUS QUO` body | `status_quo.summary` |
| `### Existing policy stack` bullets | `status_quo.existing_policy_stack[]` |
| `## COMPARABLE JURISDICTIONS` per item | `comparables[]` |
| `## PROJECTIONS` body | `projections` (kind:"plural" if numerical ranges given; kind:"thin" with the explicit no-singular line otherwise) |
| `## TIME HORIZON` | `time_horizon` |

Set `topic_short` to a 3-to-5-word version of the topic (e.g., "Housing supply mechanism", "Transit operating funding"). Set `meta.last_reviewed` to today's date in ISO format. Set `meta.next_review` to today + 28 days.

- [ ] **Step 3: Validate the JSON**

```bash
cd /Users/aramammo/thebradfordfiles/web
node -e "
const fs = require('fs');
const path = require('path');
const slug = '<slug>';
const raw = JSON.parse(fs.readFileSync(path.join('public', 'data', 'scenarios', slug + '.json'), 'utf-8'));
require('ts-node/register');
const { validateScenarioCard } = require('./lib/scenario-types');
const r = validateScenarioCard(raw);
if (r.ok) console.log('OK:', slug);
else { console.error('FAIL:', slug, r.errors); process.exit(1); }
"
```

If `ts-node` is not installed in the project, alternative: write a small TypeScript file that imports validateScenarioCard, run with `npx tsx <file>.ts`, or run the existing vitest test suite which already loads from the scenarios directory.

Easier alternative that works without ts-node: add a one-off vitest test that loads the file:

```typescript
// scratch-validate.test.ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateScenarioCard } from "@/lib/scenario-types";

test("housing card validates", () => {
  const raw = JSON.parse(readFileSync(join("public", "data", "scenarios", "housing-supply-mechanism.json"), "utf-8"));
  const r = validateScenarioCard(raw);
  expect(r.ok).toBe(true);
});
```

Run `npx vitest run scratch-validate.test.ts`. Delete the scratch file after success.

- [ ] **Step 4: Visual review on dev server**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev
```

Open http://localhost:3000/scenarios/<slug>. Read the rendered page. Confirm:
- Who-Benefits section reads as evidentiary, not advocacy
- Citations all carry a tier badge
- Comparable jurisdictions tab through correctly
- No em dashes anywhere
- pull_quote shows up on /scenarios index tile

If any issue, edit the JSON inline.

- [ ] **Step 5: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/public/data/scenarios/<slug>.json
git commit -m "content(sprint-10): scenario card . <topic_short>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Card mappings (per-card)

- **Task 23:** `card-1-housing.md` -> `housing-supply-mechanism.json`. topic_short: "Housing supply mechanism".
- **Task 24:** `card-2-transit.md` -> `transit-operating-funding.json`. topic_short: "Transit operating funding".
- **Task 25:** `card-3-property-tax.md` -> `property-tax-stance.json`. topic_short: "Property tax stance".
- **Task 26:** `card-4-safety.md` -> `public-safety-approach.json`. topic_short: "Public safety approach".
- **Task 27:** `card-5-climate-parks.md` -> `climate-parks-investment.json`. topic_short: "Climate and parks investment".

---

## Task 28. Production deploy and acceptance verification

**Files:** none modified.

- [ ] **Step 1: Final test pass**

```bash
cd /Users/aramammo/thebradfordfiles/web
npx vitest run
```

Expected: all tests pass, including any scenario JSON validators added during content tasks.

- [ ] **Step 2: Build**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run build
```

Expected: build succeeds. Route output includes `/scenarios` and one entry per scenario slug under `/scenarios/[slug]`.

- [ ] **Step 3: Production deploy via Vercel**

```bash
cd /Users/aramammo/thebradfordfiles/web
vercel --prod --yes
```

Capture the deployment URL. Wait for `READY` state.

- [ ] **Step 4: Confirm required env vars are set in production**

```bash
cd /Users/aramammo/thebradfordfiles/web
vercel env ls production 2>&1 | /usr/bin/grep -E "ADMIN_SHARED_SECRET|UPSTASH|KV_"
```

Expected: `ADMIN_SHARED_SECRET` and Upstash/KV creds are present. If `ADMIN_SHARED_SECRET` is missing, set it:

```bash
echo "$(/usr/bin/openssl rand -hex 32)" | vercel env add ADMIN_SHARED_SECRET production
```

Redeploy if any env var added.

- [ ] **Step 5: Walk through acceptance criteria against production**

```bash
URL="https://www.mayoralrecord.com"
echo "AC1+AC2: index page lists 5 cards"
/usr/bin/curl -sL "$URL/scenarios" | /usr/bin/grep -oE "Last reviewed" | /usr/bin/wc -l
# expected: 5

echo "AC1: each detail page returns 200 and renders Who Benefits"
for slug in housing-supply-mechanism transit-operating-funding property-tax-stance public-safety-approach climate-parks-investment; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL/scenarios/$slug")
  hasWB=$(/usr/bin/curl -sL "$URL/scenarios/$slug" | /usr/bin/grep -c "Who would each mechanism reach")
  echo "  $slug : $code . Who-Benefits hits: $hasWB"
done

echo "AC7: OG renders for each scenario"
for slug in housing-supply-mechanism transit-operating-funding property-tax-stance public-safety-approach climate-parks-investment; do
  ct=$(/usr/bin/curl -sLI "$URL/api/og?type=scenario&slug=$slug" | /usr/bin/grep -i "content-type:" | /usr/bin/head -1)
  echo "  $slug : $ct"
done
# each: image/png

echo "AC9: sitemap includes scenarios + each slug"
/usr/bin/curl -sL "$URL/sitemap.xml" | /usr/bin/grep -oE "/scenarios[^<]*" | /usr/bin/sort -u

echo "AC10: em-dash count across rendered pages (must be 0)"
total=0
for path in "/scenarios" "/scenarios/housing-supply-mechanism" "/scenarios/transit-operating-funding" "/scenarios/property-tax-stance" "/scenarios/public-safety-approach" "/scenarios/climate-parks-investment"; do
  c=$(/usr/bin/curl -sL "$URL$path" | /usr/bin/grep -c "—")
  total=$((total + c))
  echo "  $path: $c"
done
echo "  TOTAL: $total"

echo "AC5: admin endpoint 401 without auth"
/usr/bin/curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/admin/scenario-requests"
# expected: 401

echo "AC8: methodology page mentions 4-tier system"
/usr/bin/curl -sL "$URL/methodology" | /usr/bin/grep -oE "T1\.|T2\.|T3\.|T4\." | /usr/bin/sort -u
# expected: T1., T2., T3., T4.
```

Expected: every check matches the acceptance criteria from the spec.

- [ ] **Step 6: Final commit (deploy log + AC verification result)**

If everything passes, no code changes are required. If something fails, fix in a follow-up task and redeploy.

```bash
cd /Users/aramammo/thebradfordfiles
git status
# expected: clean working tree, all Sprint 10 commits pushed
```

---

## Self-review notes

This plan was reviewed against the spec at `docs/superpowers/specs/2026-05-04-sprint-10-policy-scenario-modeling.md`. Coverage of acceptance criteria:

| AC# | Requirement | Task |
|---|---|---|
| 1 | All 5 cards live and pass validation | 23-27 |
| 2 | Index page lists all 5 | 10 + 23-27 |
| 3 | Tool retrieves correctly for 3+ test queries per topic | 14 (test fixtures use representative queries) |
| 4 | no_match logs to Redis | 13, 14 |
| 5 | /admin page renders with auth, 401 otherwise | 16, 18 |
| 6 | promote-to-skeleton generates valid skeleton | 17 |
| 7 | /api/og scenario returns image/png | 19 |
| 8 | Methodology page updated | 20 |
| 9 | Sitemap includes /scenarios + per-slug | 21 |
| 10 | Em-dash count across pages: 0 | 2 (em-dash guard), 28 (verification) |
| 11 | All Vitest suites pass + new tests | 3, 5, 14, 22, 28 |
| 12 | Agent tool tests cover matched/no_match/Redis | 14 |
| 13 | Manual editorial review of 5 cards | 23-27 (Step 4 of each) |

No placeholders. Type names consistent (`ScenarioCard`, `Citation`, `Mechanism`, `Comparable`, `Projection`, `ProjectionsBlock`, `validateScenarioCard`, `setScenarioDataDir`, `listScenarios`, `getScenario`, `listScenarioSlugs`, `getScenarioCard`, `RedisLogger`, `ScenarioToolInput`, `ScenarioToolResult`).
