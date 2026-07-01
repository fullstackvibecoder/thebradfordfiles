# Mayoral Record Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Mayoral Record UI on a CSS-variable token system with a modern Toronto "Transit" skin, a follow-system dual theme, a front-page homepage with an auto-derived Featured-comparison module, and fixes for two known defects.

**Architecture:** All color moves from hardcoded hex in `tailwind.config.ts` to CSS variables defined per theme in `globals.css`; Tailwind color keys keep their names so existing classes re-theme centrally. Theming is CSS-first (media query + optional override class) with a tiny inline head script for persisted overrides — no FOUC, no JS needed for the common case. The Featured engine is pure functions (TDD'd with inline fixtures) behind a thin data-loading wrapper. Card and surface restyles inherit the tokens.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 3.4, TypeScript, Vitest (node env). Path alias `@/*` → repo `web/` root.

## Global Constraints

- **Tailwind + CSS variables only. No new runtime or dev dependencies** (no UI kit, no animation lib, no icon package, no jsdom/RTL). Motifs are inline SVG.
- All working directory paths are under `web/`. Run all commands from `web/`.
- Theme must resolve before first paint (no flash), and the follow-system default must work with JS disabled.
- Trust signals (verification trail, "N sources cross-referenced", consistency dots, evidence stamps) are preserved — restyled, never removed.
- The Featured module never generates prose: every displayed quote is a verbatim `source_quote` from a real record; entries with unresolvable evidence are dropped; an empty queue hides the module.
- Tests run with `npm test` (`vitest run`), node environment. DOM/React glue that cannot be unit-tested without new deps is verified via `npx tsc --noEmit` + `npm run build` + a documented manual check.
- WCAG AA contrast in both themes and `prefers-reduced-motion` respected for the rotation.
- Consistency-dot colors: `green`→`--success`, `yellow`→`--signal`, `red`→`--accent`, `gray`→`--muted`.

---

### Task 1: Token system foundation (tailwind + globals.css)

Migrate color to CSS variables and define both themes. This re-themes every surface that already uses the existing color classes.

**Files:**
- Modify: `web/tailwind.config.ts`
- Modify: `web/app/globals.css`

**Interfaces:**
- Produces: Tailwind color keys backed by CSS vars — `bg, surface, surface-2, ink, ink-2, muted, rule, accent, accent-ink, signal, signal-ink, success, masthead, masthead-ink, stamp-bg, stamp-border, stamp-text, stamp-verified-bg, stamp-verified-border, stamp-verified-text`. Theme applied via `:root` (light default), `@media (prefers-color-scheme: dark) :root:not(.light)` and `:root.dark` (dark), `:root.light` (forced light).

- [ ] **Step 1: Replace the color block in `tailwind.config.ts`**

Replace the `colors` object (lines 7–20) with variable-backed keys; leave `fontFamily` and `letterSpacing` unchanged:

```ts
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        signal: "var(--signal)",
        "signal-ink": "var(--signal-ink)",
        success: "var(--success)",
        rule: "var(--rule)",
        masthead: "var(--masthead)",
        "masthead-ink": "var(--masthead-ink)",
        "stamp-bg": "var(--stamp-bg)",
        "stamp-border": "var(--stamp-border)",
        "stamp-text": "var(--stamp-text)",
        "stamp-verified-bg": "var(--stamp-verified-bg)",
        "stamp-verified-border": "var(--stamp-verified-border)",
        "stamp-verified-text": "var(--stamp-verified-text)",
      },
```

- [ ] **Step 2: Define theme tokens at the top of `globals.css`**

Insert immediately after the three `@tailwind` lines, before `@layer base`:

```css
:root {
  --bg: #f4f2ee; --surface: #ffffff; --surface-2: #faf9f7;
  --ink: #17150f; --ink-2: #4a4640; --muted: #7d7566; --rule: #e4e1d8;
  --accent: #da251d; --accent-ink: #ffffff;
  --signal: #f2c200; --signal-ink: #111111; --success: #2b8a3e;
  --masthead: #111111; --masthead-ink: #ffffff;
  --stamp-bg: #faf9f7; --stamp-border: #e4e1d8; --stamp-text: #4a4640;
  --stamp-verified-bg: #ffffff; --stamp-verified-border: #da251d; --stamp-verified-text: #da251d;
  --sel-bg: #f2c200; --sel-ink: #111111;
}
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --bg: #121110; --surface: #1a1815; --surface-2: #201d19;
    --ink: #ece7db; --ink-2: #b8b2a4; --muted: #8a8275; --rule: #2a2620;
    --accent: #e5463d; --accent-ink: #14110d;
    --signal: #f2c200; --signal-ink: #111111; --success: #57b45e;
    --masthead: #0c0b0a; --masthead-ink: #f5f2ea;
    --stamp-bg: #1c1813; --stamp-border: #4a4234; --stamp-text: #b8b09e;
    --stamp-verified-bg: #1c1813; --stamp-verified-border: #e5463d; --stamp-verified-text: #e5463d;
    --sel-bg: #2a2620; --sel-ink: #f2c200;
  }
}
:root.dark {
  --bg: #121110; --surface: #1a1815; --surface-2: #201d19;
  --ink: #ece7db; --ink-2: #b8b2a4; --muted: #8a8275; --rule: #2a2620;
  --accent: #e5463d; --accent-ink: #14110d;
  --signal: #f2c200; --signal-ink: #111111; --success: #57b45e;
  --masthead: #0c0b0a; --masthead-ink: #f5f2ea;
  --stamp-bg: #1c1813; --stamp-border: #4a4234; --stamp-text: #b8b09e;
  --stamp-verified-bg: #1c1813; --stamp-verified-border: #e5463d; --stamp-verified-text: #e5463d;
  --sel-bg: #2a2620; --sel-ink: #f2c200;
}
:root.light { color-scheme: light; }
:root.dark { color-scheme: dark; }
```

- [ ] **Step 3: Convert hardcoded hex inside `@layer base`/`@layer components` to tokens**

In `globals.css`, change `::selection` to use the vars, and the `.asterism::before` color:

```css
  ::selection {
    background-color: var(--sel-bg);
    color: var(--sel-ink);
  }
```
and in `.asterism::before` replace `color: #e8e3d5;` with `color: var(--ink);`.

- [ ] **Step 4: Verify build + type check**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds. (No test asserts CSS; correctness is visual — verified in Task 2 once the toggle exists.)

- [ ] **Step 5: Commit**

```bash
git add web/tailwind.config.ts web/app/globals.css
git commit -m "feat(redesign): CSS-variable token system with light/dark themes"
```

---

### Task 2: Theme init script + ThemeToggle

Add no-flash init for persisted overrides and a header control to switch System/Light/Dark.

**Files:**
- Modify: `web/app/layout.tsx`
- Create: `web/components/ThemeToggle.tsx`
- Modify: `web/components/Header.tsx`

**Interfaces:**
- Consumes: the `.light`/`.dark` classes and tokens from Task 1.
- Produces: `<ThemeToggle />` (client component, no props). Persists `localStorage.theme` = `"light"|"dark"` or removes the key for system.

- [ ] **Step 1: Add the inline theme-init script to `layout.tsx` `<head>`**

Insert as the first child of `<head>` (before the `<link rel="preconnect">` lines):

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var e=document.documentElement;if(t==='dark'){e.classList.add('dark')}else if(t==='light'){e.classList.add('light')}}catch(e){}})();",
          }}
        />
```

- [ ] **Step 2: Create `components/ThemeToggle.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

function apply(mode: Mode) {
  const e = document.documentElement;
  e.classList.remove("light", "dark");
  if (mode === "light") e.classList.add("light");
  if (mode === "dark") e.classList.add("dark");
  try {
    if (mode === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", mode);
  } catch {}
}

const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "◐ System", light: "☀ Light", dark: "☾ Dark" };

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    let stored: Mode = "system";
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") stored = t;
    } catch {}
    setMode(stored);
  }, []);
  return (
    <button
      type="button"
      onClick={() => { const n = NEXT[mode]; setMode(n); apply(n); }}
      aria-label={`Theme: ${mode}. Click to change.`}
      className="font-mono text-[10.5px] tracking-label uppercase text-masthead-ink/80 border border-white/20 rounded-full px-3 py-1 hover:border-white/50 transition-colors"
    >
      {LABEL[mode]}
    </button>
  );
}
```

- [ ] **Step 3: Mount `ThemeToggle` in `Header.tsx`**

Import at top: `import { ThemeToggle } from "@/components/ThemeToggle";`
Place `<ThemeToggle />` in the header's right-hand area (next to existing nav links). If the header is a server component, that's fine — `ThemeToggle` is a client component and can be rendered by a server parent.

- [ ] **Step 4: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes.

- [ ] **Step 5: Manual verification (documented, no automated test possible without DOM deps)**

Run `npm run dev`, open the site. Confirm: (a) with OS in dark mode and no stored override, the page is dark; (b) clicking the toggle cycles System→Light→Dark and the page updates; (c) reload after choosing Dark on a light OS stays dark with no white flash. Note the result in the task report.

- [ ] **Step 6: Commit**

```bash
git add web/app/layout.tsx web/components/ThemeToggle.tsx web/components/Header.tsx
git commit -m "feat(redesign): follow-system theming with persistent toggle"
```

---

### Task 3: Fix verification-trail overflow + restyle

**Files:**
- Modify: `web/components/VerificationTrail.tsx`
- Test: `web/tests/verification-trail.test.ts` (create)

**Interfaces:**
- Consumes: tokens (`bg-surface`, `text-signal`, etc.) from Task 1.
- Produces: unchanged `VerificationTrail({ events, complete })` public API and `ToolCallEvent` interface.

Root cause: `VerificationTrail.tsx:52` puts `result_summary` in an `ml-auto` span inside `flex items-center gap-2` with no `min-w-0`/shrink/wrap, so long values overflow.

- [ ] **Step 1: Write a failing structural test**

`web/tests/verification-trail.test.ts`:

```ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/VerificationTrail.tsx", import.meta.url), "utf-8");

test("completed trail row constrains the result chip so it cannot overflow", () => {
  // the label/verb side must be able to shrink...
  expect(src).toMatch(/min-w-0/);
  // ...and the result summary must be a non-shrinking, wrapping chip
  expect(src).toMatch(/shrink-0[^"]*break-words|break-words[^"]*shrink-0/);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- verification-trail`
Expected: FAIL (current file has neither `min-w-0` nor `break-words`).

- [ ] **Step 3: Rewrite the rows in `VerificationTrail.tsx`**

Replace the collapsed-summary block (lines ~24–33) and the row map (lines ~35–59) with token-based, overflow-safe markup:

```tsx
  if (complete && !expanded && events.length > 0) {
    const totalRefs = events.filter(e => e.status === "complete").length;
    return (
      <div className="max-w-[780px] mx-auto bg-surface border border-rule rounded-lg px-4 py-2.5 flex items-center gap-2 my-5">
        <span className="text-success font-mono text-[13px] shrink-0">✓</span>
        <span className="font-sans text-[12.5px] text-ink-2 min-w-0">Verified. {totalRefs} {totalRefs === 1 ? "source" : "sources"} cross-referenced.</span>
        <button onClick={() => setExpanded(true)} className="ml-auto shrink-0 font-mono text-[10.5px] tracking-label text-accent uppercase cursor-pointer">SHOW TRAIL ↓</button>
      </div>
    );
  }

  return (
    <div className="max-w-[780px] mx-auto my-5">
      <div className="label mb-2.5">Verification trail</div>
      <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto font-sans text-[12.5px] text-muted">
        {events.map((e, i) => {
          const verb = HUMAN_LABEL[e.tool] ?? e.tool;
          const args = Object.entries(e.args).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
          if (e.status === "running") {
            return (
              <div key={i} className="flex items-start gap-2">
                <span className="text-accent font-mono shrink-0">↳</span>
                <span className="min-w-0 flex-1 truncate">{verb} {args && <span className="text-muted font-mono text-[10.5px]">{args}</span>}</span>
              </div>
            );
          }
          if (e.status === "error") {
            return (
              <div key={i} className="flex items-start gap-2">
                <span className="text-accent font-mono shrink-0">!</span>
                <span className="min-w-0 flex-1">{verb} {e.message ?? "error"}</span>
              </div>
            );
          }
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="text-accent font-mono shrink-0">↳</span>
              <span className="min-w-0 flex-1 truncate">{verb}</span>
              {e.result_summary && (
                <span className="shrink-0 max-w-[42%] break-words text-right font-mono text-[10.5px] bg-signal text-signal-ink rounded-full px-2 py-[2px]">{e.result_summary}</span>
              )}
            </div>
          );
        })}
        {complete && (
          <div className="flex items-start gap-2"><span className="text-success font-mono shrink-0">✓</span><span className="text-success min-w-0">Verified. Drafting answer.</span></div>
        )}
      </div>
      {complete && expanded && events.length > 0 && (
        <button onClick={() => setExpanded(false)} className="mt-2 font-mono text-[10.5px] tracking-label text-accent uppercase cursor-pointer">HIDE TRAIL ↑</button>
      )}
    </div>
  );
```

- [ ] **Step 4: Run the test + type check**

Run: `npm test -- verification-trail && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/VerificationTrail.tsx web/tests/verification-trail.test.ts
git commit -m "fix(redesign): verification-trail result chip can no longer overflow"
```

---

### Task 4: Fix flaky ask submit (Turnstile timeout + busy reset)

**Files:**
- Modify: `web/lib/turnstile-client.ts`
- Modify: `web/components/CommandBar.tsx`
- Test: `web/tests/turnstile-client.test.ts` (create)

**Interfaces:**
- Produces: `getTurnstileToken(siteKey: string | undefined, opts?: { timeoutMs?: number; win?: TurnstileWindow }): Promise<string>` — resolves `""` on timeout/error, `"dev"` when no siteKey. `win` is injectable for tests (defaults to the real `window`).
- Consumes: (CommandBar) `getTurnstileToken`, `ensureTurnstileScript`.

Root cause: `turnstile-client.ts` polls for `window.turnstile` forever with no timeout; `CommandBar.handleSubmit` awaits with no `try/finally`, so a hung promise leaves `busy` stuck `true`.

- [ ] **Step 1: Write the failing test**

`web/tests/turnstile-client.test.ts`:

```ts
import { test, expect, vi } from "vitest";
import { getTurnstileToken } from "@/lib/turnstile-client";

test("returns 'dev' immediately when no site key", async () => {
  await expect(getTurnstileToken(undefined)).resolves.toBe("dev");
});

test("resolves to '' after timeout when turnstile never loads", async () => {
  vi.useFakeTimers();
  const fakeWin = { turnstile: undefined } as unknown as Window & { turnstile?: unknown };
  const p = getTurnstileToken("sitekey", { timeoutMs: 1000, win: fakeWin });
  await vi.advanceTimersByTimeAsync(1200);
  await expect(p).resolves.toBe("");
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- turnstile-client`
Expected: FAIL (current signature has no `opts`, no timeout; would hang).

- [ ] **Step 3: Rewrite `turnstile-client.ts`**

```ts
type TurnstileWindow = {
  turnstile?: {
    render: (el: HTMLElement, options: { sitekey: string; size?: "compact" | "flexible" | "normal"; appearance?: "always" | "execute" | "interaction-only"; callback: (t: string) => void; "error-callback"?: () => void }) => void;
  };
};

declare global {
  interface Window extends TurnstileWindow {}
}

let scriptLoading = false;

export function ensureTurnstileScript(): void {
  if (typeof window === "undefined") return;
  if (window.turnstile || scriptLoading) return;
  scriptLoading = true;
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  s.async = true;
  document.head.appendChild(s);
}

export function getTurnstileToken(
  siteKey: string | undefined,
  opts: { timeoutMs?: number; win?: TurnstileWindow } = {},
): Promise<string> {
  if (!siteKey) return Promise.resolve("dev");
  const timeoutMs = opts.timeoutMs ?? 8000;
  const win = opts.win ?? (typeof window !== "undefined" ? (window as TurnstileWindow) : undefined);
  return new Promise(resolve => {
    let settled = false;
    const done = (t: string) => { if (!settled) { settled = true; clearTimeout(timer); resolve(t); } };
    const timer = setTimeout(() => done(""), timeoutMs);
    let attempts = 0;
    const maxAttempts = Math.ceil(timeoutMs / 200);
    const tryRender = () => {
      if (settled) return;
      if (!win || !win.turnstile) {
        if (attempts++ >= maxAttempts) { done(""); return; }
        setTimeout(tryRender, 200);
        return;
      }
      const ctr = document.createElement("div");
      ctr.style.display = "none";
      document.body.appendChild(ctr);
      win.turnstile.render(ctr, {
        sitekey: siteKey,
        size: "flexible",
        appearance: "interaction-only",
        callback: (token: string) => done(token),
        "error-callback": () => done(""),
      });
    };
    tryRender();
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- turnstile-client`
Expected: PASS (both tests).

- [ ] **Step 5: Harden `CommandBar.handleSubmit` and restyle the ask box as a pill**

Replace `handleSubmit` (lines 12–20) with:

```tsx
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const token = await getTurnstileToken(siteKey);
      onSubmit(q, token);
    } finally {
      setBusy(false);
    }
  }
```

Replace the `return (...)` markup with the pill styling (behavior identical):

```tsx
  return (
    <form onSubmit={handleSubmit} className="max-w-[640px] mx-auto px-8">
      <div className="bg-surface border border-rule rounded-full pl-5 pr-1.5 py-1.5 flex items-center shadow-[0_6px_18px_rgba(0,0,0,0.12)] focus-within:border-accent transition-colors">
        <span className="text-accent mr-3 text-base shrink-0">⌕</span>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          className="flex-1 min-w-0 outline-none bg-transparent text-[14px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="ml-2 shrink-0 font-mono text-[10.5px] tracking-label uppercase bg-accent text-accent-ink rounded-full px-4 py-2 disabled:opacity-50"
        >
          {busy ? "…" : "Ask ▸"}
        </button>
      </div>
    </form>
  );
```

- [ ] **Step 6: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes. (CommandBar's busy-reset is guaranteed by `finally`; no DOM test possible without new deps — note manual check: submitting when Turnstile is blocked re-enables the button after ~8s rather than locking it.)

- [ ] **Step 7: Commit**

```bash
git add web/lib/turnstile-client.ts web/components/CommandBar.tsx web/tests/turnstile-client.test.ts
git commit -m "fix(redesign): Turnstile token timeout + guaranteed busy reset (flaky submit)"
```

---

### Task 5: Toronto motif components

**Files:**
- Create: `web/components/TorontoSkyline.tsx`
- Create: `web/components/RocketMark.tsx`

**Interfaces:**
- Produces: `<TorontoSkyline className?: string />` and `<RocketMark className?: string />` — inline SVG using `currentColor` (so `text-*` classes color them).

- [ ] **Step 1: Create `TorontoSkyline.tsx`**

```tsx
export function TorontoSkyline({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 214 46" fill="currentColor" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <rect x="0" y="30" width="20" height="16" /><rect x="22" y="22" width="14" height="24" />
      <rect x="40" y="34" width="18" height="12" /><rect x="150" y="26" width="16" height="20" />
      <rect x="170" y="32" width="24" height="14" /><rect x="200" y="20" width="14" height="26" />
      <rect x="100" y="4" width="4" height="42" /><ellipse cx="102" cy="16" rx="9" ry="4" /><rect x="99" y="0" width="6" height="8" />
      <path d="M62 46 Q64 20 74 20 Q72 46 72 46 Z" /><path d="M80 46 Q82 20 92 20 Q90 46 90 46 Z" />
    </svg>
  );
}
```

- [ ] **Step 2: Create `RocketMark.tsx`**

```tsx
export function RocketMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="var(--accent)" />
      <rect x="12" y="11" width="16" height="18" rx="3" fill="var(--accent-ink)" />
      <rect x="14" y="14" width="12" height="6" fill="var(--accent)" />
    </svg>
  );
}
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add web/components/TorontoSkyline.tsx web/components/RocketMark.tsx
git commit -m "feat(redesign): Toronto skyline + rocket mark SVG components"
```

---

### Task 6: Featured types + evidence resolver

**Files:**
- Create: `web/lib/featured-types.ts`
- Create: `web/lib/featured.ts`
- Test: `web/tests/featured.test.ts` (create)

**Interfaces:**
- Produces (`featured-types.ts`): `EvidenceRef`, `ContradictionEntry`, `DivergenceEntry`, `FeaturedEntry`, `TOPICS`, `TOPIC_LABELS`.
- Produces (`featured.ts`): `resolveEvidence(records: RecordEntry[], shortcode: string): EvidenceRef | null`.
- Consumes: `RecordEntry` from `@/lib/agent/data-loader`.

- [ ] **Step 1: Create `lib/featured-types.ts`**

```ts
export interface EvidenceRef {
  shortcode: string;
  quote: string;   // verbatim source_quote
  date: string;    // record post_date (ISO) or ""
  source: string;  // e.g. "Council 2024.GG12.7" or source account
}

export interface ContradictionEntry {
  kind: "contradiction";
  slug: string;
  display_name: string;
  topic: string;
  topic_label: string;
  earlier: EvidenceRef;
  later: EvidenceRef;
  consistency: "evolving" | "shifted";
  score: number;
}

export type Vote = "YES" | "NO" | "ABSENT";

export interface DivergenceSide extends EvidenceRef {
  slug: string;
  display_name: string;
  vote?: Vote;
}

export interface DivergenceEntry {
  kind: "divergence";
  topic: string;
  topic_label: string;
  a: DivergenceSide;
  b: DivergenceSide;
  score: number;
}

export type FeaturedEntry = ContradictionEntry | DivergenceEntry;

export const TOPICS = [
  "housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment",
  "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services",
] as const;

export const TOPIC_LABELS: Record<string, string> = {
  housing: "housing",
  transit: "transit",
  safety_crime: "public safety",
  taxes_fiscal: "taxes",
  parks_environment: "parks & environment",
  infrastructure: "infrastructure",
  civic_engagement: "civic engagement",
  governance_ethics: "governance & ethics",
  small_business_economy: "small business",
  social_services: "social services",
};
```

- [ ] **Step 2: Write the failing resolver test**

`web/tests/featured.test.ts`:

```ts
import { test, expect } from "vitest";
import { resolveEvidence } from "@/lib/featured";
import type { RecordEntry } from "@/lib/agent/data-loader";

const records: RecordEntry[] = [
  { shortcode: "AAA", kind: "position", topic: "transit", source_quote: "Build the Ontario Line.", post_date: "2024-03-01", source_account: "bradfordgrams" },
  { shortcode: "BBB", kind: "action", topic: "transit", summary: "voted", post_date: "2024-05-01", council_verification: { agenda_item: "2024.GG12.7", vote_disposition: "YES" } },
  { shortcode: "CCC", kind: "position", topic: "transit", post_date: "2024-04-01" }, // no source_quote
];

test("resolveEvidence returns a verbatim quote with source", () => {
  expect(resolveEvidence(records, "AAA")).toEqual({ shortcode: "AAA", quote: "Build the Ontario Line.", date: "2024-03-01", source: "bradfordgrams" });
});

test("resolveEvidence prefers council agenda item as the source label", () => {
  const r = resolveEvidence([{ ...records[1], source_quote: "Yes." }], "BBB");
  expect(r?.source).toBe("Council 2024.GG12.7");
});

test("resolveEvidence returns null when the record is missing or has no source_quote", () => {
  expect(resolveEvidence(records, "CCC")).toBeNull();
  expect(resolveEvidence(records, "ZZZ")).toBeNull();
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- featured`
Expected: FAIL (`resolveEvidence` not defined).

- [ ] **Step 4: Create `lib/featured.ts` with the resolver**

```ts
import { listCandidates, getSynthesis, getRecordsForHandle, type RecordEntry, type SynthesisCell, type CandidateLanding } from "@/lib/agent/data-loader";
import { TOPICS, TOPIC_LABELS, type EvidenceRef, type ContradictionEntry, type DivergenceEntry, type FeaturedEntry, type Vote } from "@/lib/featured-types";

export function resolveEvidence(records: RecordEntry[], shortcode: string): EvidenceRef | null {
  const r = records.find(x => x.shortcode === shortcode);
  if (!r || !r.source_quote) return null;
  const source = r.council_verification?.agenda_item
    ? `Council ${r.council_verification.agenda_item}`
    : (r.source_account ?? "IG");
  return { shortcode, quote: r.source_quote, date: r.post_date ?? "", source };
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- featured`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add web/lib/featured-types.ts web/lib/featured.ts web/tests/featured.test.ts
git commit -m "feat(featured): types + evidence resolver"
```

---

### Task 7: Featured detection (divergence + contradiction) + queue

**Files:**
- Modify: `web/lib/featured.ts`
- Modify: `web/tests/featured.test.ts`

**Interfaces:**
- Consumes: `resolveEvidence`, types from Task 6; `SynthesisCell`, `RecordEntry`, `CandidateLanding`.
- Produces:
  - `deriveDivergences(cells: SynthesisCell[], recordsBySlug: Map<string, RecordEntry[]>, candidates: CandidateLanding[]): DivergenceEntry[]`
  - `deriveContradictions(cells: SynthesisCell[], recordsBySlug: Map<string, RecordEntry[]>, candidates: CandidateLanding[]): ContradictionEntry[]`
  - `getFeaturedComparisons(limit?: number): FeaturedEntry[]`

- [ ] **Step 1: Add failing tests for the detectors**

Append to `web/tests/featured.test.ts`:

```ts
import { deriveDivergences, deriveContradictions } from "@/lib/featured";
import type { SynthesisCell, CandidateLanding } from "@/lib/agent/data-loader";

const cands: CandidateLanding[] = [
  { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
  { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
];

test("deriveDivergences pairs two candidates on a shared topic using verbatim quotes", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "transit", summary: null, consistency: null, input_record_count: 40, key_positions: [{ stance: "rail", supporting_records: ["B1"] }] },
    { candidate_handle: "c", candidate_slug: "chow", topic: "transit", summary: null, consistency: null, input_record_count: 20, key_positions: [{ stance: "fares", supporting_records: ["C1"] }] },
  ];
  const recs = new Map([
    ["bradford", [{ shortcode: "B1", kind: "position", topic: "transit", source_quote: "Build the Ontario Line.", post_date: "2024-01-01", council_verification: { agenda_item: "GG12.7", vote_disposition: "YES" } }]],
    ["chow", [{ shortcode: "C1", kind: "position", topic: "transit", source_quote: "Freeze fares.", post_date: "2024-02-01", council_verification: { agenda_item: "GG12.7", vote_disposition: "NO" } }]],
  ]);
  const out = deriveDivergences(cells, recs, cands);
  expect(out).toHaveLength(1);
  expect(out[0].topic).toBe("transit");
  expect(out[0].a.quote).toBe("Build the Ontario Line.");
  expect(out[0].b.quote).toBe("Freeze fares.");
  // opposing votes on the same agenda item boost the score above the base
  expect(out[0].score).toBeGreaterThan(500);
});

test("deriveDivergences drops a topic where a side has no resolvable evidence", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "housing", summary: null, consistency: null, key_positions: [{ stance: "x", supporting_records: ["MISSING"] }] },
    { candidate_handle: "c", candidate_slug: "chow", topic: "housing", summary: null, consistency: null, key_positions: [{ stance: "y", supporting_records: ["C9"] }] },
  ];
  const recs = new Map([["chow", [{ shortcode: "C9", kind: "position", source_quote: "q", post_date: "" }]]]);
  expect(deriveDivergences(cells, recs, cands)).toHaveLength(0);
});

test("deriveContradictions emits nothing when consistency is not evolving/shifted", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "transit", summary: null, consistency: { label: "consistent", changes: [] }, key_positions: [] },
  ];
  expect(deriveContradictions(cells, new Map(), cands)).toHaveLength(0);
});

test("deriveContradictions emits an entry for an evolving cell with two resolvable change anchors", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "taxes_fiscal", summary: null,
      consistency: { label: "evolving", changes: [{ date: "2025-01-01", from: { stance: "against", records: ["E1"] }, to: { stance: "for", records: ["E2"] } }] },
      key_positions: [] },
  ];
  const recs = new Map([["bradford", [
    { shortcode: "E1", kind: "quote", source_quote: "No new taxes.", post_date: "2022-03-01", source_account: "cp24" },
    { shortcode: "E2", kind: "quote", source_quote: "Tax is on the table.", post_date: "2025-11-01", source_account: "now" },
  ]]]);
  const out = deriveContradictions(cells, recs, cands);
  expect(out).toHaveLength(1);
  expect(out[0].display_name).toBe("Brad Bradford");
  expect(out[0].earlier.quote).toBe("No new taxes.");
  expect(out[0].later.quote).toBe("Tax is on the table.");
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -- featured`
Expected: FAIL (`deriveDivergences`/`deriveContradictions` not defined).

- [ ] **Step 3: Implement the detectors + queue in `lib/featured.ts`**

Append below `resolveEvidence`:

```ts
interface RawChange {
  date?: string;
  from?: { stance?: string; records?: string[] };
  to?: { stance?: string; records?: string[] };
}
function isChange(x: unknown): x is RawChange {
  return typeof x === "object" && x !== null;
}

function firstResolvable(records: RecordEntry[], shortcodes: string[] | undefined): EvidenceRef | null {
  for (const sc of shortcodes ?? []) {
    const ev = resolveEvidence(records, sc);
    if (ev) return ev;
  }
  return null;
}

function toVote(d: string | undefined): Vote | undefined {
  return d === "YES" || d === "NO" || d === "ABSENT" ? d : undefined;
}

export function deriveDivergences(
  cells: SynthesisCell[],
  recordsBySlug: Map<string, RecordEntry[]>,
  candidates: CandidateLanding[],
): DivergenceEntry[] {
  const nameBySlug = new Map(candidates.map(c => [c.slug, c.display_name]));
  const byTopic = new Map<string, SynthesisCell[]>();
  for (const cell of cells) {
    if (!cell.key_positions?.length) continue;
    const list = byTopic.get(cell.topic) ?? [];
    list.push(cell);
    byTopic.set(cell.topic, list);
  }
  const out: DivergenceEntry[] = [];
  for (const [topic, group] of byTopic) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => (b.input_record_count ?? 0) - (a.input_record_count ?? 0));
    const sides: DivergenceEntry["a"][] = [];
    for (const cell of ranked) {
      const records = recordsBySlug.get(cell.candidate_slug) ?? [];
      let ev: EvidenceRef | null = null;
      for (const kp of cell.key_positions ?? []) {
        ev = firstResolvable(records, kp.supporting_records);
        if (ev) break;
      }
      if (!ev) continue;
      const rec = records.find(r => r.shortcode === ev!.shortcode);
      sides.push({
        slug: cell.candidate_slug,
        display_name: nameBySlug.get(cell.candidate_slug) ?? cell.candidate_slug,
        ...ev,
        vote: toVote(rec?.council_verification?.vote_disposition),
      });
      if (sides.length === 2) break;
    }
    if (sides.length < 2) continue;
    const [a, b] = sides;
    const opposing = !!a.vote && !!b.vote && a.vote !== b.vote && a.vote !== "ABSENT" && b.vote !== "ABSENT";
    const score = 100 + (opposing ? 500 : 0) + ((ranked[0].input_record_count ?? 0) + (ranked[1].input_record_count ?? 0));
    out.push({ kind: "divergence", topic, topic_label: TOPIC_LABELS[topic] ?? topic, a, b, score });
  }
  return out;
}

export function deriveContradictions(
  cells: SynthesisCell[],
  recordsBySlug: Map<string, RecordEntry[]>,
  candidates: CandidateLanding[],
): ContradictionEntry[] {
  const nameBySlug = new Map(candidates.map(c => [c.slug, c.display_name]));
  const out: ContradictionEntry[] = [];
  for (const cell of cells) {
    const label = cell.consistency?.label;
    if (label !== "evolving" && label !== "shifted") continue;
    const records = recordsBySlug.get(cell.candidate_slug) ?? [];
    const changes = (cell.consistency?.changes ?? []) as unknown[];
    for (const ch of changes) {
      if (!isChange(ch)) continue;
      const earlier = firstResolvable(records, ch.from?.records);
      const later = firstResolvable(records, ch.to?.records);
      if (!earlier || !later) continue;
      out.push({
        kind: "contradiction",
        slug: cell.candidate_slug,
        display_name: nameBySlug.get(cell.candidate_slug) ?? cell.candidate_slug,
        topic: cell.topic,
        topic_label: TOPIC_LABELS[cell.topic] ?? cell.topic,
        earlier,
        later,
        consistency: label,
        score: 300,
      });
      break; // at most one contradiction per cell
    }
  }
  return out;
}

export function getFeaturedComparisons(limit = 6): FeaturedEntry[] {
  const candidates = listCandidates();
  const cells: SynthesisCell[] = [];
  const recordsBySlug = new Map<string, RecordEntry[]>();
  for (const c of candidates) {
    recordsBySlug.set(c.slug, getRecordsForHandle(c.slug));
    for (const topic of TOPICS) {
      const cell = getSynthesis(c.slug, topic);
      if (cell) cells.push(cell);
    }
  }
  const entries: FeaturedEntry[] = [
    ...deriveContradictions(cells, recordsBySlug, candidates),
    ...deriveDivergences(cells, recordsBySlug, candidates),
  ];
  return entries.sort((a, b) => b.score - a.score).slice(0, limit);
}
```

- [ ] **Step 4: Run the tests + type check**

Run: `npm test -- featured && npx tsc --noEmit`
Expected: all featured tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/featured.ts web/tests/featured.test.ts
git commit -m "feat(featured): divergence + contradiction detection and ranked queue"
```

---

### Task 8: FeaturedComparison component

**Files:**
- Create: `web/components/FeaturedComparison.tsx`

**Interfaces:**
- Consumes: `FeaturedEntry` from `@/lib/featured-types`.
- Produces: `<FeaturedComparison entries={FeaturedEntry[]} />` (client). Renders nothing when `entries` is empty.

- [ ] **Step 1: Create `components/FeaturedComparison.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { FeaturedEntry, ContradictionEntry, DivergenceEntry } from "@/lib/featured-types";

function Side({ name, quote, source, meta, accent }: { name: string; quote: string; source: string; meta?: string; accent: "a" | "b" }) {
  return (
    <div className={`flex-1 rounded-xl p-4 bg-surface-2 border-l-4 ${accent === "a" ? "border-accent" : "border-success"}`}>
      <div className="font-sans font-bold text-[13px] text-ink flex items-center gap-2">{name}{meta && <span className="font-mono text-[9px] text-muted">{meta}</span>}</div>
      <p className="font-serif italic text-[13px] leading-snug text-ink-2 mt-2">“{quote}”</p>
      <div className="font-mono text-[9px] text-muted mt-2">{source}</div>
    </div>
  );
}

function Slide({ entry }: { entry: FeaturedEntry }) {
  if (entry.kind === "contradiction") {
    const e = entry as ContradictionEntry;
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[9px] font-bold tracking-label uppercase text-signal">Contradiction</span>
        </div>
        <h3 className="font-sans font-extrabold text-[20px] tracking-tight text-ink mb-3">{e.display_name} on {e.topic_label}</h3>
        <div className="flex gap-3 items-stretch">
          <Side name={e.earlier.date?.slice(0, 4) || "Earlier"} quote={e.earlier.quote} source={e.earlier.source} accent="a" />
          <div className="flex items-center font-mono text-[11px] font-bold text-muted">vs</div>
          <Side name={e.later.date?.slice(0, 4) || "Later"} quote={e.later.quote} source={e.later.source} accent="b" />
        </div>
        <div className="text-center font-mono text-[10px] font-bold text-accent mt-3">▸ position {e.consistency}</div>
      </div>
    );
  }
  const e = entry as DivergenceEntry;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[9px] font-bold tracking-label uppercase text-signal">Where they split</span>
      </div>
      <h3 className="font-sans font-extrabold text-[20px] tracking-tight text-ink mb-3">Split on {e.topic_label}</h3>
      <div className="flex gap-3 items-stretch">
        <Side name={e.a.display_name} quote={e.a.quote} source={e.a.source} meta={e.a.vote} accent="a" />
        <div className="flex items-center font-mono text-[11px] font-bold text-muted">vs</div>
        <Side name={e.b.display_name} quote={e.b.quote} source={e.b.source} meta={e.b.vote} accent="b" />
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
    <section className="max-w-[780px] mx-auto my-8" onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}>
      <div className="bg-surface border border-rule rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <div className="bg-masthead text-masthead-ink px-4 py-2.5 font-mono text-[9px] font-bold tracking-label uppercase">Featured · On the record</div>
        <div className="p-4">
          <Slide entry={entry} />
        </div>
        {entries.length > 1 && (
          <div className="flex gap-1.5 justify-center pb-4">
            {entries.map((_, n) => (
              <button key={n} onClick={() => setI(n)} aria-label={`Show featured item ${n + 1}`}
                className={`h-[7px] rounded-full transition-all ${n === i ? "w-5 bg-accent" : "w-[7px] bg-rule"}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add web/components/FeaturedComparison.tsx
git commit -m "feat(featured): rotating FeaturedComparison component"
```

---

### Task 9: Front-page homepage composition

Wire the hero, Featured module, and restyled surfaced cards into the landing.

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/components/LandingShell.tsx`
- Read for reference: `web/components/SurfacedCards.tsx`

**Interfaces:**
- Consumes: `getFeaturedComparisons` (Task 7), `FeaturedComparison` (Task 8), `TorontoSkyline`/`RocketMark` (Task 5).
- Produces: the composed landing page.

- [ ] **Step 1: Read `LandingShell.tsx` and `SurfacedCards.tsx`**

Understand the current masthead/ask-box markup and what `surfacedSlot` renders. Preserve the ask-box wiring (it uses `CommandBar` and the SSE ask flow).

- [ ] **Step 2: Make `page.tsx` a server component that derives featured entries**

```tsx
import { SurfacedCards } from "@/components/SurfacedCards";
import { LandingShell } from "@/components/LandingShell";
import { FeaturedComparison } from "@/components/FeaturedComparison";
import { getFeaturedComparisons } from "@/lib/featured";

export default function Home() {
  const featured = getFeaturedComparisons();
  return (
    <LandingShell
      featuredSlot={<FeaturedComparison entries={featured} />}
      surfacedSlot={<SurfacedCards />}
    />
  );
}
```

- [ ] **Step 3: Update `LandingShell` to accept `featuredSlot` and apply the dark masthead + skyline**

Add `featuredSlot?: React.ReactNode` to the props type. In the masthead/hero area:
- Wrap the masthead band in `bg-masthead text-masthead-ink` with `relative overflow-hidden`.
- Add `<RocketMark className="w-6 h-6" />` beside the wordmark and `<TorontoSkyline className="absolute inset-x-0 bottom-0 h-10 text-white/15" />` at the bottom of the hero.
- Render `{featuredSlot}` between the hero and `{surfacedSlot}`.
Keep the existing `CommandBar` usage exactly as-is (only wrapper/skin classes change). Import `RocketMark` and `TorontoSkyline`.

- [ ] **Step 4: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes.

- [ ] **Step 5: Manual verification**

`npm run dev`: homepage shows dark hero with skyline + rocket mark, the pill ask box, the Featured module rotating (if entries exist; hidden if none), then surfaced cards. Note result in report.

- [ ] **Step 6: Commit**

```bash
git add web/app/page.tsx web/components/LandingShell.tsx
git commit -m "feat(redesign): front-page homepage with hero, skyline, and featured module"
```

---

### Task 10: Answer-card restyle + ComparisonCard overflow guard

**Files:**
- Modify: `web/components/ComparisonCard.tsx`
- Modify: `web/components/SingleAnswerCard.tsx`
- Modify: `web/components/RecordTrailCard.tsx`
- Modify: `web/components/Stamp.tsx`
- Modify: `web/components/FollowUpChips.tsx`

**Interfaces:**
- Consumes: tokens from Task 1. No public prop changes.

- [ ] **Step 1: Read the five components**

Note every hardcoded hex (e.g. `#1c1813`, `#8a8275`, `#c4923a`) and the flex row at `ComparisonCard.tsx:24`.

- [ ] **Step 2: Replace hardcoded hex with token classes**

Mechanical mapping (apply consistently across all five files):
- `bg-[#15110d]` / `#15110d` → `bg-bg`
- `bg-[#1c1813]` → `bg-surface`
- `text-[#e8e3d5]`/`text-ink` → `text-ink`
- `text-[#8a8275]` / `text-muted` → `text-muted`
- `text-[#c4923a]` / accent → `text-accent`
- `border-[#2a2520]` / `border-rule` → `border-rule`
- `text-[#3a8a3a]` (green) → `text-success`
- rounded corners on cards → `rounded-xl`; add `shadow-[0_8px_24px_rgba(0,0,0,0.10)]` to top-level card containers.

- [ ] **Step 3: Fix the `ComparisonCard.tsx:24` flex row overflow**

Wherever a value sits opposite a label in a `flex items-center` row, give the label side `min-w-0 flex-1 truncate` and the value side `shrink-0` (mirroring Task 3). Consistency dot colors follow the mapping in Global Constraints.

- [ ] **Step 4: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: passes.

- [ ] **Step 5: Guard test — no legacy hex left in answer cards**

Append to `web/tests/verification-trail.test.ts` (reuses the static-source pattern), or create `web/tests/no-legacy-hex.test.ts`:

```ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const files = [
  "../components/ComparisonCard.tsx",
  "../components/SingleAnswerCard.tsx",
  "../components/RecordTrailCard.tsx",
  "../components/Stamp.tsx",
  "../components/FollowUpChips.tsx",
  "../components/VerificationTrail.tsx",
];
const LEGACY = ["#15110d", "#1c1813", "#e8e3d5", "#8a8275", "#c4923a", "#2a2520", "#3a8a3a"];

test("answer-view components use tokens, not legacy dark hex", () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf-8");
    for (const hex of LEGACY) expect(src, `${f} contains ${hex}`).not.toContain(hex);
  }
});
```

- [ ] **Step 6: Run tests**

Run: `npm test -- verification-trail no-legacy-hex`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/components/ComparisonCard.tsx web/components/SingleAnswerCard.tsx web/components/RecordTrailCard.tsx web/components/Stamp.tsx web/components/FollowUpChips.tsx web/tests/no-legacy-hex.test.ts
git commit -m "feat(redesign): restyle answer cards to tokens + fix comparison overflow"
```

---

### Task 11: Remaining surfaces restyle (candidate / scenario / receipt / static / chrome)

**Files (modify — restyle to tokens):**
- `web/components/Chips.tsx`, `web/components/Footer.tsx`, `web/components/StaticPage.tsx`, `web/components/Dateline.tsx`, `web/components/DropCap.tsx`, `web/components/SurfacedCards.tsx`
- `web/components/CandidateStatStrip.tsx`, `web/components/ConsistencyTimeline.tsx`, `web/components/MorePositions.tsx`, `web/components/SaidVsDone.tsx`, `web/components/SaidVsDoneItemCard.tsx`, `web/components/Sparkline.tsx`
- `web/components/ScenarioCard.tsx`, `web/components/ScenarioCardTile.tsx`, `web/components/ScenarioComparableTabs.tsx`, `web/components/ScenarioTierBadge.tsx`
- `web/components/ReceiptCard.tsx`, `web/components/ReceiptCardTile.tsx`, `web/components/ReceiptClaimBlock.tsx`, `web/components/ReceiptExhibit.tsx`, `web/components/ReceiptStream.tsx`
- `web/app/candidates/page.tsx`, `web/app/candidates/[slug]/page.tsx`, `web/app/scenarios/page.tsx`, `web/app/scenarios/[slug]/page.tsx`, `web/app/receipts/page.tsx`, `web/app/receipts/[slug]/page.tsx`, `web/app/about/page.tsx`, `web/app/methodology/page.tsx`, `web/app/privacy/page.tsx`, `web/app/terms/page.tsx`

**Interfaces:** consumes tokens from Task 1; no prop changes.

- [ ] **Step 1: Find every remaining legacy hex**

Run: `grep -rnE "#(15110d|1c1813|e8e3d5|8a8275|c4923a|2a2520|3a8a3a|4a4234|b8b09e)" web/components web/app`
This lists every occurrence to convert.

- [ ] **Step 2: Apply the Task-10 mapping across the listed files**

Same hex→token mapping as Task 10 Step 2. Apply the `min-w-0 flex-1 truncate` / `shrink-0` discipline to any label-vs-value flex row. Keep all structure and props unchanged; this is a skin pass.

- [ ] **Step 3: Verify no legacy hex remains anywhere**

Run: `grep -rnE "#(15110d|1c1813|e8e3d5|8a8275|c4923a|2a2520|3a8a3a|4a4234|b8b09e)" web/components web/app; echo "exit: $?"`
Expected: no matches (grep exit 1). Any remaining hit must be intentional and commented; otherwise convert it.

- [ ] **Step 4: Type check + build + full test suite**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 5: Manual verification in both themes**

`npm run dev`: click through home, a candidate page, a scenario, a receipt, and a static page in both light and dark. Confirm contrast reads well and nothing renders with the old dark-on-dark. Note results in the report.

- [ ] **Step 6: Commit**

```bash
git add web/components web/app
git commit -m "feat(redesign): restyle candidate/scenario/receipt/static surfaces to tokens"
```

---

## Self-Review

**Spec coverage:**
- §2 visual system / tokens → Tasks 1, 5, 10, 11.
- §3 theming (follow-system, no-flash, toggle) → Tasks 1, 2.
- §4 front-page homepage → Task 9.
- §5 answer view + trail + cards → Tasks 3, 10.
- §6 Featured engine (types, derivation, guardrail, component) → Tasks 6, 7, 8, 9.
- §7.1 trail overflow → Task 3. §7.2 flaky submit → Task 4.
- §8 scope (all surfaces) → Tasks 9, 10, 11.
- §9 testing → featured (6,7), turnstile timeout (4), trail structure (3), legacy-hex guard (10,11), existing suites (11 Step 4).
- No gaps.

**Placeholder scan:** No TBD/TODO; every code step has complete code; restyle tasks give an explicit hex→token mapping + grep verification rather than vague "restyle."

**Type consistency:** `EvidenceRef`/`ContradictionEntry`/`DivergenceEntry`/`DivergenceSide`/`FeaturedEntry`/`TOPICS`/`TOPIC_LABELS` defined in Task 6 and consumed unchanged in Tasks 7–9. `getFeaturedComparisons`, `deriveDivergences`, `deriveContradictions`, `resolveEvidence` signatures match across tasks. `getTurnstileToken(siteKey, opts?)` defined in Task 4 and used by CommandBar. `ThemeToggle` (no props), `FeaturedComparison({entries})`, `TorontoSkyline/RocketMark({className})` consistent between definition and use.

**Known limitation (documented, not a gap):** contradiction detection yields nothing on current data (`changes: []`, no `shifted` labels); divergence carries the module today. This is intended and forward-compatible — noted in spec §6/§10.
