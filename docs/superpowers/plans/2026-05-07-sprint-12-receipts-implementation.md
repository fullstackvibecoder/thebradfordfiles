# Sprint 12. Receipts. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 5 receipt cards that audit verbatim attributed claims about Toronto against Toronto Open Data, plus the chat-agent retrieval tool, admin surface, and OG image variants.

**Architecture:** New JSON content type at `web/public/data/receipts/<slug>.json` validated by a Zod schema that reuses the Citation primitive from Sprint 10. New routes `/receipts` (index) and `/receipts/[slug]` (detail) render via Server Components. Each data anchor is a server-rendered section with a URL fragment id, so the chat agent can deep-link. Chat agent gains an 8th read-only tool (`get_claim_audit`) that retrieves curated cards or logs no-match to Redis.

**Tech Stack:** Next.js 16.2.4 App Router, React 19 RC, TypeScript, Zod (already installed Sprint 10), Tailwind CSS (warm-dark tokens from Sprint 11), Anthropic SDK, Upstash Redis, Vitest. Builds against `/Users/aramammo/thebradfordfiles/web/` (project root).

**Spec:** `docs/superpowers/specs/2026-05-07-sprint-12-receipts.md`.

**Sequencing note.** Research outputs are already in hand at `research/sprint-12/output/receipt-*.md`. Tasks 1 to 19 build infrastructure against placeholder fixtures. Tasks 20 to 24 convert research markdown to JSON with conversion-time editorial fixes noted in the research reports. Task 25 deploys and verifies acceptance criteria.

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `web/lib/receipt-types.ts` | TS interfaces + Zod validator (reuses `CitationSchema` and `ComparableSchema` from `scenario-types.ts`) |
| `web/lib/receipt-loader.ts` | listReceipts, getReceipt, setReceiptDataDir |
| `web/lib/agent/receipt-tool.ts` | get_claim_audit implementation |
| `web/components/ReceiptTierBadge.tsx` | Reuses Sprint 10 ScenarioTierBadge styling but as its own component for clarity |
| `web/components/ReceiptClaimBlock.tsx` | Verbatim-claim block, red accent, monospace, AUDITED stamp |
| `web/components/ReceiptExhibit.tsx` | Numbered exhibit with sub-section anchor |
| `web/components/ReceiptCard.tsx` | Full receipt card renderer, server component |
| `web/components/ReceiptCardTile.tsx` | Index-page tile |
| `web/app/receipts/page.tsx` | Index route |
| `web/app/receipts/[slug]/page.tsx` | Detail route with generateStaticParams + generateMetadata |
| `web/public/data/receipts/_fixture-valid.json` | Test fixture |
| `web/public/data/receipts/crime-trends.json` | Content (Task 20) |
| `web/public/data/receipts/tax-burden.json` | Content (Task 21) |
| `web/public/data/receipts/housing-supply.json` | Content (Task 22) |
| `web/public/data/receipts/ttc-performance.json` | Content (Task 23) |
| `web/public/data/receipts/encampment-response.json` | Content (Task 24) |
| `web/tests/receipt-types.test.ts` | Schema validator tests |
| `web/tests/receipt-loader.test.ts` | Loader tests |
| `web/tests/receipt-tool.test.ts` | Agent tool tests |
| `web/tests/fixtures/valid-receipt.ts` | Fixture factory for tests |

### Modified files

| Path | Change |
|---|---|
| `web/lib/agent/tool-schemas.ts` | Add `get_claim_audit` schema (8th read-only tool, before `emit_card`) |
| `web/lib/agent/system-prompt.ts` | Add rule 12 for receipt retrieval |
| `web/lib/agent/tools.ts` | Add async wrapper for get_claim_audit |
| `web/app/api/ask/route.ts` | Add dispatcher case for get_claim_audit; extend summarizeResult |
| `web/app/api/og/route.ts` | Add `type=receipt` and `type=receipts-index` variants |
| `web/app/methodology/page.tsx` | Add Receipts framework section |
| `web/app/sitemap.ts` | Include /receipts + 5 per-slug URLs |

### Web .gitignore

`web/public/data/receipts/` should track normally. Sprint 10 already added `!public/data/scenarios/` to override the broad `public/data/` ignore. Sprint 12 needs the same for `receipts/`.

---

## Task 0. Verify Sprint 11 baseline

**Files:** none modified.

- [ ] **Step 1: Confirm clean working tree**

```bash
cd /Users/aramammo/thebradfordfiles
git status
```

Expected: only known unrelated dirty state (legacy-site/*, web/tsconfig.json, untracked data/*, web/public/sitemap.xml, web/tsconfig.tsbuildinfo). If unexpected changes exist, stop and ask.

- [ ] **Step 2: Run existing test suite**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```

Expected: 46 tests pass.

- [ ] **Step 3: Confirm production deploy is healthy**

```bash
/usr/bin/curl -sL -o /dev/null -w "%{http_code}\n" https://www.mayoralrecord.com/
```

Expected: `200`.

---

## Task 1. Update gitignore + receipt-types primitives

**Files:**
- Modify: `web/.gitignore`
- Create: `web/lib/receipt-types.ts`

- [ ] **Step 1: Update gitignore so receipts/ tracks normally**

Read the current `web/.gitignore`. It contains `!public/data/scenarios/` from Sprint 10. Add a similar exclusion for receipts.

```bash
cd /Users/aramammo/thebradfordfiles/web
/bin/cat .gitignore
```

Edit `web/.gitignore` to add this line directly below the existing `!public/data/scenarios/`:

```
!public/data/receipts/
```

The full file should now look like:
```
node_modules
.next
.vercel
.env*.local
next-env.d.ts
public/data/
!public/data/scenarios/
!public/data/receipts/
```

- [ ] **Step 2: Create the receipt-types skeleton**

Create `web/lib/receipt-types.ts`:

```typescript
import { z } from "zod";
import { CitationSchema, ComparableSchema, type Citation, type Comparable } from "./scenario-types";

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
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/.gitignore web/lib/receipt-types.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): receipt type primitives + gitignore exclusion for receipts/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2. Define the full ReceiptCard schema

**Files:**
- Modify: `web/lib/receipt-types.ts`

- [ ] **Step 1: Append DataAnchor and ReceiptCard schemas with em-dash guard and validator**

Append to `web/lib/receipt-types.ts`:

```typescript
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

const EM_DASH = "—";

export function containsEmDash(card: unknown): boolean {
  return JSON.stringify(card).includes(EM_DASH);
}

export interface ReceiptValidationResult {
  ok: boolean;
  card?: ReceiptCard;
  errors?: string[];
}

export function validateReceiptCard(input: unknown): ReceiptValidationResult {
  if (containsEmDash(input)) {
    return { ok: false, errors: ["Card contains an em dash (U+2014). Use periods, commas, colons, or parentheses instead."] };
  }
  const parsed = ReceiptCardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message),
    };
  }
  return { ok: true, card: parsed.data };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/receipt-types.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): receipt card zod schema with anchor uniqueness + window check

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3. Validator tests + valid fixture

**Files:**
- Create: `web/tests/fixtures/valid-receipt.ts`
- Create: `web/tests/receipt-types.test.ts`

- [ ] **Step 1: Create the fixture factory**

Create `web/tests/fixtures/valid-receipt.ts`:

```typescript
import type { ReceiptCard } from "@/lib/receipt-types";

export function validReceipt(overrides: Partial<ReceiptCard> = {}): ReceiptCard {
  return {
    slug: "test-receipt",
    topic: "Test topic statement that runs more than a few words",
    topic_short: "Test topic",
    pull_quote: "Research finds the verbatim claim is partly true and partly misleading. The data shows different patterns across categories.",
    claims: [
      {
        headline: "This is the verbatim claim being audited.",
        attribution: "Test Candidate, Test Outlet, 2024-06-15",
        source: {
          attribution: "Test Outlet article",
          url: "https://example.com/article",
          retrieved: "2024-06-15",
        },
      },
    ],
    receipt: {
      intro: "Brief framing of what the data shows overall.",
      anchors: [
        {
          sub_section_anchor: "first-anchor",
          sub_claim: "First sub-claim",
          finding: "What the data actually shows for this sub-claim.",
          metric: "12,408 cases reported in 2024 vs 5,212 in 2018",
          source: { tier: "T1", label: "City data 2024" },
          caveats: "Single-year snapshot.",
          as_of: "2024-12-31",
        },
        {
          sub_section_anchor: "second-anchor",
          sub_claim: "Second sub-claim",
          finding: "Different angle on the same topic.",
          metric: "Median rate increased 4 percent over 5 years",
          source: { tier: "T2", label: "IMFG 2024" },
          as_of: "2024-09-30",
        },
        {
          sub_section_anchor: "third-anchor",
          sub_claim: "Third sub-claim",
          finding: "Third angle.",
          metric: "Comparable jurisdiction outcome",
          source: { tier: "T3", label: "Author 2023" },
          as_of: "2023-12-31",
        },
      ],
    },
    meta: {
      last_reviewed: "2026-05-07",
      next_review: "2026-06-07",
    },
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

Create `web/tests/receipt-types.test.ts`:

```typescript
import { test, expect } from "vitest";
import { validateReceiptCard } from "@/lib/receipt-types";
import { validReceipt } from "./fixtures/valid-receipt";

test("validateReceiptCard accepts a fully-formed card", () => {
  const result = validateReceiptCard(validReceipt());
  expect(result.ok).toBe(true);
  expect(result.card?.slug).toBe("test-receipt");
});

test("validateReceiptCard rejects a card missing claim source url", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  delete broken.claims[0].source.url;
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("url"))).toBe(true);
});

test("validateReceiptCard rejects claim retrieved date before 2024-01-01", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.claims[0].source.retrieved = "2023-12-31";
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("2024-01-01"))).toBe(true);
});

test("validateReceiptCard rejects duplicate sub_section_anchor", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.receipt.anchors[1].sub_section_anchor = broken.receipt.anchors[0].sub_section_anchor;
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("Duplicate"))).toBe(true);
});

test("validateReceiptCard rejects content with an em dash", () => {
  const card = validReceipt({ pull_quote: "Research — finds the verbatim claim is partly true. Data shows different patterns across categories." });
  const result = validateReceiptCard(card);
  expect(result.ok).toBe(false);
  expect(result.errors?.[0]).toContain("em dash");
});

test("validateReceiptCard rejects fewer than 3 anchors", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.receipt.anchors = broken.receipt.anchors.slice(0, 2);
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
});

test("validateReceiptCard rejects more than 6 anchors", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  const extra = { ...broken.receipt.anchors[0], sub_section_anchor: "extra-anchor" };
  broken.receipt.anchors = [...broken.receipt.anchors, broken.receipt.anchors[0], broken.receipt.anchors[0], broken.receipt.anchors[0], extra];
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
});

test("validateReceiptCard rejects pull_quote shorter than 40 chars", () => {
  const card = validReceipt({ pull_quote: "too short" });
  const result = validateReceiptCard(card);
  expect(result.ok).toBe(false);
});

test("validateReceiptCard rejects more than 3 claims", () => {
  const card = validReceipt();
  const c = card.claims[0];
  const broken = JSON.parse(JSON.stringify(card));
  broken.claims = [c, c, c, c];
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
});
```

- [ ] **Step 3: Run tests to verify all pass**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/receipt-types.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/tests/receipt-types.test.ts web/tests/fixtures/valid-receipt.ts
git commit -m "$(cat <<'EOF'
test(sprint-12): receipt validator coverage + fixture factory

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4. Receipt loader

**Files:**
- Create: `web/lib/receipt-loader.ts`

- [ ] **Step 1: Create the loader mirroring scenario-loader.ts**

Create `web/lib/receipt-loader.ts`:

```typescript
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateReceiptCard, type ReceiptCard } from "./receipt-types";

let RECEIPT_DIR = join(process.cwd(), "public", "data", "receipts");

export function setReceiptDataDir(path: string): void {
  RECEIPT_DIR = path;
}

export function listReceipts(): ReceiptCard[] {
  if (!existsSync(RECEIPT_DIR)) return [];
  const files = readdirSync(RECEIPT_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_")
  );
  const out: ReceiptCard[] = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(RECEIPT_DIR, f), "utf-8"));
    const result = validateReceiptCard(raw);
    if (result.ok && result.card) out.push(result.card);
  }
  return out.sort((a, b) => a.topic_short.localeCompare(b.topic_short));
}

export function getReceipt(slug: string): ReceiptCard | null {
  const path = join(RECEIPT_DIR, slug + ".json");
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const result = validateReceiptCard(raw);
  return result.ok && result.card ? result.card : null;
}

export function listReceiptSlugs(): string[] {
  return listReceipts().map((c) => c.slug);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/receipt-loader.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): receipt loader with setReceiptDataDir

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5. Loader tests

**Files:**
- Create: `web/tests/receipt-loader.test.ts`

- [ ] **Step 1: Write the tests**

Create `web/tests/receipt-loader.test.ts`:

```typescript
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setReceiptDataDir, listReceipts, getReceipt, listReceiptSlugs } from "@/lib/receipt-loader";
import { validReceipt } from "./fixtures/valid-receipt";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-receipts-"));
  setReceiptDataDir(tmp);
});

test("listReceipts returns empty when directory is empty", () => {
  expect(listReceipts()).toEqual([]);
});

test("listReceipts loads valid JSON files", () => {
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validReceipt({ slug: "a", topic_short: "A topic" })));
  writeFileSync(join(tmp, "b.json"), JSON.stringify(validReceipt({ slug: "b", topic_short: "B topic" })));
  const cards = listReceipts();
  expect(cards).toHaveLength(2);
  expect(cards.map((c) => c.slug)).toEqual(["a", "b"]);
});

test("listReceipts skips invalid JSON", () => {
  writeFileSync(join(tmp, "valid.json"), JSON.stringify(validReceipt({ slug: "valid" })));
  writeFileSync(join(tmp, "broken.json"), JSON.stringify({ slug: "broken" }));
  const cards = listReceipts();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("valid");
});

test("listReceipts skips files starting with underscore", () => {
  writeFileSync(join(tmp, "_fixture.json"), JSON.stringify(validReceipt({ slug: "fixture" })));
  writeFileSync(join(tmp, "real.json"), JSON.stringify(validReceipt({ slug: "real" })));
  const cards = listReceipts();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("real");
});

test("getReceipt returns the card by slug", () => {
  writeFileSync(join(tmp, "crime.json"), JSON.stringify(validReceipt({ slug: "crime", topic_short: "Crime" })));
  const card = getReceipt("crime");
  expect(card?.slug).toBe("crime");
});

test("getReceipt returns null for unknown slug", () => {
  expect(getReceipt("nonexistent")).toBeNull();
});

test("listReceiptSlugs returns all valid slugs sorted by topic_short", () => {
  writeFileSync(join(tmp, "z.json"), JSON.stringify(validReceipt({ slug: "z", topic_short: "Z" })));
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validReceipt({ slug: "a", topic_short: "A" })));
  expect(listReceiptSlugs()).toEqual(["a", "z"]);
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/receipt-loader.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/tests/receipt-loader.test.ts
git commit -m "$(cat <<'EOF'
test(sprint-12): receipt loader coverage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6. ReceiptClaimBlock component

**Files:**
- Create: `web/components/ReceiptClaimBlock.tsx`

- [ ] **Step 1: Create the component**

Create `web/components/ReceiptClaimBlock.tsx`:

```tsx
import type { ClaimBlock } from "@/lib/receipt-types";

export function ReceiptClaimBlock({ claim }: { claim: ClaimBlock }) {
  return (
    <section className="bg-[#1a0d0d] border-l-4 border-[#c44848] px-6 py-5 mb-6 relative">
      <span className="absolute top-3 right-4 font-mono text-[10px] uppercase tracking-wider text-[#c44848] border border-[#c44848] px-2 py-0.5 rounded-sm">
        AUDITED
      </span>
      <p className="font-mono text-base leading-relaxed text-ink mb-4 pr-24">
        &ldquo;{claim.headline}&rdquo;
      </p>
      <p className="font-mono text-xs uppercase tracking-wider text-muted">
        {claim.attribution}
        <span className="mx-2">.</span>
        <a href={claim.source.url} target="_blank" rel="noopener" className="underline">
          source
        </a>
        <span className="mx-2">.</span>
        retrieved {claim.source.retrieved}
      </p>
      {claim.response_from_source ? (
        <div className="mt-4 pt-3 border-t border-dotted border-[#4a2828]">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted mb-1.5">Response from source</p>
          <p className="font-serif text-sm text-[#d4ccb8]">{claim.response_from_source}</p>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ReceiptClaimBlock.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-12): claim block component with red accent and AUDITED stamp

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7. ReceiptExhibit component

**Files:**
- Create: `web/components/ReceiptExhibit.tsx`

- [ ] **Step 1: Create the component**

Create `web/components/ReceiptExhibit.tsx`:

```tsx
import type { DataAnchor } from "@/lib/receipt-types";
import { ScenarioTierBadge } from "./ScenarioTierBadge";

export function ReceiptExhibit({ anchor, index }: { anchor: DataAnchor; index: number }) {
  return (
    <section id={anchor.sub_section_anchor} className="mb-8 scroll-mt-20">
      <h3 className="mb-2">
        <span className="font-mono text-xs uppercase tracking-wider text-accent mr-2">
          Exhibit {index + 1}.
        </span>
        <span className="font-serif text-lg font-bold text-ink">{anchor.sub_claim}</span>
      </h3>
      <p className="font-serif text-base leading-relaxed text-[#d4ccb8] mb-3">{anchor.finding}</p>
      <div className="bg-[#1c1813] border border-[#2a2520] px-5 py-4 mb-3">
        <p className="font-serif text-xl font-bold text-ink leading-snug" style={{ fontVariantNumeric: "tabular-nums" }}>
          {anchor.metric}
        </p>
        <p className="text-xs text-muted mt-2">
          <ScenarioTierBadge tier={anchor.source.tier} />
          {anchor.source.label}
          {anchor.source.url ? (
            <> (<a href={anchor.source.url} target="_blank" rel="noopener" className="underline">link</a>)</>
          ) : null}
        </p>
      </div>
      {anchor.caveats ? (
        <p className="text-sm italic text-muted mb-2">
          <strong className="font-mono not-italic uppercase text-[11px] tracking-wider mr-1">Caveat.</strong>
          {anchor.caveats}
        </p>
      ) : null}
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
        As of {anchor.as_of}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ReceiptExhibit.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-12): exhibit component with anchor id and tabular-figure metric

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8. ReceiptCard renderer

**Files:**
- Create: `web/components/ReceiptCard.tsx`

- [ ] **Step 1: Create the renderer**

Create `web/components/ReceiptCard.tsx`:

```tsx
import type { ReceiptCard as ReceiptCardData } from "@/lib/receipt-types";
import { ReceiptClaimBlock } from "./ReceiptClaimBlock";
import { ReceiptExhibit } from "./ReceiptExhibit";
import { ScenarioComparableTabs } from "./ScenarioComparableTabs";

export function ReceiptCard({ card }: { card: ReceiptCardData }) {
  return (
    <article className="max-w-[760px] mx-auto px-4 py-8 bg-bg text-ink">
      <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight mb-1">{card.topic}</h1>
      <p className="font-mono text-xs uppercase tracking-wider text-muted pb-4 mb-6 border-b border-[#ffffff15]">
        Receipt . Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>

      {card.claims.map((claim, i) => (
        <ReceiptClaimBlock key={i} claim={claim} />
      ))}

      <h2 className="font-mono text-xs uppercase tracking-wider text-muted mt-7 mb-2.5 font-semibold">
        The receipt
      </h2>
      <p className="font-serif text-base leading-relaxed text-[#d4ccb8] mb-6">{card.receipt.intro}</p>

      {card.receipt.anchors.map((a, i) => (
        <ReceiptExhibit key={a.sub_section_anchor} anchor={a} index={i} />
      ))}

      {card.what_data_cannot_settle ? (
        <section className="border-l-4 border-accent bg-[#1c1813] px-6 py-4 mt-8 mb-6">
          <p className="font-mono text-xs uppercase tracking-wider text-accent mb-2">What the data cannot settle</p>
          <p className="font-serif text-sm italic text-[#d4ccb8] leading-relaxed">{card.what_data_cannot_settle}</p>
        </section>
      ) : null}

      {card.comparables && card.comparables.length > 0 ? (
        <>
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted mt-7 mb-2.5 font-semibold">
            Comparable jurisdictions
          </h2>
          <ScenarioComparableTabs comparables={card.comparables} />
        </>
      ) : null}

      <footer className="mt-10 pt-4 border-t border-[#ffffff15] font-mono text-xs uppercase tracking-wider text-muted">
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
git add web/components/ReceiptCard.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-12): receipt card renderer with claim blocks + exhibits

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9. ReceiptCardTile

**Files:**
- Create: `web/components/ReceiptCardTile.tsx`

- [ ] **Step 1: Create the tile**

Create `web/components/ReceiptCardTile.tsx`:

```tsx
import Link from "next/link";
import type { ReceiptCard } from "@/lib/receipt-types";

export function ReceiptCardTile({ card }: { card: ReceiptCard }) {
  return (
    <Link
      href={"/receipts/" + card.slug}
      className="block bg-[#1c1813] border border-[#2a2520] hover:border-[#c44848] transition-colors p-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#c44848] border border-[#c44848] px-1.5 py-0.5 rounded-sm">
          AUDITED
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {card.claims.length} claim{card.claims.length === 1 ? "" : "s"}
        </span>
      </div>
      <h3 className="font-serif text-lg font-bold leading-snug mb-2 text-ink">{card.topic_short}</h3>
      <p className="text-sm text-[#d4ccb8] mb-3 leading-relaxed">{card.pull_quote}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
        Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ReceiptCardTile.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-12): receipt index tile with red hover border + AUDITED marker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10. /receipts index page

**Files:**
- Create: `web/app/receipts/page.tsx`

- [ ] **Step 1: Create the index page**

Create `web/app/receipts/page.tsx`:

```tsx
import type { Metadata } from "next";
import { listReceipts } from "@/lib/receipt-loader";
import { ReceiptCardTile } from "@/components/ReceiptCardTile";

export const metadata: Metadata = {
  title: "Receipts . The Mayoral Record",
  description: "Toronto Open Data audits of common factual claims circulating in the 2026 mayoral race.",
  openGraph: {
    title: "Receipts . The Mayoral Record",
    description: "Toronto Open Data audits of common factual claims in the 2026 race.",
    images: [{ url: "/api/og?type=receipts-index", width: 1200, height: 630 }],
  },
};

export default function ReceiptsIndexPage() {
  const cards = listReceipts();

  return (
    <main className="max-w-[920px] mx-auto px-4 py-10">
      <header className="mb-8 pb-6 border-b border-[#ffffff15]">
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight mb-3 text-ink">Receipts</h1>
        <p className="text-base leading-relaxed text-[#d4ccb8] max-w-[640px]">
          Verbatim attributed claims from the 2026 race, audited against Toronto Open Data. Each receipt quotes the claim, links to the primary source, and lays out the data with caveats.
        </p>
        <p className="font-mono text-xs uppercase tracking-wider text-muted mt-4">
          <a href="/methodology" className="underline">Methodology and source-tier system</a>
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="text-sm text-muted italic">No receipts published yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {cards.map((c) => (
            <ReceiptCardTile key={c.slug} card={c} />
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
git add web/app/receipts/page.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-12): /receipts index page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11. /receipts/[slug] detail page

**Files:**
- Create: `web/app/receipts/[slug]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `web/app/receipts/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReceipt, listReceiptSlugs } from "@/lib/receipt-loader";
import { ReceiptCard } from "@/components/ReceiptCard";

export async function generateStaticParams() {
  return listReceiptSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const card = getReceipt(slug);
  if (!card) return { title: "Receipt not found . The Mayoral Record" };
  const ogUrl = "/api/og?type=receipt&slug=" + encodeURIComponent(slug);
  return {
    title: card.topic_short + " . The Mayoral Record",
    description: card.pull_quote,
    openGraph: {
      title: card.topic_short + " . The Mayoral Record",
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

export default async function ReceiptDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const card = getReceipt(slug);
  if (!card) notFound();
  return <ReceiptCard card={card} />;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/receipts/[slug]/page.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-12): /receipts/[slug] detail page with static params

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12. Add get_claim_audit to TOOL_SCHEMAS

**Files:**
- Modify: `web/lib/agent/tool-schemas.ts`

- [ ] **Step 1: Insert the new tool schema before emit_card**

In `web/lib/agent/tool-schemas.ts`, insert this entry into the `TOOL_SCHEMAS` array immediately before the `emit_card` entry:

```typescript
  {
    name: "get_claim_audit",
    description: "Retrieve a curated receipt that audits a specific factual claim about Toronto against Toronto Open Data. Use when the user asks 'is X really true', 'fact-check', 'is crime really up', 'what do the numbers actually show', or any question that asks the truth of a quantitative claim about Toronto. Do NOT use for 'what is the candidate's position', 'how did they vote', 'what would happen if'. This tool returns curated reviewed receipts or a no-match response. Never generate audit content yourself.",
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

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/agent/tool-schemas.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): add get_claim_audit tool schema (8th read-only agent tool)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13. Implement receipt-tool.ts

**Files:**
- Create: `web/lib/agent/receipt-tool.ts`

- [ ] **Step 1: Create the implementation**

Create `web/lib/agent/receipt-tool.ts`:

```typescript
import { listReceipts } from "@/lib/receipt-loader";

export type ReceiptToolInput = { query: string; topic_hint?: string };
export type ReceiptToolResult =
  | { status: "matched"; slug: string; topic_short: string; pull_quote: string; anchor?: string }
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

const MATCH_THRESHOLD = 0.25;
const ANCHOR_THRESHOLD = 0.4;

export async function getClaimAudit(
  input: ReceiptToolInput,
  logger: RedisLogger | null,
  agentReasoning: string
): Promise<ReceiptToolResult> {
  const cards = listReceipts();
  if (cards.length === 0) return { status: "no_match" };

  if (input.topic_hint) {
    const exact = cards.find((c) => c.slug === input.topic_hint);
    if (exact) {
      let bestAnchor: string | undefined;
      let bestAnchorScore = 0;
      for (const a of exact.receipt.anchors) {
        const s = score(input.query, a.sub_claim + " " + a.finding);
        if (s > bestAnchorScore && s >= ANCHOR_THRESHOLD) {
          bestAnchor = a.sub_section_anchor;
          bestAnchorScore = s;
        }
      }
      return { status: "matched", slug: exact.slug, topic_short: exact.topic_short, pull_quote: exact.pull_quote, anchor: bestAnchor };
    }
  }

  let best: { card: typeof cards[number]; score: number } | null = null;
  for (const card of cards) {
    const haystack = card.topic + " " + card.topic_short + " " + card.pull_quote;
    const s = score(input.query, haystack);
    if (!best || s > best.score) best = { card, score: s };
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    let bestAnchor: string | undefined;
    let bestAnchorScore = 0;
    for (const a of best.card.receipt.anchors) {
      const s = score(input.query, a.sub_claim + " " + a.finding);
      if (s > bestAnchorScore && s >= ANCHOR_THRESHOLD) {
        bestAnchor = a.sub_section_anchor;
        bestAnchorScore = s;
      }
    }
    return {
      status: "matched",
      slug: best.card.slug,
      topic_short: best.card.topic_short,
      pull_quote: best.card.pull_quote,
      anchor: bestAnchor,
    };
  }

  if (logger) {
    const entry = JSON.stringify({
      query: input.query,
      timestamp: new Date().toISOString(),
      agent_reasoning: agentReasoning,
    });
    await logger.lpush("receipts:unmatched", entry);
    await logger.ltrim("receipts:unmatched", 0, 999);
  }

  return { status: "no_match" };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/agent/receipt-tool.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): receipt tool with anchor-aware match + Redis no-match logging

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14. Tests for receipt-tool

**Files:**
- Create: `web/tests/receipt-tool.test.ts`

- [ ] **Step 1: Write the tests**

Create `web/tests/receipt-tool.test.ts`:

```typescript
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setReceiptDataDir } from "@/lib/receipt-loader";
import { getClaimAudit, type RedisLogger } from "@/lib/agent/receipt-tool";
import { validReceipt } from "./fixtures/valid-receipt";

let tmp: string;

const crime = validReceipt({
  slug: "crime-trends",
  topic: "Crime in Toronto, 2018 to present",
  topic_short: "Crime trends",
  pull_quote: "The data shows auto theft surged in 2023 and has retreated. Violent crime indicators are mixed across the same window.",
});
const transit = validReceipt({
  slug: "ttc-performance",
  topic: "TTC ridership, safety, and service",
  topic_short: "TTC performance",
  pull_quote: "TTC ridership recovery has reached 80 percent of pre-pandemic levels. Safety incidents per million boardings are trending down.",
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-receipt-tool-"));
  setReceiptDataDir(tmp);
  const crimeWithAnchor = JSON.parse(JSON.stringify(crime));
  crimeWithAnchor.receipt.anchors[0].sub_section_anchor = "auto-theft-trend";
  crimeWithAnchor.receipt.anchors[0].sub_claim = "Auto theft trend in Toronto";
  crimeWithAnchor.receipt.anchors[0].finding = "Auto thefts surged in 2023 to peak levels and have since retreated.";
  writeFileSync(join(tmp, "crime-trends.json"), JSON.stringify(crimeWithAnchor));
  writeFileSync(join(tmp, "ttc-performance.json"), JSON.stringify(transit));
});

class FakeLogger implements RedisLogger {
  pushed: string[] = [];
  trims: [string, number, number][] = [];
  async lpush(key: string, value: string) { this.pushed.push(key + ":" + value); return 1; }
  async ltrim(key: string, start: number, stop: number) { this.trims.push([key, start, stop]); return "OK"; }
}

test("matches via topic_hint exact", async () => {
  const r = await getClaimAudit(
    { query: "irrelevant text", topic_hint: "crime-trends" },
    null,
    "agent reasoned about a hint"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("crime-trends");
});

test("matches with anchor when sub-claim overlap is strong", async () => {
  const r = await getClaimAudit(
    { query: "Is auto theft really up in Toronto?" },
    null,
    "auto theft keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") {
    expect(r.slug).toBe("crime-trends");
    expect(r.anchor).toBe("auto-theft-trend");
  }
});

test("matches without anchor when query is general", async () => {
  const r = await getClaimAudit(
    { query: "Is Toronto crime exploding?" },
    null,
    "general crime"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") {
    expect(r.slug).toBe("crime-trends");
  }
});

test("matches transit query to TTC card", async () => {
  const r = await getClaimAudit(
    { query: "Has TTC ridership recovered post-pandemic?" },
    null,
    "transit keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("ttc-performance");
});

test("returns no_match for clearly off-topic query", async () => {
  const logger = new FakeLogger();
  const r = await getClaimAudit(
    { query: "What is the best pizza topping?" },
    logger,
    "no receipt applies"
  );
  expect(r.status).toBe("no_match");
});

test("logs no_match queries to Redis with timestamp and reasoning", async () => {
  const logger = new FakeLogger();
  await getClaimAudit(
    { query: "Tell me about constellations" },
    logger,
    "scenario corpus does not cover astronomy"
  );
  expect(logger.pushed).toHaveLength(1);
  const entry = logger.pushed[0];
  expect(entry).toContain("receipts:unmatched:");
  expect(entry).toContain("constellations");
  expect(entry).toContain("astronomy");
});

test("trims the Redis list to 1000 entries on each no_match", async () => {
  const logger = new FakeLogger();
  await getClaimAudit({ query: "completely unrelated" }, logger, "no match");
  expect(logger.trims).toEqual([["receipts:unmatched", 0, 999]]);
});

test("returns no_match when no receipts are loaded", async () => {
  const empty = mkdtempSync(join(tmpdir(), "tomr-empty-receipts-"));
  setReceiptDataDir(empty);
  const r = await getClaimAudit({ query: "anything" }, null, "no corpus");
  expect(r.status).toBe("no_match");
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/receipt-tool.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/tests/receipt-tool.test.ts
git commit -m "$(cat <<'EOF'
test(sprint-12): receipt tool match with anchor + Redis logging coverage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15. Wire receipt tool into agent dispatcher and prompt

**Files:**
- Modify: `web/lib/agent/tools.ts`
- Modify: `web/app/api/ask/route.ts`
- Modify: `web/lib/agent/system-prompt.ts`

- [ ] **Step 1: Add wrapper export in tools.ts**

Read `web/lib/agent/tools.ts` and look at the `get_scenario_card` wrapper pattern added in Sprint 10. Add this analogous wrapper export at the bottom of the file (or wherever exported wrappers live):

```typescript
import { getClaimAudit } from "./receipt-tool";

export async function get_claim_audit(input: { query?: string; topic_hint?: string }) {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  let logger: { lpush: (k: string, v: string) => Promise<unknown>; ltrim: (k: string, s: number, e: number) => Promise<unknown> } | null = null;
  if (url && token) {
    const { Redis } = await import("@upstash/redis");
    logger = new Redis({ url, token });
  }
  const reasoning = typeof input?.topic_hint === "string"
    ? "topic_hint: " + input.topic_hint
    : "no topic_hint provided";
  return await getClaimAudit(
    { query: String(input?.query ?? ""), topic_hint: input?.topic_hint },
    logger,
    reasoning
  );
}
```

If the existing file already imports `Redis` directly (rather than dynamic import), match that pattern instead.

- [ ] **Step 2: Add dispatcher case in api/ask/route.ts**

Read `web/app/api/ask/route.ts`. Find the `callTool` function with the switch on `name`. Add this case alongside `get_scenario_card`:

```typescript
    case "get_claim_audit": return tools.get_claim_audit(input as { query?: string; topic_hint?: string });
```

The `callTool` function may have been wrapped to handle async tools in Sprint 10. If so, this case fits the same pattern. If not, ensure the surrounding `await Promise.resolve(callTool(...))` continues to work.

In the same file, find `summarizeResult`. Add a branch for the new tool result shape:

```typescript
  if (toolName === "get_claim_audit") {
    const r = result as { status: string; slug?: string; topic_short?: string; anchor?: string };
    if (r.status === "matched") {
      return r.topic_short + (r.anchor ? " (deep link to " + r.anchor + ")" : "");
    }
    return "no match";
  }
```

- [ ] **Step 3: Add rule 12 to system-prompt.ts**

Read `web/lib/agent/system-prompt.ts`. Append a new rule 12 to the rules list, formatted like the existing rule 11. Insert before the closing `OUTPUT:` line:

```
12. Receipt retrieval is a NARROW behaviour. Only trigger when the user
    contests a specific quantitative claim about Toronto. Triggers include
    "is X really true", "fact-check", "is crime really up", "what do the
    numbers actually show", "is it true that". Do NOT trigger on questions
    about positions, votes, statements, or implications (those use rules 5,
    7, or 11). When triggered, call get_claim_audit once with the verbatim
    query and a topic_hint (one of: crime-trends, tax-burden, housing-supply,
    ttc-performance, encampment-response). Then emit a single_answer card
    directly. If matched, the answer body is the returned pull_quote and
    evidence has one stamp pointing to "/receipts/<slug>" (or
    "/receipts/<slug>#<anchor>" when the tool returns an anchor). If
    no_match, the answer is "This claim has not yet been audited. Ask about
    a candidate's stated position or vote instead." Never generate audit
    content yourself.
```

- [ ] **Step 4: Run all tests to confirm nothing regressed**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```

Expected: 70 tests pass (46 prior + 9 receipt-types + 7 receipt-loader + 8 receipt-tool).

- [ ] **Step 5: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/agent/tools.ts web/app/api/ask/route.ts web/lib/agent/system-prompt.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): wire receipt tool into agent dispatcher and prompt rule 12

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16. /api/og receipt variants

**Files:**
- Modify: `web/app/api/og/route.ts`

- [ ] **Step 1: Read existing OG route**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/web/app/api/og/route.ts | /usr/bin/head -80
```

Note the dispatch pattern (likely a switch on `searchParams.get("type")` or chained ifs).

- [ ] **Step 2: Add the new branches**

Add an import at the top:

```typescript
import { getReceipt } from "@/lib/receipt-loader";
```

Add two new branches to the type-switch logic. Match the existing variant style (the file uses element-object dispatch per the Sprint 11 OG migration; do the same):

```tsx
  if (type === "receipt") {
    const slug = searchParams.get("slug") ?? "";
    const card = getReceipt(slug);
    if (!card) {
      return new Response("not found", { status: 404 });
    }
    return new ImageResponse(
      (
        <div style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "#15110d", color: "#e8e3d5", padding: "60px 80px",
          fontFamily: "Inter",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.12em", color: "#c44848", border: "1px solid #c44848", padding: "4px 10px", borderRadius: 2 }}>
              AUDITED
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8a8275" }}>
              Receipt . The Mayoral Record
            </span>
          </div>
          <div style={{ fontFamily: "Source Serif Pro", fontSize: 64, fontWeight: 700, lineHeight: 1.1, marginBottom: 32, letterSpacing: "-0.02em", color: "#e8e3d5" }}>
            {card.topic_short}
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: "#d4ccb8", maxWidth: 1000 }}>
            {card.pull_quote}
          </div>
          <div style={{ marginTop: "auto", fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#8a8275", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            mayoralrecord.com/receipts/{card.slug}
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  if (type === "receipts-index") {
    return new ImageResponse(
      (
        <div style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "#15110d", color: "#e8e3d5", padding: "60px 80px",
          fontFamily: "Inter",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.12em", color: "#c44848", border: "1px solid #c44848", padding: "4px 10px", borderRadius: 2 }}>
              AUDITED
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8a8275" }}>
              Receipts . The Mayoral Record
            </span>
          </div>
          <div style={{ fontFamily: "Source Serif Pro", fontSize: 80, fontWeight: 700, lineHeight: 1.05, marginBottom: 32, letterSpacing: "-0.02em", color: "#e8e3d5" }}>
            Receipts
          </div>
          <div style={{ fontSize: 28, lineHeight: 1.4, color: "#d4ccb8", maxWidth: 980 }}>
            Verbatim attributed claims, audited against Toronto Open Data.
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
```

If the existing OG file uses element-object dispatch (`{ type: "div", props: ... }`) instead of JSX, adapt to that pattern.

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/api/og/route.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): /api/og receipt and receipts-index variants

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17. Methodology page update

**Files:**
- Modify: `web/app/methodology/page.tsx`

- [ ] **Step 1: Read existing methodology page**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/web/app/methodology/page.tsx
```

The page already has a "Policy scenario cards" section from Sprint 10. The Sprint 11 migration left it dark.

- [ ] **Step 2: Append a new Receipts section**

Add a new section below the "Policy scenario cards" section:

```tsx
        <section className="mt-12 pt-8 border-t border-[#ffffff15]">
          <h2 className="font-serif text-2xl font-bold mb-4">Receipts</h2>
          <p className="mb-3">
            Some pages on this site audit specific verbatim claims about Toronto against Toronto Open Data. Receipts live at <a href="/receipts" className="underline">/receipts</a>. Each one quotes the verbatim claim with attribution and a link to the primary source, lays out the data with caveats, and explicitly acknowledges what the data does not settle.
          </p>
          <h3 className="font-serif text-lg font-bold mt-6 mb-2">Editorial discipline</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm mb-4">
            <li><strong>Verbatim only.</strong> No paraphrasing. Every claim quoted exactly as said, with a primary-source URL.</li>
            <li><strong>Time-bounded.</strong> Claims dated 2024-01-01 or later, within the active 2026 campaign window.</li>
            <li><strong>Attribution-balanced.</strong> The corpus includes claims from each candidate in the race.</li>
            <li><strong>No editorial commentary in the claim block.</strong> The receipt presents the data and lets the data speak.</li>
            <li><strong>Honest about limits.</strong> When data cannot answer the underlying question (subjective experience, perceived quality), the receipt says so explicitly.</li>
          </ul>
          <h3 className="font-serif text-lg font-bold mt-6 mb-2">Source-tier system</h3>
          <p className="mb-3 text-sm">Receipts use the same four-tier source system as scenario cards (T1 primary government data, T2 independent analysis, T3 peer-reviewed academic, T4 in-house extrapolation). Each data anchor inside a receipt carries a tier badge.</p>
        </section>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/methodology/page.tsx
git commit -m "$(cat <<'EOF'
docs(sprint-12): methodology page adds Receipts framework section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18. Sitemap update

**Files:**
- Modify: `web/app/sitemap.ts`

- [ ] **Step 1: Read existing sitemap**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/web/app/sitemap.ts
```

Sprint 10 created this file with /scenarios + per-slug entries.

- [ ] **Step 2: Add /receipts entries**

Add the import:

```typescript
import { listReceiptSlugs } from "@/lib/receipt-loader";
```

Add to the entries array, alongside the existing /scenarios entries:

```typescript
{ url: ORIGIN + "/receipts", lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
...listReceiptSlugs().map((slug) => ({
  url: ORIGIN + "/receipts/" + slug,
  lastModified: new Date(),
  changeFrequency: "weekly" as const,
  priority: 0.7,
})),
```

The `ORIGIN` constant name may differ (likely `BASE_URL` or similar). Match the existing convention in the file.

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/sitemap.ts
git commit -m "$(cat <<'EOF'
feat(sprint-12): sitemap includes /receipts and per-card URLs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19. Local build smoke test (pre-content)

**Files:** none modified.

- [ ] **Step 1: Run all tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```

Expected: 70 tests passing.

- [ ] **Step 2: Run a production build**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run build
```

Expected: build completes without TypeScript errors. Routes including `/receipts` and `/receipts/[slug]` appear in build output. With zero receipt JSON files, generateStaticParams returns an empty array; the index renders empty-state. That is fine.

- [ ] **Step 3: Run dev server briefly and visually check empty index**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev
```

In another terminal:

```bash
/usr/bin/curl -sL http://localhost:3000/receipts | /usr/bin/grep -oE "No receipts published yet"
```

Expected: prints `No receipts published yet`. Stop dev server.

---

## Tasks 20 to 24. Convert research outputs to JSON

**One task per launch receipt. Each follows the same shape: read research markdown, convert to JSON matching the ReceiptCard schema, validate, deploy-time editorial fix where flagged, commit.**

### Per-card workflow

- [ ] **Step 1: Read the research markdown**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/research/sprint-12/output/receipt-<slug>.md
```

- [ ] **Step 2: Convert markdown to JSON**

Translate the markdown sections to JSON fields:

| Markdown | JSON |
|---|---|
| `## TOPIC` | `topic` |
| `## SLUG` | `slug` |
| `## TOPIC_SHORT` | `topic_short` |
| `## PULL QUOTE` | `pull_quote` |
| `## CLAIMS` (each `### Claim N`) | one entry in `claims[]` with `headline`, `attribution`, `source: { attribution, url, retrieved }` |
| `## RECEIPT INTRO` | `receipt.intro` |
| `## EXHIBITS` (each `### Exhibit N`) | one entry in `receipt.anchors[]` with `sub_section_anchor`, `sub_claim`, `finding`, `metric`, `source: { tier, label, url? }`, `caveats?`, `as_of` |
| `## WHAT DATA CANNOT SETTLE` | `what_data_cannot_settle` (optional) |
| `## COMPARABLES` | `comparables[]` (optional, each with `name`, `period`, `summary`, `outcome`, `citations[]`, `caveats`) |

Set `meta.last_reviewed` to `2026-05-07` (today). Set `meta.next_review` to `2026-06-07` (4 weeks out).

Write to `web/public/data/receipts/<slug>.json`.

- [ ] **Step 3: Validate the JSON**

Add a one-shot vitest test that loads the file and asserts validity. The test file `web/tests/_receipt-content-validation.test.ts` is created during Task 20 (the first card) and accumulates the others.

For Task 20 (first card), create `web/tests/_receipt-content-validation.test.ts`:

```typescript
import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateReceiptCard } from "@/lib/receipt-types";

const slugs = [
  "crime-trends",
  "tax-burden",
  "housing-supply",
  "ttc-performance",
  "encampment-response",
];

for (const slug of slugs) {
  test("receipt card validates: " + slug, () => {
    const path = join("public", "data", "receipts", slug + ".json");
    if (!existsSync(path)) {
      return;
    }
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const result = validateReceiptCard(raw);
    if (!result.ok) {
      throw new Error("Validation failed for " + slug + ": " + JSON.stringify(result.errors));
    }
    expect(result.ok).toBe(true);
  });
}
```

Run the test:

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/_receipt-content-validation.test.ts
```

Expected: tests for the slug just authored pass; remaining slugs are skipped (file does not exist yet).

- [ ] **Step 4: Visual review on dev server**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev
```

Open `http://localhost:3000/receipts/<slug>`. Confirm:
- Claim block renders with red AUDITED stamp
- Each exhibit has its anchor id (use Cmd+F to search `id="<sub_section_anchor>"` in source)
- Tier badges render correctly
- Caveats render where present
- No em dashes anywhere

Test a deep-link: open `http://localhost:3000/receipts/<slug>#<anchor>`. Page should scroll to the right exhibit.

If any issue, edit the JSON inline.

- [ ] **Step 5: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/public/data/receipts/<slug>.json
git commit -m "content(sprint-12): receipt . <topic_short>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

For Task 20, also stage the validation test file.

### Per-card mappings + conversion-time editorial fixes

**Task 20: Crime trends.**
- Source: `research/sprint-12/output/receipt-crime-trends.md`
- Output: `web/public/data/receipts/crime-trends.json`
- topic_short: "Crime trends"
- **Editorial fixes (flagged in research report):**
  - Replace the Chow source URL (currently CCTVmedium) with a primary source. Check City of Toronto press releases, Mayor's office video, or council livestream. If no primary source can be located, drop the Chow claim from this card and ship with only the Bradford claim. Document this in the commit message.
  - Verify the 2018 auto-theft baseline figure by direct-pulling from the TPS Auto Theft Open Data CSV at https://data.torontopolice.on.ca. Adjust Exhibit 1's metric if the research figure was approximated.
  - Confirm 2023 peak and 2024/2025 decline figures with direct dashboard pulls.

**Task 21: Tax burden.**
- Source: `research/sprint-12/output/receipt-tax-burden.md`
- Output: `web/public/data/receipts/tax-burden.json`
- topic_short: "Tax burden"
- No editorial fixes flagged. Direct conversion.

**Task 22: Housing supply.**
- Source: `research/sprint-12/output/receipt-housing-supply.md`
- Output: `web/public/data/receipts/housing-supply.json`
- topic_short: "Housing supply"
- No editorial fixes flagged. Direct conversion.

**Task 23: TTC performance.**
- Source: `research/sprint-12/output/receipt-ttc-performance.md`
- Output: `web/public/data/receipts/ttc-performance.json`
- topic_short: "TTC performance"
- **Editorial fixes (flagged in research report):**
  - The Chow claim sourced from December 20, 2023 is outside the 2024-01-01+ window the schema enforces. Swap to her September 2024 service-increase quote: "People across Toronto need and want more frequent and reliable transit service, and I am thrilled to say we are delivering just that." Find the primary source URL (TTC press release or City of Toronto Mayor's office page).
  - The research output has 7 exhibits but the schema caps at 6. Drop the weakest exhibit. Likely candidate: fold operating-subsidy-per-ride into one of the existing exhibits, or drop one of the on-time-performance pair (keep the more authoritative T1 source).

**Task 24: Encampment response.**
- Source: `research/sprint-12/output/receipt-encampment-response.md`
- Output: `web/public/data/receipts/encampment-response.json`
- topic_short: "Encampment response"
- No editorial fixes flagged. Direct conversion.

After all 5 are committed, run the full validation suite:

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/_receipt-content-validation.test.ts
```

Expected: all 5 tests pass.

---

## Task 25. Production deploy and acceptance verification

**Files:** none modified.

- [ ] **Step 1: Final test pass**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```

Expected: 75 tests pass (46 prior + 9 receipt-types + 7 receipt-loader + 8 receipt-tool + 5 receipt-content-validation).

- [ ] **Step 2: Build**

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run build
```

Expected: build succeeds. Route output includes `/receipts` and one entry per receipt slug under `/receipts/[slug]`.

- [ ] **Step 3: Push origin/main**

```bash
cd /Users/aramammo/thebradfordfiles
git push origin main
```

- [ ] **Step 4: Production deploy via Vercel**

```bash
cd /Users/aramammo/thebradfordfiles
vercel --prod --yes
```

Capture the deployment URL. Wait for `READY` state.

- [ ] **Step 5: Walk through acceptance criteria against production**

```bash
URL="https://www.mayoralrecord.com"

echo "AC1+AC2: index page lists 5 receipts"
/usr/bin/curl -sL "$URL/receipts" | /usr/bin/grep -oE "Last reviewed" | /usr/bin/wc -l
# expected: 5

echo "AC1: each detail page returns 200 and has at least 1 claim block"
for slug in crime-trends tax-burden housing-supply ttc-performance encampment-response; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL/receipts/$slug")
  hasClaim=$(/usr/bin/curl -sL "$URL/receipts/$slug" | /usr/bin/grep -c "AUDITED")
  echo "  $slug : $code . AUDITED stamp: $hasClaim"
done

echo "AC3: deep-link anchors render"
slug="crime-trends"
/usr/bin/curl -sL "$URL/receipts/$slug" | /usr/bin/grep -oE 'id="[a-z0-9-]+"' | /usr/bin/head -8

echo "AC7: OG renders for each receipt"
for slug in crime-trends tax-burden housing-supply ttc-performance encampment-response; do
  ct=$(/usr/bin/curl -sLI "$URL/api/og?type=receipt&slug=$slug" | /usr/bin/grep -i "content-type:" | /usr/bin/head -1 | /usr/bin/tr -d "\r")
  echo "  $slug : $ct"
done

echo "AC9: sitemap includes receipts + each slug"
/usr/bin/curl -sL "$URL/sitemap.xml" | /usr/bin/grep -oE "/receipts[^<]*" | /usr/bin/sort -u

echo "AC10: em-dash count across rendered pages (target: 0)"
total=0
for path in "/receipts" "/receipts/crime-trends" "/receipts/tax-burden" "/receipts/housing-supply" "/receipts/ttc-performance" "/receipts/encampment-response"; do
  c=$(/usr/bin/curl -sL "$URL$path" | /usr/bin/grep -c "—")
  total=$((total + c))
  echo "  $path: $c"
done
echo "  TOTAL: $total"

echo "AC8: methodology page mentions Receipts framework"
/usr/bin/curl -sL "$URL/methodology" | /usr/bin/grep -oE "Receipts" | /usr/bin/sort -u | /usr/bin/head -3
```

Expected: every check matches the acceptance criteria from the spec.

- [ ] **Step 6: Confirm Sprint 9, 10, 11 surfaces still work (no regression)**

```bash
URL="https://www.mayoralrecord.com"
for path in "/" "/candidates" "/candidates/bradford" "/scenarios" "/scenarios/housing-supply-mechanism" "/methodology"; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL$path")
  echo "  $code  $path"
done
/usr/bin/curl -s -o /dev/null -w "  /api/ask Turnstile gate: HTTP %{http_code}\n" -X POST "$URL/api/ask" -H "Content-Type: application/json" -d '{"query":"smoke"}'
```

Expected: every prior surface returns 200; /api/ask still 403 without Turnstile token.

---

## Self-review notes

This plan was reviewed against the spec at `docs/superpowers/specs/2026-05-07-sprint-12-receipts.md`. Coverage of acceptance criteria:

| AC# | Requirement | Task |
|---|---|---|
| 1 | All 5 receipts live and pass validation | 20-24 |
| 2 | Index lists all 5 with claim count | 10 + 20-24 |
| 3 | Deep-link anchors render | 7 (Exhibit component) + 11 |
| 4 | Tool retrieves correctly per topic + handles no_match | 13, 14 |
| 5 | Tool returns anchor when sub-claim match is strong | 13, 14 (test "matches with anchor") |
| 6 | no_match logs to Redis | 13, 14 |
| 7 | /api/og receipt returns image/png | 16 |
| 8 | Methodology page updated | 17 |
| 9 | Sitemap includes /receipts + 5 slugs | 18 |
| 10 | Em-dash count: 0 | 2 (em-dash guard), 25 (verification) |
| 11 | All Vitest suites pass + new tests | 3, 5, 14, 19, 25 |
| 12 | Corpus claims attributed to at least 2 candidates | 20-24 (editorial check at conversion) |
| 13 | Visual review confirms /receipts is recognisably distinct | 25 (visual smoke) |

Type names consistent: `ReceiptCard`, `ReceiptCardSchema`, `ClaimBlock`, `ClaimSource`, `DataAnchor`, `DataAnchorSchema`, `validateReceiptCard`, `setReceiptDataDir`, `listReceipts`, `getReceipt`, `listReceiptSlugs`, `getClaimAudit`, `RedisLogger`, `ReceiptToolInput`, `ReceiptToolResult`.

No placeholders. Every code step contains the actual code an engineer needs.
