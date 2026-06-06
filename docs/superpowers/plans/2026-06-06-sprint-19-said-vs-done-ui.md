# "Said vs. Done" Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Sprint 18's `related_votes` on the candidate page as a per-topic "Said vs. Done" ledger (position quote + its council votes), evidence-only, expandable.

**Architecture:** A pure `buildSaidVsDone(records, topic)` helper filters to position/pledge records with paired votes and strength-ranks them (full list, votes confidence-sorted). A server `SaidVsDone` component slices to top-3 positions × top-3 votes for the default render and hands the overflow to a small client `SaidVsDoneExpander`. Wired into the existing per-topic loop on the candidate page.

**Tech Stack:** Next.js (App Router), React server + client components, TypeScript, vitest. Tests: `cd web && npm test` (vitest run); type-check: `cd web && npx tsc --noEmit`; build: `cd web && npm run build`. (All node-based — unaffected by the broken Python env.)

> **Refinement vs spec:** the spec put top-N slicing + remaining-counts inside `buildSaidVsDone`. This plan keeps the helper as pure filter+rank (returns the FULL ordered list) and moves slicing/expansion into the component — otherwise "show N more" has no data to reveal. Same user-visible behavior (top-3 × top-3 default, expandable, strength-ranked).

---

### Task 1: `buildSaidVsDone` helper + types + tests

**Files:**
- Modify: `web/lib/agent/data-loader.ts` (add `related_votes` to `RecordEntry`)
- Create: `web/lib/said-vs-done.ts`
- Test: `web/tests/said-vs-done.test.ts`

- [ ] **Step 1: Add `related_votes` to `RecordEntry`**

In `web/lib/agent/data-loader.ts`, the `RecordEntry` interface currently ends with the `council_verification?: {...}` line. Add one line before the closing `}`:

```ts
  related_votes?: import("@/lib/said-vs-done").RelatedVote[];
```

- [ ] **Step 2: Write the failing test**

Create `web/tests/said-vs-done.test.ts`:

```ts
import { test, expect } from "vitest";
import { buildSaidVsDone, councilAgendaUrl } from "@/lib/said-vs-done";
import type { RecordEntry } from "@/lib/agent/data-loader";

function rec(over: Partial<RecordEntry>): RecordEntry {
  return { shortcode: "X", kind: "position", topic: "housing", summary: "s", ...over };
}

test("includes only position/pledge with matching topic and non-empty related_votes", () => {
  const records: RecordEntry[] = [
    rec({ shortcode: "P1", kind: "position", topic: "housing",
          related_votes: [{ confidence: 0.5 }] }),
    rec({ shortcode: "PL1", kind: "pledge", topic: "housing",
          related_votes: [{ confidence: 0.4 }] }),
    rec({ shortcode: "A1", kind: "action", topic: "housing",
          council_verification: { agenda_item: "2024.X.1" } }),       // excluded: action
    rec({ shortcode: "P2", kind: "position", topic: "transit",
          related_votes: [{ confidence: 0.9 }] }),                     // excluded: topic
    rec({ shortcode: "P3", kind: "position", topic: "housing",
          related_votes: [] }),                                        // excluded: empty
    rec({ shortcode: "P4", kind: "position", topic: "housing",
          summary: "", related_votes: [{ confidence: 0.5 }] }),        // excluded: no summary
  ];
  const out = buildSaidVsDone(records, "housing");
  expect(out.items.map(i => i.shortcode).sort()).toEqual(["P1", "PL1"]);
});

test("ranks positions by pairing strength (max confidence, tiebreak count)", () => {
  const records: RecordEntry[] = [
    rec({ shortcode: "MANY_WEAK", related_votes: [{ confidence: 0.3 }, { confidence: 0.3 }, { confidence: 0.3 }] }),
    rec({ shortcode: "ONE_STRONG", related_votes: [{ confidence: 0.8 }] }),
  ];
  const out = buildSaidVsDone(records, "housing");
  expect(out.items[0].shortcode).toBe("ONE_STRONG");  // higher max confidence wins
});

test("sorts a position's votes by confidence desc", () => {
  const out = buildSaidVsDone([
    rec({ shortcode: "P1", related_votes: [
      { agenda_item: "a", confidence: 0.3 },
      { agenda_item: "b", confidence: 0.7 },
      { agenda_item: "c", confidence: 0.5 },
    ] }),
  ], "housing");
  expect(out.items[0].votes.map(v => v.agenda_item)).toEqual(["b", "c", "a"]);
});

test("empty when no qualifying records", () => {
  expect(buildSaidVsDone([], "housing")).toEqual({ items: [] });
  expect(buildSaidVsDone([rec({ kind: "action", related_votes: undefined })], "housing"))
    .toEqual({ items: [] });
});

test("councilAgendaUrl builds the toronto.ca url, empty for missing id", () => {
  expect(councilAgendaUrl("2024.CC19.4"))
    .toBe("https://secure.toronto.ca/council/agenda-item.do?item=2024.CC19.4");
  expect(councilAgendaUrl("")).toBe("");
  expect(councilAgendaUrl(undefined)).toBe("");
});
```

- [ ] **Step 3: Run it, verify FAIL**

Run: `cd web && npm test -- said-vs-done`
Expected: FAIL — cannot find module `@/lib/said-vs-done`.

- [ ] **Step 4: Implement `web/lib/said-vs-done.ts`**

```ts
import type { RecordEntry } from "@/lib/agent/data-loader";

export interface RelatedVote {
  agenda_item?: string;
  agenda_item_title?: string;
  vote_disposition?: string;
  result?: string;
  vote_date?: string;
  vote_description?: string;
  confidence?: number;
}

export interface SaidVsDoneItem {
  shortcode: string;
  summary: string;
  post_date?: string;
  post_url?: string;
  kind: string;
  votes: RelatedVote[];  // ALL related votes, confidence-desc (component slices)
}

export interface SaidVsDoneTopic {
  items: SaidVsDoneItem[];  // ALL qualifying positions, strength-ranked (component slices)
}

const POSITION_KINDS = new Set(["position", "pledge"]);

function maxConfidence(votes: RelatedVote[]): number {
  return votes.reduce((m, v) => Math.max(m, v.confidence ?? 0), 0);
}

export function buildSaidVsDone(records: RecordEntry[], topic: string): SaidVsDoneTopic {
  const qualifying = records.filter(
    (r) =>
      POSITION_KINDS.has(r.kind) &&
      r.topic === topic &&
      (r.summary ?? "").trim() !== "" &&
      Array.isArray(r.related_votes) &&
      r.related_votes.length > 0,
  );
  qualifying.sort((a, b) => {
    const va = a.related_votes ?? [], vb = b.related_votes ?? [];
    return (maxConfidence(vb) - maxConfidence(va)) || (vb.length - va.length);
  });
  const items: SaidVsDoneItem[] = qualifying.map((r) => ({
    shortcode: r.shortcode,
    summary: r.summary ?? "",
    post_date: r.post_date,
    post_url: r.post_url,
    kind: r.kind,
    votes: [...(r.related_votes ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
  }));
  return { items };
}

export function councilAgendaUrl(agendaItem: string | undefined): string {
  if (!agendaItem) return "";
  return `https://secure.toronto.ca/council/agenda-item.do?item=${agendaItem}`;
}
```

- [ ] **Step 5: Run tests + type-check, verify PASS**

Run: `cd web && npm test -- said-vs-done` → all pass.
Run: `cd web && npx tsc --noEmit` → no errors.
Run: `cd web && npm test` → full vitest suite still green (the `RecordEntry` addition is optional, so existing tests are unaffected).

- [ ] **Step 6: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/said-vs-done.ts web/lib/agent/data-loader.ts web/tests/said-vs-done.test.ts
git commit -m "feat(sprint-19): buildSaidVsDone helper + related_votes type + tests"
```

---

### Task 2: `SaidVsDone` component + client expander

**Files:**
- Create: `web/components/SaidVsDone.tsx` (server)
- Create: `web/components/SaidVsDoneExpander.tsx` (client)

- [ ] **Step 1: Implement the client expander**

Create `web/components/SaidVsDoneExpander.tsx`:

```tsx
"use client";
import { useState } from "react";

export function MoreToggle({ count, expanded, onToggle, noun }:
  { count: number; expanded: boolean; onToggle: () => void; noun: string }) {
  if (count <= 0) return null;
  return (
    <button
      onClick={onToggle}
      className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-accent cursor-pointer mt-1"
    >
      {expanded ? `hide ${noun} ↑` : `show ${count} more ${noun} ↓`}
    </button>
  );
}

export function useExpanded(): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  return [open, () => setOpen((v) => !v)];
}
```

- [ ] **Step 2: Implement the server component (with a small client wrapper for per-item expansion)**

Because per-item vote expansion needs client state, render each item through a thin client wrapper. Create `web/components/SaidVsDone.tsx`:

```tsx
import type { SaidVsDoneTopic, SaidVsDoneItem, RelatedVote } from "@/lib/said-vs-done";
import { councilAgendaUrl } from "@/lib/said-vs-done";
import { SaidVsDoneItemCard } from "@/components/SaidVsDoneItemCard";

const MAX_POSITIONS = 3;

export function SaidVsDone({ topic }: { topic: SaidVsDoneTopic }) {
  if (topic.items.length === 0) return null;
  const shown = topic.items.slice(0, MAX_POSITIONS);
  const remaining = topic.items.slice(MAX_POSITIONS);
  return (
    <div className="mt-4">
      <div className="label mb-2">Said vs. Done</div>
      <div className="space-y-4">
        {shown.map((it) => <SaidVsDoneItemCard key={it.shortcode} item={it} />)}
      </div>
      {remaining.length > 0 && <MorePositions items={remaining} />}
    </div>
  );
}

// renders the URL helper at module scope so the client card can import a plain string builder
export { councilAgendaUrl };
```

- [ ] **Step 3: Implement the per-item client card**

Create `web/components/SaidVsDoneItemCard.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { SaidVsDoneItem, RelatedVote } from "@/lib/said-vs-done";
import { councilAgendaUrl } from "@/lib/said-vs-done";

const MAX_VOTES = 3;

function VoteRow({ v }: { v: RelatedVote }) {
  const url = councilAgendaUrl(v.agenda_item);
  const sub = [v.result, (v.vote_date ?? "").slice(0, 10), v.agenda_item].filter(Boolean).join(" · ");
  return (
    <div className="mb-2.5">
      {v.vote_disposition && (
        <span className="font-mono text-[10px] border border-[#5a5240] text-[#c8c2b0] px-1.5 py-0.5 rounded-sm">
          VOTED {v.vote_disposition.toUpperCase()}
        </span>
      )}
      <span className="font-serif text-[13px] text-[#d4ccb8]"> {v.agenda_item_title ?? "(untitled motion)"}</span>
      <div className="font-mono text-[10.5px] text-muted">
        {url ? <a href={url} target="_blank" rel="noopener" className="hover:text-accent">{sub} ↗</a> : sub}
      </div>
    </div>
  );
}

export function SaidVsDoneItemCard({ item }: { item: SaidVsDoneItem }) {
  const [open, setOpen] = useState(false);
  const votes = open ? item.votes : item.votes.slice(0, MAX_VOTES);
  const remaining = item.votes.length - MAX_VOTES;
  return (
    <div className="bg-[#1c1813] border border-rule rounded-sm p-5">
      <div className="font-mono text-[10px] tracking-label uppercase text-muted mb-1.5">
        Said · {item.kind} · {(item.post_date ?? "").slice(0, 10)}
        {item.post_url && <> · <a href={item.post_url} target="_blank" rel="noopener" className="text-accent">source ↗</a></>}
      </div>
      <div className="font-serif text-[15px] leading-[1.4] text-ink mb-3.5">"{item.summary}"</div>
      <div className="border-l-2 border-rule pl-3.5 ml-0.5">
        <div className="font-mono text-[10px] tracking-label uppercase text-muted mb-2">Done · council votes</div>
        {votes.map((v, i) => <VoteRow key={`${v.agenda_item ?? i}`} v={v} />)}
        {remaining > 0 && (
          <button onClick={() => setOpen(!open)} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-accent cursor-pointer">
            {open ? "hide votes ↑" : `show ${remaining} more votes ↓`}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the "more positions" client toggle**

Append to `web/components/SaidVsDone.tsx` (top-level, after the `SaidVsDone` export), the `MorePositions` client wrapper — create it as its own client file `web/components/MorePositions.tsx` and import it:

Create `web/components/MorePositions.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { SaidVsDoneItem } from "@/lib/said-vs-done";
import { SaidVsDoneItemCard } from "@/components/SaidVsDoneItemCard";

export function MorePositions({ items }: { items: SaidVsDoneItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      {open && <div className="space-y-4 mb-3">{items.map((it) => <SaidVsDoneItemCard key={it.shortcode} item={it} />)}</div>}
      <button onClick={() => setOpen(!open)} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-accent cursor-pointer">
        {open ? "hide positions ↑" : `show ${items.length} more positions ↓`}
      </button>
    </div>
  );
}
```

Then in `web/components/SaidVsDone.tsx`, add the import at the top: `import { MorePositions } from "@/components/MorePositions";` and remove the stray `export { councilAgendaUrl };` line + the unused `RelatedVote`/`SaidVsDoneItem`/`councilAgendaUrl` imports (keep only `SaidVsDoneTopic` and the two component imports). Final `SaidVsDone.tsx` imports:

```tsx
import type { SaidVsDoneTopic } from "@/lib/said-vs-done";
import { SaidVsDoneItemCard } from "@/components/SaidVsDoneItemCard";
import { MorePositions } from "@/components/MorePositions";
```

- [ ] **Step 5: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (No render test — consistent with the project, which unit-tests pure logic; the logic is covered in Task 1. Visual verification happens in Task 3.)

- [ ] **Step 6: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/SaidVsDone.tsx web/components/SaidVsDoneItemCard.tsx web/components/MorePositions.tsx web/components/SaidVsDoneExpander.tsx
git commit -m "feat(sprint-19): SaidVsDone ledger component + client expanders"
```

---

### Task 3: Wire into the candidate page

**Files:**
- Modify: `web/app/candidates/[slug]/page.tsx`

- [ ] **Step 1: Load records + build per-topic, render the block**

In `web/app/candidates/[slug]/page.tsx`:

1. Update imports at top:
```tsx
import { listCandidates, getDossier, getSynthesis, getRecordsForHandle } from "@/lib/agent/data-loader";
import { buildSaidVsDone } from "@/lib/said-vs-done";
import { SaidVsDone } from "@/components/SaidVsDone";
```
2. Replace the line `void getDossier(slug);` with:
```tsx
  const records = getRecordsForHandle(slug);
```
3. Inside the `TOPICS.map(topic => { ... })` block, after the `<DropCap>{cell.summary}</DropCap>` and the existing `cell.consistency?.label` block, before the closing `</section>`, add:
```tsx
              <SaidVsDone topic={buildSaidVsDone(records, topic)} />
```

- [ ] **Step 2: Type-check + build**

Run: `cd web && npx tsc --noEmit` → no errors.
Run: `cd web && npm run build` → builds successfully.

- [ ] **Step 3: Verify against real data**

Run: `cd web && npm run build` then inspect, or `npm run dev` and open `/candidates/bradford`. Confirm:
- Bradford and Chow topic sections show "Said vs. Done" blocks with position quotes + neutral `VOTED YES/NO` pills + agenda links.
- Expanders ("show N more votes", "show N more positions") work.
- `/candidates/mcvie` shows NO Said-vs-Done blocks (she has no `related_votes`), and her synthesis sections render normally.
- A grep sanity check that the data is present:
```bash
cd /Users/aramammo/thebradfordfiles && .venv/bin/python -c "import json; d=json.load(open('web/public/data/candidates/bradford.json')); print('records w/ related_votes:', sum(1 for r in d['records'] if r.get('related_votes')))"
```
Expected: a positive count (≈1560).

- [ ] **Step 4: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/candidates/\[slug\]/page.tsx
git commit -m "feat(sprint-19): surface Said vs Done per topic on the candidate page"
```

---

## Self-Review

- **Spec coverage:** placement nested-under-topic (Task 3) ✓; ledger/timeline card with neutral disposition pills + IG source link + agenda link (Task 2) ✓; top-3 × top-3 default + expanders (Task 2 components slice; helper provides full ranked data — the documented refinement) ✓; strength ranking + vote confidence-sort (Task 1) ✓; `councilAgendaUrl` (Task 1) ✓; `related_votes` on `RecordEntry` (Task 1) ✓; empty topics / McVie render nothing (Task 2 `if items.length===0 return null`; Task 3 verify) ✓; neutrality — no verdict/score, outlined pills (Task 2) ✓; tests for filter/rank/sort/empty/url (Task 1) ✓. Synthesis/header/stat-strip untouched (Task 3 only adds one line) ✓.
- **Placeholder scan:** No TBD/TODO; every code step shows full code or exact edits.
- **Type consistency:** `RelatedVote`/`SaidVsDoneItem`/`SaidVsDoneTopic` defined in `said-vs-done.ts` and imported consistently by components; `buildSaidVsDone(records, topic): SaidVsDoneTopic` and `councilAgendaUrl(string|undefined): string` match across tasks and tests; `getRecordsForHandle` is the existing loader (confirmed in data-loader.ts). Component prop `{ topic: SaidVsDoneTopic }` matches the page's `buildSaidVsDone(...)` output.
