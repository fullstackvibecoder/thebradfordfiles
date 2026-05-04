# Sprint 9. Redesign and Chat Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild mayoralrecord.com from vanilla HTML/CSS/JS into a Next.js 15 App Router app with a chat-first command bar, a streaming agent endpoint backed by Claude Sonnet 4.6, three structured receipt-card types (single answer, comparison, record trail), a Documentary type system with editorial drop caps, and a clean migration of static pages. Deliver Sprint 9 spec at `docs/superpowers/specs/2026-05-04-sprint-9-redesign.md`.

**Architecture:** New `web/` directory at the repo root with Next.js 15 + Tailwind + TypeScript. Existing `site/` archives to `legacy-site/` after the cutover. The build pipeline (`scripts/build_site.py`) is updated to write JSON dossiers to `web/public/data/` so the front end reads them as static data. New `/api/ask` SSE endpoint runs an agent loop with 6 read-only tools that hit those JSON files. Schema validation on the agent's output. Cloudflare Turnstile gates the endpoint. The synthesis SYSTEM_PROMPT gains a no-em-dash rule and all 18 cells regenerate.

**Tech Stack:** Next.js 15 (App Router), TypeScript 5, Tailwind CSS 3, Inter + Source Serif Pro fonts, Anthropic SDK, Vitest for tool tests, Vercel Functions on Fluid Compute (Node 24), Cloudflare Web Analytics beacon, Cloudflare Turnstile, Upstash Redis (rate-limit only). No new external services beyond what is already in use.

---

## Pre-flight

### Task 0: Verify baseline

**Files:** read-only.

- [ ] **Step 1:** Confirm Sprint 8A is fully shipped and on origin/main.

```bash
cd /Users/aramammo/thebradfordfiles
git log --oneline | head -5
git status --short
.venv/bin/python -m pytest tests/ -v 2>&1 | tail -3
```

Expected: 42 tests passing, working tree clean except for in-flight pipeline output files under `data/`.

- [ ] **Step 2:** Confirm production is live with the Sprint 8A bundle.

```bash
/usr/bin/curl -sL https://www.mayoralrecord.com/ -o /tmp/check.html
grep -c "The Mayoral Record" /tmp/check.html
/usr/bin/curl -sL -o /dev/null -w "%{http_code}\n" "https://www.mayoralrecord.com/api/og?type=landing"
```

Expected: brand string present; OG endpoint returns 200.

- [ ] **Step 3:** Confirm env vars in `.env`.

```bash
for k in ANTHROPIC_API_KEY DEEPGRAM_API_KEY TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY CLOUDFLARE_BEACON_TOKEN; do
  echo "$k present: $(grep -c "^$k=" .env)"
done
```

Expected: all five present.

---

## Phase A. Next.js scaffold and design system (Tasks 1 to 4)

## Task 1: Next.js 15 scaffold

**Files:**
- Create: `web/package.json`
- Create: `web/next.config.mjs`
- Create: `web/tsconfig.json`
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.mjs`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/app/globals.css`
- Create: `web/.gitignore`
- Modify: `.gitignore` (add `web/node_modules`, `web/.next`, `web/.vercel`)

- [ ] **Step 1:** Create the directory and scaffold.

```bash
cd /Users/aramammo/thebradfordfiles
mkdir -p web/app
cd web
cat > package.json <<'EOF'
{
  "name": "mayoralrecord-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "15.0.3",
    "react": "19.0.0-rc-65a56d0e-20241020",
    "react-dom": "19.0.0-rc-65a56d0e-20241020",
    "@anthropic-ai/sdk": "^0.30.1",
    "@upstash/redis": "^1.37.0"
  },
  "devDependencies": {
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "^5.6.3",
    "tailwindcss": "^3.4.14",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "vitest": "^2.1.4"
  }
}
EOF
npm install
```

Expected: install completes; `node_modules/` populates.

- [ ] **Step 2:** Write Next config.

`web/next.config.mjs`:

```javascript
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/bradford", destination: "/candidates/bradford", permanent: true },
      { source: "/chow", destination: "/candidates/chow", permanent: true },
      { source: "/compare", destination: "/?q=Compare+candidates", permanent: false },
      { source: "/issues", destination: "/?q=Compare+candidates+on+issue+priorities", permanent: false },
    ];
  },
};
export default nextConfig;
```

- [ ] **Step 3:** Write tsconfig.

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4:** Write Tailwind config with the Documentary palette.

`web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#fbfbf9",
        ink: "#1c1c1c",
        muted: "#5a5a55",
        accent: "#a07223",
        "stamp-bg": "#f6f3ea",
        "stamp-border": "#d8cfbd",
        "stamp-text": "#5a4a2a",
        "stamp-verified-bg": "#fff8eb",
        "stamp-verified-border": "#b59238",
        "stamp-verified-text": "#7a5e2a",
        success: "#1a5b1a",
        rule: "#ececea",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif Pro"', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        "label": "0.14em",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 5:** Write PostCSS config.

`web/postcss.config.mjs`:

```javascript
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 6:** Write globals.css with the type-system rules.

`web/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-bg text-ink font-sans;
    font-feature-settings: "ss01", "cv11";
  }
  ::selection {
    background-color: #f6f3ea;
    color: #5a4a2a;
  }
}

@layer components {
  .label {
    @apply font-mono text-[9.5px] uppercase tracking-label text-accent;
  }
  .stamp {
    @apply inline-flex items-center gap-1 bg-stamp-bg border border-stamp-border text-stamp-text font-mono text-[10.5px] tracking-wider px-2 py-[3px] rounded-sm;
  }
  .stamp-verified {
    @apply bg-stamp-verified-bg border-stamp-verified-border text-stamp-verified-text;
  }
  .chip {
    @apply inline-flex items-center bg-white border border-stamp-border text-ink font-medium text-[12.5px] px-3 py-[5px] rounded-full hover:border-accent transition-colors;
  }
  .drop-cap::first-letter {
    @apply font-serif font-bold float-left text-accent;
    font-size: 2.7em;
    line-height: 0.85;
    margin: 0.06em 0.1em -0.05em 0;
  }
}
```

- [ ] **Step 7:** Write the simplest layout and page (placeholders, refined in Task 2).

`web/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Mayoral Record",
  description: "Toronto's 2026 mayoral race, sourced and queryable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

`web/app/page.tsx`:

```typescript
export default function Home() {
  return <main className="min-h-screen flex items-center justify-center"><p className="label">Scaffold up. Layout coming in Task 2.</p></main>;
}
```

- [ ] **Step 8:** Write Next .gitignore.

`web/.gitignore`:

```
node_modules
.next
.vercel
.env*.local
next-env.d.ts
```

- [ ] **Step 9:** Update root .gitignore so the existing repo gitignore covers Next artifacts in case the user reorganizes.

Append to `/Users/aramammo/thebradfordfiles/.gitignore`:

```
web/node_modules/
web/.next/
web/.vercel/
web/next-env.d.ts
```

- [ ] **Step 10:** Verify it builds.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run build 2>&1 | tail -10
```

Expected: build succeeds, output mentions `app/page` and `app/layout`.

- [ ] **Step 11:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/package.json web/package-lock.json web/next.config.mjs web/tsconfig.json web/tailwind.config.ts web/postcss.config.mjs web/app/layout.tsx web/app/page.tsx web/app/globals.css web/.gitignore .gitignore
git commit -m "scaffold: Next.js 15 + Tailwind + Documentary type system"
```

## Task 2: Root layout with header, footer, and beacon

**Files:**
- Modify: `web/app/layout.tsx`
- Create: `web/components/Header.tsx`
- Create: `web/components/Footer.tsx`

- [ ] **Step 1:** Write Header.

`web/components/Header.tsx`:

```typescript
export function Header() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center justify-between px-8 pt-5 font-mono text-[10px] uppercase tracking-label text-accent">
      <span>The Mayoral Record</span>
      <span className="text-muted">RECORD . {today}</span>
    </div>
  );
}
```

- [ ] **Step 2:** Write Footer.

`web/components/Footer.tsx`:

```typescript
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 px-8 py-6 border-t border-rule text-center font-sans text-[11px] text-muted">
      <span>Independent civic-transparency project. No campaign affiliation.</span>
      <span className="mx-3 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/methodology">Methodology</Link>
      <span className="mx-2 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/privacy">Privacy</Link>
      <span className="mx-2 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/terms">Terms</Link>
      <span className="mx-2 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/candidates">All candidates</Link>
    </footer>
  );
}
```

- [ ] **Step 3:** Wire layout to use Header and Footer, plus the Cloudflare beacon.

`web/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const CF_TOKEN = process.env.CLOUDFLARE_BEACON_TOKEN ?? "";

export const metadata: Metadata = {
  title: "The Mayoral Record",
  description: "Toronto's 2026 mayoral race, sourced and queryable.",
  metadataBase: new URL("https://www.mayoralrecord.com"),
  openGraph: {
    siteName: "The Mayoral Record",
    type: "website",
    images: [{ url: "/api/og?type=landing", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+Pro:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {CF_TOKEN ? (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: CF_TOKEN })}
          />
        ) : null}
      </body>
    </html>
  );
}
```

- [ ] **Step 4:** Verify it builds.

```bash
cd /Users/aramammo/thebradfordfiles/web
CLOUDFLARE_BEACON_TOKEN=test npm run build 2>&1 | tail -8
```

Expected: build succeeds.

- [ ] **Step 5:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/layout.tsx web/components/Header.tsx web/components/Footer.tsx
git commit -m "feat: root layout with header, footer, and beacon"
```

## Task 3: Reusable Stamp and DropCap components

**Files:**
- Create: `web/components/Stamp.tsx`
- Create: `web/components/DropCap.tsx`
- Create: `web/lib/stamp-types.ts`

- [ ] **Step 1:** Write the stamp type.

`web/lib/stamp-types.ts`:

```typescript
export type StampFlavor = "neutral" | "verified";

export interface Stamp {
  label: string;
  href?: string;
  flavor?: StampFlavor;
  icon?: "council" | "ig" | "video" | "verified";
}
```

- [ ] **Step 2:** Write the Stamp component.

`web/components/Stamp.tsx`:

```typescript
import type { Stamp } from "@/lib/stamp-types";

const ICON_GLYPH: Record<NonNullable<Stamp["icon"]>, string> = {
  council: "▣",
  ig: "▣",
  video: "▶",
  verified: "★",
};

export function StampPill({ stamp }: { stamp: Stamp }) {
  const flavor = stamp.flavor ?? "neutral";
  const cls = flavor === "verified" ? "stamp stamp-verified" : "stamp";
  const glyph = stamp.icon ? ICON_GLYPH[stamp.icon] + " " : "";
  const content = <span>{glyph}{stamp.label}</span>;
  if (stamp.href) {
    return <a href={stamp.href} target="_blank" rel="noopener noreferrer" className={cls + " no-underline"}>{content}</a>;
  }
  return <span className={cls}>{content}</span>;
}
```

- [ ] **Step 3:** Write the DropCap component.

`web/components/DropCap.tsx`:

```typescript
export function DropCap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={"font-serif text-[13.5px] leading-[1.65] text-ink drop-cap " + className}>{children}</p>;
}
```

- [ ] **Step 4:** Smoke check by adding a temp render to page.tsx.

`web/app/page.tsx`:

```typescript
import { StampPill } from "@/components/Stamp";
import { DropCap } from "@/components/DropCap";

export default function Home() {
  return (
    <main className="px-8 py-12 max-w-3xl mx-auto space-y-6">
      <DropCap>Bradford has consistently positioned housing as Toronto's central affordability challenge, advocating for ending exclusionary zoning and supporting the missing-middle.</DropCap>
      <div className="flex flex-wrap gap-1.5">
        <StampPill stamp={{ label: "COUNCIL . 2024.GG12.7", flavor: "neutral", icon: "council" }} />
        <StampPill stamp={{ label: "IG . 2024-09-26", flavor: "neutral", icon: "ig" }} />
        <StampPill stamp={{ label: "verified", flavor: "verified", icon: "verified" }} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5:** Run dev and visually confirm.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev
```

Open `http://localhost:3000` in a browser. Confirm:
- Header strip with `THE MAYORAL RECORD` and `RECORD . 2026-05-04`.
- A drop-cap paragraph in Source Serif with an ochre `B`.
- Three stamps below: two beige, one ochre with a star.
- Footer with `Methodology . Privacy . Terms . All candidates` links.

Kill the dev server.

- [ ] **Step 6:** Commit.

```bash
git add web/components/Stamp.tsx web/components/DropCap.tsx web/lib/stamp-types.ts web/app/page.tsx
git commit -m "feat: Stamp and DropCap components"
```

## Task 4: Static page migration (privacy, terms, methodology, about)

**Files:**
- Create: `web/app/privacy/page.tsx`
- Create: `web/app/terms/page.tsx`
- Create: `web/app/methodology/page.tsx`
- Create: `web/app/about/page.tsx`
- Create: `web/components/StaticPage.tsx`

- [ ] **Step 1:** Write a shared `StaticPage` wrapper for consistent prose styling.

`web/components/StaticPage.tsx`:

```typescript
import Link from "next/link";

export function StaticPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="max-w-[760px] mx-auto px-8 py-10 font-sans text-ink leading-[1.65]">
      <Link href="/" className="text-accent text-[13px] no-underline hover:underline">{"←"} Back</Link>
      <h1 className="font-serif font-bold text-[28px] leading-[1.2] text-ink mt-6 mb-2">{title}</h1>
      <div className="space-y-4 [&_h2]:font-serif [&_h2]:font-bold [&_h2]:text-[18px] [&_h2]:leading-[1.3] [&_h2]:text-ink [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:pl-[22px] [&_ul]:space-y-1 [&_p]:mb-3 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-[3px]">
        {children}
      </div>
    </article>
  );
}
```

- [ ] **Step 2:** Port the privacy page. Read the existing copy at `/Users/aramammo/thebradfordfiles/site/privacy/index.html` and copy it into the new page, removing any em dashes.

`web/app/privacy/page.tsx`:

```typescript
import { StaticPage } from "@/components/StaticPage";

export const metadata = { title: "Privacy . The Mayoral Record" };

export default function Privacy() {
  return (
    <StaticPage title="Privacy">
      <p>The Mayoral Record is an independent civic-transparency project. We collect as little data as possible.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Anonymous browser fingerprint hash.</strong> When you submit a reader vote, the site generates a random 32-character identifier in your browser's local storage, hashes it with SHA-256, and uses the hash to prevent the same browser from voting twice on the same record. The original fingerprint never leaves your device. The hash is one-way and is not linked to any other data about you.</li>
        <li><strong>Aggregate page-view counts</strong> via Cloudflare Web Analytics. This is cookieless and does not track you across sites.</li>
        <li><strong>Cloudflare Turnstile challenge tokens</strong> when you submit a vote or a chat query. Turnstile is a no-CAPTCHA bot-detection challenge.</li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li>No accounts. You do not sign up.</li>
        <li>No email address. No phone. No name.</li>
        <li>No IP-address logging beyond what Cloudflare and Vercel keep for security and abuse prevention.</li>
        <li>No third-party advertising trackers. No retargeting. No cross-site tracking.</li>
      </ul>

      <h2>Third parties</h2>
      <ul>
        <li><strong>Cloudflare</strong> (analytics, Turnstile bot detection): subject to <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare's privacy policy</a>.</li>
        <li><strong>Upstash</strong> (Redis storage): subject to <a href="https://upstash.com/trust/privacy" target="_blank" rel="noopener noreferrer">Upstash's privacy policy</a>.</li>
        <li><strong>Vercel</strong> (hosting): subject to <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel's privacy policy</a>.</li>
        <li><strong>Pol.is</strong> (deliberation embed): subject to <a href="https://pol.is/privacy" target="_blank" rel="noopener noreferrer">Pol.is's privacy policy</a>. We do not control Pol.is's data practices.</li>
        <li><strong>Anthropic</strong> (Claude API for content extraction, synthesis, and chat answers): we send public Instagram content and reader queries to Anthropic for processing. No reader-identifying data is included.</li>
      </ul>

      <h2>Data retention</h2>
      <ul>
        <li>Aggregate vote counters in Redis are retained indefinitely.</li>
        <li>Per-fingerprint dedup keys auto-expire after 365 days.</li>
        <li>Reader query logs (used to surface anonymized recent-questions) are retained for 30 days. Queries are not linked to fingerprint hashes or IP addresses.</li>
        <li>Server logs (Vercel, Cloudflare) retain per their providers' policies; we do not retain copies.</li>
      </ul>

      <h2>Contact</h2>
      <p>Questions about privacy? <a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">Open a GitHub issue</a> or email <a href="mailto:hello@bottlenecklabs.ai">hello@bottlenecklabs.ai</a>.</p>

      <p className="mt-6 bg-stamp-bg border-l-[3px] border-stamp-border p-3 text-[13px]">This is a plain-English disclosure. It is not legal advice. If you have a specific privacy concern, please contact us. Last updated: 2026-05-04.</p>
    </StaticPage>
  );
}
```

- [ ] **Step 3:** Port the terms page. Same pattern. Read existing copy, remove em dashes.

`web/app/terms/page.tsx`:

```typescript
import { StaticPage } from "@/components/StaticPage";

export const metadata = { title: "Terms of Use . The Mayoral Record" };

export default function Terms() {
  return (
    <StaticPage title="Terms of Use">
      <h2>What this site is</h2>
      <p>The Mayoral Record is an independent civic-transparency project documenting Toronto's 2026 mayoral race. It is not affiliated with any candidate, campaign, or political party. There is no financial relationship between this project and any candidate.</p>

      <h2>What the content is</h2>
      <ul>
        <li>Records are extracted from public Instagram posts using a documented pipeline. The cited Instagram post (linked from each record) is the primary source. If a record contradicts its cited source, the source wins.</li>
        <li>Council voting records are sourced from the City of Toronto's public voting record. Verified badges indicate cross-references between extracted action records and council votes.</li>
        <li>Synthesis paragraphs and chat answers are generated by an LLM (Claude Opus 4.7 for synthesis, Claude Sonnet 4.6 for chat) using publicly disclosed system prompts. The cited shortcodes within each answer are authoritative.</li>
      </ul>

      <h2>Reader-submitted content</h2>
      <ul>
        <li>Reader queries to the chat are anonymous and aggregate-only.</li>
        <li>Chat answers are generated at request time. They are subject to the limits of language models and may contain errors.</li>
        <li>We may rate-limit or block traffic that appears coordinated or abusive.</li>
        <li>Pol.is deliberations are hosted by Pol.is. Statement moderation is governed by Pol.is's terms.</li>
      </ul>

      <h2>No warranty, no advice</h2>
      <ul>
        <li>The site is provided as-is. No warranty of accuracy, completeness, or fitness for any particular purpose.</li>
        <li>Nothing here is voting advice. It is a sourced record. Make your own decisions.</li>
        <li>Information may be wrong. If you spot an error, please <a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">open a GitHub issue</a>.</li>
      </ul>

      <h2>Equal-billing rules</h2>
      <p>Candidates are listed alphabetically by surname. No candidate is given visual prominence over any other.</p>

      <h2>Open source</h2>
      <p>The code, the methodology, and the system prompts are open source under the MIT license at <a href="https://github.com/fullstackvibecoder/thebradfordfiles">GitHub</a>.</p>

      <p className="mt-6 bg-stamp-bg border-l-[3px] border-stamp-border p-3 text-[13px]">This is a plain-English statement. It is not legal advice. Last updated: 2026-05-04.</p>
    </StaticPage>
  );
}
```

- [ ] **Step 4:** Port the methodology page. The current page has the verbatim synthesis SYSTEM_PROMPT. After Phase E in this sprint, that prompt changes (no em dashes added). For now, write the methodology with the CURRENT prompt; we will update it in Task 24.

`web/app/methodology/page.tsx`:

```typescript
import { StaticPage } from "@/components/StaticPage";

export const metadata = { title: "Methodology . The Mayoral Record" };

export default function Methodology() {
  return (
    <StaticPage title="Methodology">
      <p>This page summarises the extraction methodology. Full version in <a href="https://github.com/fullstackvibecoder/thebradfordfiles/blob/main/METHODOLOGY.md">METHODOLOGY.md</a>.</p>

      <h2>Pipeline</h2>
      <ol className="pl-[22px] list-decimal space-y-1">
        <li><strong>Triage.</strong> Claude Haiku 4.5 reads each post's caption and assigns a bucket (substantive, contextual, or skip) with a stated reason.</li>
        <li><strong>Extraction.</strong> Claude Opus 4.7 reads substantive posts (with audio transcripts via Deepgram) and emits structured records (positions, pledges, actions, endorsements, appearances, quotes).</li>
        <li><strong>Verification.</strong> Action records are cross-referenced against the City of Toronto's public council voting record.</li>
        <li><strong>Synthesis.</strong> Claude Opus 4.7 produces a per-candidate per-topic synthesis paragraph from the extracted records, bound to a tool-use schema that requires every claim be cited.</li>
        <li><strong>Chat.</strong> Claude Sonnet 4.6 answers reader queries by calling read-only tools that return records, council votes, and synthesis cells. Every answer is stamped to its sources.</li>
      </ol>

      <h2>Equal-billing rules</h2>
      <ul>
        <li>Candidates listed alphabetically by surname.</li>
        <li>Identical fields shown for every candidate.</li>
        <li>No ranking, no editorial weighting.</li>
      </ul>

      <h2>Synthesis system prompt</h2>
      <p>The system prompt that generates synthesis paragraphs is reproduced in full so anyone can audit how syntheses are derived. See <a href="https://github.com/fullstackvibecoder/thebradfordfiles/blob/main/scripts/lib/synthesis.py">scripts/lib/synthesis.py</a> for the live prompt.</p>

      <h2>Chat agent system prompt</h2>
      <p>The chat agent's system prompt is reproduced in full at <a href="https://github.com/fullstackvibecoder/thebradfordfiles/blob/main/web/lib/agent/system-prompt.ts">web/lib/agent/system-prompt.ts</a>.</p>

      <h2>Corrections</h2>
      <p><a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">Open an issue on GitHub</a> if you spot an error.</p>
    </StaticPage>
  );
}
```

- [ ] **Step 5:** Port the about page.

`web/app/about/page.tsx`:

```typescript
import { StaticPage } from "@/components/StaticPage";

export const metadata = { title: "About . The Mayoral Record" };

export default function About() {
  return (
    <StaticPage title="About">
      <p>The Mayoral Record is an independent civic-transparency project documenting Toronto's 2026 mayoral race. Not affiliated with any candidate, campaign, or political party. No financial relationship with any candidate.</p>
      <p>Every record on this site is sourced to a specific public Instagram post or council vote. Click any source link to verify against the original.</p>
      <p>Built by <a href="https://bottlenecklabs.ai">BottleneckLabs</a>. Open source at <a href="https://github.com/fullstackvibecoder/thebradfordfiles">GitHub</a> under the MIT license.</p>
    </StaticPage>
  );
}
```

- [ ] **Step 6:** Verify each route returns 200 in dev.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
sleep 8
for path in / /privacy /terms /methodology /about; do
  echo "  $path: $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" http://localhost:3000$path)"
done
kill $DEV_PID 2>/dev/null
```

Expected: all five routes return 200.

- [ ] **Step 7:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/privacy/page.tsx web/app/terms/page.tsx web/app/methodology/page.tsx web/app/about/page.tsx web/components/StaticPage.tsx
git commit -m "feat: port static pages to Next.js with Documentary styling"
```

---

## Phase B. Data layer and agent backend (Tasks 5 to 11)

## Task 5: Data bridge from build_site.py to web/public/data/

**Files:**
- Modify: `scripts/build_site.py`

- [ ] **Step 1:** Read the current build_site.py to find where it writes site/ outputs.

```bash
grep -n "SITE_DIR\|landing.json\|candidates" /Users/aramammo/thebradfordfiles/scripts/build_site.py | head -10
```

- [ ] **Step 2:** Add a parallel write path so the same dossier files appear under `web/public/data/`.

Find the lines that write to `SITE_DIR / "landing.json"`, `SITE_DIR / "candidates"`, and the synthesis fold logic. Just before the existing writes, add a `WEB_DATA_DIR` constant near the top of the file (after `SITE_DIR`):

```python
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
```

After each existing site/ write, add a parallel write to web/public/data/. The pattern:

```python
# Existing:
(SITE_DIR / "landing.json").write_text(json.dumps(landing, ensure_ascii=False, indent=2))

# Add immediately after:
(WEB_DATA_DIR).mkdir(parents=True, exist_ok=True)
(WEB_DATA_DIR / "landing.json").write_text(json.dumps(landing, ensure_ascii=False, indent=2))
```

Do the same for:
- The per-candidate dossier (`SITE_DIR / "candidates" / f"{slug}.json"` becomes also `WEB_DATA_DIR / "candidates" / f"{slug}.json"`).
- The aggregate `data.json` (write to both).
- The sitemap.xml (write only to SITE_DIR for now; we will regenerate sitemap from web/ in Task 23).

For the synthesis cells, add a separate copy step at the end of `main()`:

```python
import shutil
synthesis_target = WEB_DATA_DIR / "synthesis"
synthesis_target.mkdir(parents=True, exist_ok=True)
for handle_dir in DATA_DIR.iterdir():
    if not handle_dir.is_dir(): continue
    src_synth = handle_dir / "synthesis"
    if not src_synth.is_dir(): continue
    dst_synth = synthesis_target / handle_dir.name
    dst_synth.mkdir(parents=True, exist_ok=True)
    for json_file in src_synth.glob("*.json"):
        shutil.copy(json_file, dst_synth / json_file.name)
print(f"  copied synthesis cells to web/public/data/synthesis/")
```

- [ ] **Step 3:** Run the build and verify.

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python scripts/build_site.py 2>&1 | tail -5
ls -la web/public/data/ web/public/data/candidates/ web/public/data/synthesis/ 2>&1 | head -30
```

Expected: web/public/data/ contains landing.json, data.json; candidates/ has bradford.json and chow.json; synthesis/ has bradfordgrams/ and oliviachow/ subdirs with topic .json files.

- [ ] **Step 4:** Update web/.gitignore so the bridged data is not committed (the canonical files live under data/ and site/candidates/; web/public/data/ is generated).

Append to `web/.gitignore`:

```
public/data/
```

- [ ] **Step 5:** Commit.

```bash
git add scripts/build_site.py web/.gitignore
git commit -m "feat: build_site mirrors dossiers to web/public/data/"
```

## Task 6: Card-type definitions and validators (TDD)

**Files:**
- Create: `web/lib/card-types.ts`
- Create: `web/tests/card-validation.test.ts`
- Create: `web/vitest.config.ts`

- [ ] **Step 1:** Write vitest config.

`web/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: false, include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
```

- [ ] **Step 2:** Write the card-type definitions and a runtime validator.

`web/lib/card-types.ts`:

```typescript
import type { Stamp } from "./stamp-types";

export interface SingleAnswerCard {
  type: "single_answer";
  query_restated: string;
  answer: string;
  evidence: Stamp[];
  context?: { body: string; citations: string[] };
  follow_ups: string[];
}

export interface ComparisonCandidate {
  slug: string;
  display_name: string;
  consistency_dot: "green" | "yellow" | "red" | "gray";
  consistency_label: string;
  record_count: number;
  summary: string;
  key_positions: { stance: string; citations: string[] }[];
  council_votes: { vote: "YES" | "NO" | "ABSENT"; agenda_item: string; title: string }[];
  evidence: Stamp[];
}

export interface ComparisonCard {
  type: "comparison";
  query_restated: string;
  candidates: ComparisonCandidate[];
  topic: string;
  divergences: { headline: string; body: string }[];
  follow_ups: string[];
}

export interface RecordTrailCard {
  type: "record_trail";
  query_restated: string;
  theme: string;
  entries: { date: string; label: string; body: string; evidence: Stamp[] }[];
  follow_ups: string[];
}

export type AnyCard = SingleAnswerCard | ComparisonCard | RecordTrailCard;

export function validateCard(payload: unknown): AnyCard | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.type !== "string") return null;
  if (typeof p.query_restated !== "string") return null;
  if (!Array.isArray(p.follow_ups) || p.follow_ups.some(x => typeof x !== "string")) return null;

  if (p.type === "single_answer") {
    if (typeof p.answer !== "string") return null;
    if (!Array.isArray(p.evidence)) return null;
    return p as unknown as SingleAnswerCard;
  }
  if (p.type === "comparison") {
    if (!Array.isArray(p.candidates) || p.candidates.length < 2) return null;
    if (typeof p.topic !== "string") return null;
    if (!Array.isArray(p.divergences)) return null;
    return p as unknown as ComparisonCard;
  }
  if (p.type === "record_trail") {
    if (typeof p.theme !== "string") return null;
    if (!Array.isArray(p.entries)) return null;
    return p as unknown as RecordTrailCard;
  }
  return null;
}

const EM_DASH = "—";

export function containsEmDash(card: AnyCard): boolean {
  const stringify = JSON.stringify(card);
  return stringify.includes(EM_DASH);
}
```

- [ ] **Step 3:** Write the failing tests.

`web/tests/card-validation.test.ts`:

```typescript
import { test, expect } from "vitest";
import { validateCard, containsEmDash } from "@/lib/card-types";

test("validateCard accepts a well-formed single_answer card", () => {
  const result = validateCard({
    type: "single_answer",
    query_restated: "How did Bradford vote?",
    answer: "Bradford voted YES.",
    evidence: [{ label: "COUNCIL . 2024.GG12.7" }],
    follow_ups: ["What about Chow?"],
  });
  expect(result?.type).toBe("single_answer");
});

test("validateCard rejects a missing type", () => {
  const result = validateCard({ query_restated: "x", answer: "y", evidence: [], follow_ups: [] });
  expect(result).toBeNull();
});

test("validateCard rejects a comparison card with fewer than 2 candidates", () => {
  const result = validateCard({
    type: "comparison",
    query_restated: "Compare X and Y",
    candidates: [],
    topic: "housing",
    divergences: [],
    follow_ups: [],
  });
  expect(result).toBeNull();
});

test("validateCard accepts a record_trail card", () => {
  const result = validateCard({
    type: "record_trail",
    query_restated: "How has X evolved?",
    theme: "Bradford on transit, 2018 to present",
    entries: [],
    follow_ups: [],
  });
  expect(result?.type).toBe("record_trail");
});

test("containsEmDash detects em dashes in answer text", () => {
  const card = {
    type: "single_answer" as const,
    query_restated: "x",
    answer: "Bradford supports A — not B.",
    evidence: [],
    follow_ups: [],
  };
  expect(containsEmDash(card)).toBe(true);
});

test("containsEmDash returns false for clean text", () => {
  const card = {
    type: "single_answer" as const,
    query_restated: "x",
    answer: "Bradford supports A. He does not support B.",
    evidence: [],
    follow_ups: [],
  };
  expect(containsEmDash(card)).toBe(false);
});
```

- [ ] **Step 4:** Run the tests.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm test 2>&1 | tail -10
```

Expected: 6 tests pass.

- [ ] **Step 5:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/card-types.ts web/tests/card-validation.test.ts web/vitest.config.ts
git commit -m "feat: card type definitions and validators (TDD)"
```

## Task 7: Data loader for the agent

**Files:**
- Create: `web/lib/agent/data-loader.ts`
- Create: `web/tests/data-loader.test.ts`

- [ ] **Step 1:** Write tests using a tmp data dir.

`web/tests/data-loader.test.ts`:

```typescript
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir, listCandidates, getSynthesis, getRecordsForHandle } from "@/lib/agent/data-loader";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-data-"));
  setDataDir(tmp);
});

test("listCandidates returns landing.json's candidate array", () => {
  writeFileSync(join(tmp, "landing.json"), JSON.stringify({
    candidates: [
      { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
      { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
    ],
  }));
  const cands = listCandidates();
  expect(cands).toHaveLength(2);
  expect(cands[0].slug).toBe("bradford");
});

test("getSynthesis loads a topic cell", () => {
  mkdirSync(join(tmp, "synthesis", "bradfordgrams"), { recursive: true });
  writeFileSync(join(tmp, "synthesis", "bradfordgrams", "transit.json"), JSON.stringify({
    candidate_handle: "bradfordgrams",
    candidate_slug: "bradford",
    topic: "transit",
    summary: "Bradford has...",
    consistency: { label: "evolving", changes: [] },
  }));
  const cell = getSynthesis("bradford", "transit");
  expect(cell?.summary).toContain("Bradford has");
});

test("getSynthesis returns null when handle has no synthesis", () => {
  expect(getSynthesis("nonexistent", "transit")).toBeNull();
});

test("getRecordsForHandle reads candidate dossier", () => {
  mkdirSync(join(tmp, "candidates"), { recursive: true });
  writeFileSync(join(tmp, "candidates", "bradford.json"), JSON.stringify({
    meta: { handle: "bradfordgrams", slug: "bradford" },
    records: [
      { shortcode: "A1", kind: "position", topic: "transit", summary: "supports TTC" },
      { shortcode: "B1", kind: "action", topic: "housing", summary: "voted yes" },
    ],
  }));
  const records = getRecordsForHandle("bradford");
  expect(records).toHaveLength(2);
});
```

- [ ] **Step 2:** Run; expect failures.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm test -- data-loader.test.ts 2>&1 | tail -10
```

Expected: import errors on `data-loader`.

- [ ] **Step 3:** Implement.

`web/lib/agent/data-loader.ts`:

```typescript
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

let DATA_DIR = join(process.cwd(), "public", "data");

export function setDataDir(path: string): void {
  DATA_DIR = path;
}

export interface CandidateLanding {
  slug: string;
  display_name: string;
  surname: string;
  files_label?: string;
  consistency_dot?: string;
  record_count?: number;
  current_role?: string;
  candidacy_status?: string;
  emphasis?: Record<string, number>;
}

export function listCandidates(): CandidateLanding[] {
  const path = join(DATA_DIR, "landing.json");
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export interface SynthesisCell {
  candidate_handle: string;
  candidate_slug: string;
  topic: string;
  summary: string | null;
  consistency: { label: string; stable_since?: string | null; changes?: unknown[] } | null;
  key_positions?: { stance: string; supporting_records: string[] }[];
  key_actions?: { action: string; supporting_records: string[] }[];
  input_record_count?: number;
  synthesis_skipped_reason?: string | null;
}

const HANDLE_FOR_SLUG: Record<string, string> = {
  bradford: "bradfordgrams",
  chow: "oliviachow",
};

export function getSynthesis(slug: string, topic: string): SynthesisCell | null {
  const handle = HANDLE_FOR_SLUG[slug] ?? slug;
  const path = join(DATA_DIR, "synthesis", handle, `${topic}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export interface RecordEntry {
  shortcode: string;
  kind: string;
  topic?: string;
  summary?: string;
  source_quote?: string;
  post_date?: string;
  post_url?: string;
  source_account?: string;
  council_verification?: { agenda_item?: string; vote_disposition?: string; result?: string; confidence?: number };
}

export function getRecordsForHandle(slug: string): RecordEntry[] {
  const path = join(DATA_DIR, "candidates", `${slug}.json`);
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf-8"));
  return Array.isArray(data.records) ? data.records : [];
}

export function getDossier(slug: string): unknown {
  const path = join(DATA_DIR, "candidates", `${slug}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function listSynthesisHandles(): string[] {
  const synthDir = join(DATA_DIR, "synthesis");
  if (!existsSync(synthDir)) return [];
  return readdirSync(synthDir);
}
```

- [ ] **Step 4:** Run tests.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm test 2>&1 | tail -10
```

Expected: all tests in card-validation and data-loader pass (10 total).

- [ ] **Step 5:** Commit.

```bash
git add web/lib/agent/data-loader.ts web/tests/data-loader.test.ts
git commit -m "feat: agent data-loader (TDD)"
```

## Task 8: Agent tools (TDD)

**Files:**
- Create: `web/lib/agent/tools.ts`
- Create: `web/tests/agent-tools.test.ts`

- [ ] **Step 1:** Write tests for the 6 tools.

`web/tests/agent-tools.test.ts`:

```typescript
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir } from "@/lib/agent/data-loader";
import * as tools from "@/lib/agent/tools";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-tools-"));
  setDataDir(tmp);
  writeFileSync(join(tmp, "landing.json"), JSON.stringify({
    candidates: [
      { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
      { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
    ],
  }));
  mkdirSync(join(tmp, "candidates"), { recursive: true });
  writeFileSync(join(tmp, "candidates", "bradford.json"), JSON.stringify({
    meta: { handle: "bradfordgrams", slug: "bradford" },
    records: [
      { shortcode: "A1", kind: "position", topic: "transit", summary: "supports TTC", post_date: "2024-01-01" },
      { shortcode: "A2", kind: "action", topic: "housing", summary: "voted yes on multiplex", post_date: "2024-06-01",
        council_verification: { agenda_item: "2024.PH7.4", vote_disposition: "Yes", confidence: 0.97 } },
      { shortcode: "A3", kind: "endorsement", topic: "civic_engagement", summary: "endorsed by X" },
    ],
  }));
});

test("list_candidates returns the manifest from landing.json", () => {
  const result = tools.list_candidates();
  expect(result.candidates).toHaveLength(2);
});

test("search_records filters by handle", () => {
  const result = tools.search_records({ slug: "bradford" });
  expect(result.records).toHaveLength(3);
});

test("search_records filters by topic", () => {
  const result = tools.search_records({ slug: "bradford", topic: "transit" });
  expect(result.records).toHaveLength(1);
  expect(result.records[0].shortcode).toBe("A1");
});

test("search_records filters by kind", () => {
  const result = tools.search_records({ slug: "bradford", kind: "action" });
  expect(result.records).toHaveLength(1);
});

test("search_records query matches summary text", () => {
  const result = tools.search_records({ slug: "bradford", query: "multiplex" });
  expect(result.records).toHaveLength(1);
});

test("lookup_council_vote by agenda item finds the matching record", () => {
  const result = tools.lookup_council_vote({ agenda_item: "2024.PH7.4" });
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].vote_disposition).toBe("Yes");
});

test("get_record_detail returns full record by shortcode", () => {
  const result = tools.get_record_detail({ shortcode: "A2" });
  expect(result.record?.kind).toBe("action");
});

test("get_record_detail returns null for unknown shortcode", () => {
  const result = tools.get_record_detail({ shortcode: "ZZZ" });
  expect(result.record).toBeNull();
});
```

- [ ] **Step 2:** Run; expect failures.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm test -- agent-tools 2>&1 | tail -10
```

Expected: import errors.

- [ ] **Step 3:** Implement.

`web/lib/agent/tools.ts`:

```typescript
import {
  listCandidates,
  getRecordsForHandle,
  getSynthesis,
  type CandidateLanding,
  type RecordEntry,
  type SynthesisCell,
} from "./data-loader";

export interface ListCandidatesResult {
  candidates: CandidateLanding[];
}

export function list_candidates(): ListCandidatesResult {
  return { candidates: listCandidates() };
}

export interface SearchRecordsArgs {
  slug?: string;
  topic?: string;
  query?: string;
  kind?: "position" | "pledge" | "action" | "endorsement" | "appearance" | "quote";
  limit?: number;
}

export interface SearchRecordsResult {
  records: RecordEntry[];
  total: number;
  truncated: boolean;
}

export function search_records(args: SearchRecordsArgs): SearchRecordsResult {
  const limit = args.limit ?? 25;
  const slugs = args.slug ? [args.slug] : listCandidates().map(c => c.slug);
  let matches: RecordEntry[] = [];
  for (const slug of slugs) {
    const records = getRecordsForHandle(slug);
    matches = matches.concat(records.filter(r => {
      if (args.topic && r.topic !== args.topic) return false;
      if (args.kind && r.kind !== args.kind) return false;
      if (args.query) {
        const haystack = `${r.summary ?? ""} ${r.source_quote ?? ""}`.toLowerCase();
        if (!haystack.includes(args.query.toLowerCase())) return false;
      }
      return true;
    }));
  }
  const total = matches.length;
  const truncated = total > limit;
  return { records: matches.slice(0, limit), total, truncated };
}

export interface LookupCouncilVoteArgs {
  agenda_item?: string;
  slug?: string;
}

export interface LookupCouncilVoteResult {
  matches: { shortcode: string; agenda_item?: string; vote_disposition?: string; result?: string; confidence?: number; topic?: string; post_date?: string; post_url?: string }[];
}

export function lookup_council_vote(args: LookupCouncilVoteArgs): LookupCouncilVoteResult {
  const slugs = args.slug ? [args.slug] : listCandidates().map(c => c.slug);
  const out: LookupCouncilVoteResult["matches"] = [];
  for (const slug of slugs) {
    const records = getRecordsForHandle(slug);
    for (const r of records) {
      const v = r.council_verification;
      if (!v) continue;
      if (args.agenda_item && v.agenda_item !== args.agenda_item) continue;
      out.push({
        shortcode: r.shortcode,
        agenda_item: v.agenda_item,
        vote_disposition: v.vote_disposition,
        result: v.result,
        confidence: v.confidence,
        topic: r.topic,
        post_date: r.post_date,
        post_url: r.post_url,
      });
    }
  }
  return { matches: out };
}

export interface GetSynthesisArgs {
  slug: string;
  topic: string;
}

export interface GetSynthesisResult {
  cell: SynthesisCell | null;
}

export function get_synthesis(args: GetSynthesisArgs): GetSynthesisResult {
  return { cell: getSynthesis(args.slug, args.topic) };
}

export interface GetRecordDetailArgs {
  shortcode: string;
}

export interface GetRecordDetailResult {
  record: RecordEntry | null;
}

export function get_record_detail(args: GetRecordDetailArgs): GetRecordDetailResult {
  for (const cand of listCandidates()) {
    const records = getRecordsForHandle(cand.slug);
    const found = records.find(r => r.shortcode === args.shortcode);
    if (found) return { record: found };
  }
  return { record: null };
}

export interface ListRecentQuestionsResult {
  questions: string[];
}

export function list_recent_questions(): ListRecentQuestionsResult {
  return { questions: [] };
}
```

- [ ] **Step 4:** Run tests.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm test 2>&1 | tail -10
```

Expected: all tests pass (card-validation 6 + data-loader 4 + agent-tools 8 = 18 tests).

- [ ] **Step 5:** Commit.

```bash
git add web/lib/agent/tools.ts web/tests/agent-tools.test.ts
git commit -m "feat: 6 agent tools (TDD)"
```

## Task 9: Agent system prompt and tool schemas

**Files:**
- Create: `web/lib/agent/system-prompt.ts`
- Create: `web/lib/agent/tool-schemas.ts`

- [ ] **Step 1:** Write the system prompt.

`web/lib/agent/system-prompt.ts`:

```typescript
export const AGENT_SYSTEM_PROMPT = `\
You are an agent for The Mayoral Record, an independent civic-transparency
project documenting Toronto's 2026 mayoral race. You answer reader questions
by querying a sourced database of records, council votes, and synthesis cells.

RULES:

1. Every claim must cite at least one source (a record shortcode or a council
   vote agenda item). Use the tools to fetch sources before answering.
2. Synthesize POSITIONS only. Never characterize a candidate's intent,
   motivation, sincerity, or political identity.
3. Never speculate about future actions, election outcomes, party affiliation,
   or "what would happen if." If asked, return a single_answer card whose
   answer states "This site documents what candidates have said and how they
   have voted. It does not predict outcomes." with relevant follow-up chips.
4. Never use em dashes (the U+2014 character). Use periods, colons, commas,
   or parentheses instead. En dashes for date ranges and hyphens are fine.
5. Pick exactly one card type for the response based on query intent:
   - single_answer: factual question about one candidate ("How did Bradford
     vote on X?", "What did Chow say about Y?")
   - comparison: compares two or more candidates ("Compare X and Y on Z",
     "Where do candidates differ on housing?")
   - record_trail: shows evolution over time ("How has X's position on Y
     evolved?", "Show me everything Z said about W in 2024")
6. Output is a single tool call (emit_card) with the structured payload. No
   prose outside the tool call.
7. Always include 3 to 4 follow-up chips at the foot of every response.
   Phrase them as natural questions a reader might ask next.
8. If you cannot produce a sourced answer (no relevant records, agent error,
   etc.), output a single_answer card with answer = "Could not produce a
   sourced answer for this question." plus a follow-up chip suggesting a
   different question.
9. Use the candidate's name (not pronouns) on first reference in the answer
   and in summary fields.
10. Keep answers concise. The "answer" field on a single_answer card is one
    sentence (or two short ones). Long explanation goes in the optional
    "context" field.

OUTPUT: emit a single tool call (emit_card) with the structured fields.
`;
```

- [ ] **Step 2:** Write the tool schemas.

`web/lib/agent/tool-schemas.ts`:

```typescript
import type { Tool } from "@anthropic-ai/sdk/resources/messages";

export const TOOL_SCHEMAS: Tool[] = [
  {
    name: "list_candidates",
    description: "List all primary candidates with their landing-card metadata. Use this to discover which candidates are documented before searching their records.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_records",
    description: "Search records (positions, pledges, actions, endorsements, appearances, quotes) across one or all candidates. Filter by topic, kind, or free-text query against summary and source quote.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Candidate slug, e.g., 'bradford'. Omit for all candidates." },
        topic: { type: "string", enum: ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services"] },
        query: { type: "string", description: "Free text matched against the record's summary and source quote." },
        kind: { type: "string", enum: ["position", "pledge", "action", "endorsement", "appearance", "quote"] },
        limit: { type: "number", description: "Max results to return. Default 25." },
      },
    },
  },
  {
    name: "lookup_council_vote",
    description: "Look up a candidate's verified council vote by agenda item number, or list all verified votes for a candidate. Returns the vote disposition (YES/NO/ABSENT), result, and the Instagram record that referenced it.",
    input_schema: {
      type: "object",
      properties: {
        agenda_item: { type: "string", description: "Toronto agenda item, e.g., '2024.GG12.7'." },
        slug: { type: "string", description: "Candidate slug. Omit for all." },
      },
    },
  },
  {
    name: "get_synthesis",
    description: "Get the synthesis cell for a (candidate, topic). Synthesis cells contain a 80 to 150 word summary, a consistency label (consistent/evolving/shifted), key positions, and key actions, all with cited shortcodes. Use this when the reader asks about a candidate's overall stance on a topic.",
    input_schema: {
      type: "object",
      required: ["slug", "topic"],
      properties: {
        slug: { type: "string" },
        topic: { type: "string", enum: ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services"] },
      },
    },
  },
  {
    name: "get_record_detail",
    description: "Get full detail for one record by its shortcode. Use this to verify or expand a specific cited record.",
    input_schema: {
      type: "object",
      required: ["shortcode"],
      properties: { shortcode: { type: "string" } },
    },
  },
  {
    name: "emit_card",
    description: "Emit the final structured card payload as the answer. This is the terminal tool call.",
    input_schema: {
      type: "object",
      required: ["type", "query_restated", "follow_ups"],
      properties: {
        type: { type: "string", enum: ["single_answer", "comparison", "record_trail"] },
        query_restated: { type: "string" },
        answer: { type: "string", description: "Required for single_answer." },
        evidence: { type: "array", items: { type: "object" } },
        context: { type: "object", properties: { body: { type: "string" }, citations: { type: "array", items: { type: "string" } } } },
        candidates: { type: "array", description: "Required for comparison.", items: { type: "object" } },
        topic: { type: "string", description: "Required for comparison." },
        divergences: { type: "array", items: { type: "object", properties: { headline: { type: "string" }, body: { type: "string" } } } },
        theme: { type: "string", description: "Required for record_trail." },
        entries: { type: "array", description: "Required for record_trail.", items: { type: "object" } },
        follow_ups: { type: "array", items: { type: "string" } },
      },
    },
  },
];

export const AGENT_MODEL = "claude-sonnet-4-6";
```

- [ ] **Step 3:** Verify they compile.

```bash
cd /Users/aramammo/thebradfordfiles/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4:** Commit.

```bash
git add web/lib/agent/system-prompt.ts web/lib/agent/tool-schemas.ts
git commit -m "feat: agent system prompt and tool schemas"
```

## Task 10: /api/ask streaming endpoint

**Files:**
- Create: `web/app/api/ask/route.ts`
- Create: `web/lib/agent/turnstile.ts`

- [ ] **Step 1:** Write the Turnstile verifier.

`web/lib/agent/turnstile.ts`:

```typescript
export async function verifyTurnstile(token: string | null, remoteIp: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!token) return false;
  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = await r.json() as { success: boolean };
    return Boolean(j.success);
  } catch {
    return false;
  }
}
```

- [ ] **Step 2:** Write the streaming endpoint.

`web/app/api/ask/route.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { AGENT_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { TOOL_SCHEMAS, AGENT_MODEL } from "@/lib/agent/tool-schemas";
import { verifyTurnstile } from "@/lib/agent/turnstile";
import * as tools from "@/lib/agent/tools";
import { validateCard, containsEmDash, type AnyCard } from "@/lib/card-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TOOL_LOOPS = 8;
const FALLBACK_CARD: AnyCard = {
  type: "single_answer",
  query_restated: "",
  answer: "Could not produce a sourced answer for this question.",
  evidence: [],
  follow_ups: ["Try rephrasing the question.", "Compare candidates on a topic."],
};

interface AskRequestBody {
  query?: string;
  turnstile_token?: string | null;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function callTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case "list_candidates": return tools.list_candidates();
    case "search_records": return tools.search_records(input);
    case "lookup_council_vote": return tools.lookup_council_vote(input);
    case "get_synthesis": return tools.get_synthesis(input as { slug: string; topic: string });
    case "get_record_detail": return tools.get_record_detail(input as { shortcode: string });
    default: throw new Error(`unknown tool ${name}`);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AskRequestBody;
  const query = (body.query ?? "").trim();
  if (!query || query.length > 500) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const ok = await verifyTurnstile(body.turnstile_token ?? null, ip);
  if (!ok) {
    return Response.json({ error: "turnstile_failed" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: "server_misconfigured" }, { status: 500 });
  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(new TextEncoder().encode(sse(event, data)));
      const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: query }];

      let finalCard: AnyCard | null = null;

      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
        const response = await client.messages.create({
          model: AGENT_MODEL,
          max_tokens: 2048,
          system: AGENT_SYSTEM_PROMPT,
          tools: TOOL_SCHEMAS,
          messages,
        });

        const toolUses = response.content.filter(b => b.type === "tool_use") as Anthropic.Messages.ToolUseBlock[];
        if (toolUses.length === 0) break;

        const toolResultsContent: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const use of toolUses) {
          if (use.name === "emit_card") {
            const card = validateCard(use.input);
            if (card && !containsEmDash(card)) {
              finalCard = card;
            } else {
              finalCard = { ...FALLBACK_CARD, query_restated: query };
            }
            toolResultsContent.push({ type: "tool_result", tool_use_id: use.id, content: "ok" });
          } else {
            send("tool_call", { tool: use.name, args: use.input, status: "running" });
            try {
              const result = callTool(use.name, use.input as Record<string, unknown>);
              send("tool_call", { tool: use.name, args: use.input, status: "complete", result_summary: summarizeResult(use.name, result) });
              toolResultsContent.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result) });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              send("tool_call", { tool: use.name, args: use.input, status: "error", message });
              toolResultsContent.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ error: message }), is_error: true });
            }
          }
        }

        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResultsContent });

        if (finalCard) break;
        if (response.stop_reason === "end_turn") break;
      }

      send("card", { payload: finalCard ?? { ...FALLBACK_CARD, query_restated: query } });
      send("done", {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

function summarizeResult(toolName: string, result: unknown): string {
  if (toolName === "search_records") {
    const r = result as { records: unknown[]; total: number };
    return `${r.total} hits${r.total !== r.records.length ? `, showing ${r.records.length}` : ""}`;
  }
  if (toolName === "lookup_council_vote") {
    const r = result as { matches: unknown[] };
    return `${r.matches.length} match${r.matches.length === 1 ? "" : "es"}`;
  }
  if (toolName === "list_candidates") {
    const r = result as { candidates: unknown[] };
    return `${r.candidates.length} candidates`;
  }
  if (toolName === "get_synthesis") {
    const r = result as { cell: { summary?: string | null } | null };
    return r.cell?.summary ? "synthesis loaded" : "no cell";
  }
  if (toolName === "get_record_detail") {
    const r = result as { record: unknown };
    return r.record ? "record loaded" : "not found";
  }
  return "ok";
}
```

- [ ] **Step 3:** Smoke test by running dev with the dev Turnstile bypass and checking the route exists.

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python scripts/build_site.py 2>&1 | tail -3   # ensure web/public/data populated
cd web
npm run dev > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
sleep 8
/usr/bin/curl -s -X POST http://localhost:3000/api/ask -H "Content-Type: application/json" -d '{"query":""}'
echo
/usr/bin/curl -s -X POST http://localhost:3000/api/ask -H "Content-Type: application/json" -d '{"query":"How many candidates are in the system?"}' --no-buffer | head -30
kill $DEV_PID 2>/dev/null
```

Expected: empty query returns `{"error":"invalid_query"}`. The real query streams several `event: tool_call` lines and then `event: card` and `event: done`.

If the streaming output looks malformed or the agent errors, capture the error and adjust. Common issues: ANTHROPIC_API_KEY not in dev env (set it via `.env.local`), Anthropic SDK version mismatch.

- [ ] **Step 4:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/api/ask/route.ts web/lib/agent/turnstile.ts
git commit -m "feat: /api/ask streaming endpoint with agent loop"
```

---

## Phase C. Frontend components (Tasks 11 to 18)

## Task 11: CommandBar client component

**Files:**
- Create: `web/components/CommandBar.tsx`
- Create: `web/lib/turnstile-client.ts`

- [ ] **Step 1:** Write the client-side Turnstile token getter.

`web/lib/turnstile-client.ts`:

```typescript
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; size: string; callback: (t: string) => void; "error-callback"?: () => void }) => void;
    };
  }
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

export async function getTurnstileToken(siteKey: string | undefined): Promise<string> {
  if (!siteKey) return "dev";
  return new Promise(resolve => {
    const tryRender = () => {
      if (!window.turnstile) {
        setTimeout(tryRender, 200);
        return;
      }
      const ctr = document.createElement("div");
      ctr.style.display = "none";
      document.body.appendChild(ctr);
      window.turnstile.render(ctr, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token: string) => resolve(token),
        "error-callback": () => resolve(""),
      });
    };
    tryRender();
  });
}
```

- [ ] **Step 2:** Write the CommandBar.

`web/components/CommandBar.tsx`:

```typescript
"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ensureTurnstileScript, getTurnstileToken } from "@/lib/turnstile-client";

export function CommandBar({ onSubmit, placeholder = "Ask about a candidate, a topic, or a vote." }: { onSubmit: (query: string, token: string) => void; placeholder?: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || undefined;

  useEffect(() => { ensureTurnstileScript(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setBusy(true);
    const token = await getTurnstileToken(siteKey);
    onSubmit(q, token);
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[640px] mx-auto px-8">
      <div className="bg-white border border-stamp-border rounded p-3 flex items-center shadow-[0_1px_0_rgba(0,0,0,0.02)] focus-within:border-accent transition-colors">
        <span className="text-accent mr-3 text-base">⌕</span>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          className="flex-1 outline-none bg-transparent text-[14px] placeholder:text-[#9a9a92]"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="ml-auto font-mono text-[9.5px] text-accent border border-stamp-border px-2 py-[2px] tracking-label uppercase disabled:opacity-50"
        >
          ↵ ask
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3:** Commit.

```bash
git add web/components/CommandBar.tsx web/lib/turnstile-client.ts
git commit -m "feat: CommandBar with Turnstile-gated submit"
```

## Task 12: Chips component

**Files:**
- Create: `web/components/Chips.tsx`
- Create: `web/lib/intent-chips.ts`

- [ ] **Step 1:** Write the chip definitions.

`web/lib/intent-chips.ts`:

```typescript
export interface IntentChip {
  label: string;
  query: string;
}

export const INTENT_CHIPS: IntentChip[] = [
  { label: "Housing record", query: "What are the candidates' positions and votes on housing?" },
  { label: "Transit record", query: "What are the candidates' positions and votes on transit?" },
  { label: "Public safety", query: "What are the candidates' positions on public safety?" },
  { label: "Tax & fiscal", query: "What are the candidates' positions and votes on taxes and fiscal policy?" },
  { label: "Parks & environment", query: "What are the candidates' positions on parks and environment?" },
  { label: "Infrastructure", query: "What are the candidates' positions on infrastructure?" },
  { label: "Social services", query: "What are the candidates' positions on social services?" },
  { label: "Small business", query: "What are the candidates' positions on small business and the economy?" },
  { label: "Civic engagement", query: "What are the candidates' positions on civic engagement?" },
  { label: "Governance & ethics", query: "What are the candidates' positions on governance and ethics?" },
];
```

- [ ] **Step 2:** Write the Chips component.

`web/components/Chips.tsx`:

```typescript
"use client";
import { INTENT_CHIPS } from "@/lib/intent-chips";

export function Chips({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="mx-auto max-w-[680px] px-8 mt-4 mb-10 flex flex-wrap gap-1.5 justify-center">
      {INTENT_CHIPS.map(c => (
        <button
          key={c.label}
          onClick={() => onPick(c.query)}
          className="chip"
          type="button"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Commit.

```bash
git add web/components/Chips.tsx web/lib/intent-chips.ts
git commit -m "feat: 10 intent chips"
```

## Task 13: SurfacedCards (server component)

**Files:**
- Create: `web/components/SurfacedCards.tsx`
- Create: `web/lib/surfaced.ts`

- [ ] **Step 1:** Write the surfacing logic.

`web/lib/surfaced.ts`:

```typescript
import { listCandidates, getSynthesis, getRecordsForHandle, type SynthesisCell } from "@/lib/agent/data-loader";

export interface SurfacedStanceEvolved {
  type: "stance_evolved";
  candidate_name: string;
  candidate_slug: string;
  topic: string;
  body: string;
  ig_count?: number;
  council_count?: number;
}

export interface SurfacedVerifiedVote {
  type: "verified_vote";
  candidate_name: string;
  candidate_slug: string;
  agenda_item: string;
  body: string;
  vote_disposition: string;
  result: string;
  post_date?: string;
}

export interface SurfacedSynthesis {
  type: "synthesis";
  candidate_name: string;
  candidate_slug: string;
  topic: string;
  body: string;
  record_count: number;
}

export type SurfacedCard = SurfacedStanceEvolved | SurfacedVerifiedVote | SurfacedSynthesis;

export function pickSurfacedCards(): SurfacedCard[] {
  const cards: SurfacedCard[] = [];
  const cands = listCandidates();
  const TOPICS = ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics", "small_business_economy", "social_services"];

  for (const cand of cands) {
    for (const topic of TOPICS) {
      const cell = getSynthesis(cand.slug, topic);
      if (!cell) continue;
      const label = cell.consistency?.label;
      if ((label === "evolving" || label === "shifted") && cell.summary && cards.find(c => c.type === "stance_evolved") === undefined) {
        cards.push({
          type: "stance_evolved",
          candidate_name: cand.display_name,
          candidate_slug: cand.slug,
          topic,
          body: cell.summary.split(". ").slice(0, 2).join(". ") + ".",
        });
        break;
      }
    }
    if (cards.length >= 1) break;
  }

  for (const cand of cands) {
    if (cards.find(c => c.type === "verified_vote")) break;
    const records = getRecordsForHandle(cand.slug);
    const verified = records.find(r => r.council_verification && (r.council_verification.confidence ?? 0) >= 0.95 && r.council_verification.agenda_item);
    if (!verified || !verified.council_verification) continue;
    cards.push({
      type: "verified_vote",
      candidate_name: cand.display_name,
      candidate_slug: cand.slug,
      agenda_item: verified.council_verification.agenda_item ?? "",
      body: (verified.summary ?? "").slice(0, 160),
      vote_disposition: verified.council_verification.vote_disposition ?? "",
      result: verified.council_verification.result ?? "",
      post_date: verified.post_date,
    });
  }

  for (const cand of cands) {
    if (cards.find(c => c.type === "synthesis")) break;
    for (const topic of TOPICS) {
      const cell = getSynthesis(cand.slug, topic);
      if (!cell?.summary) continue;
      cards.push({
        type: "synthesis",
        candidate_name: cand.display_name,
        candidate_slug: cand.slug,
        topic,
        body: cell.summary.slice(0, 180),
        record_count: cell.input_record_count ?? 0,
      });
      break;
    }
  }

  return cards.slice(0, 3);
}
```

- [ ] **Step 2:** Write the component.

`web/components/SurfacedCards.tsx`:

```typescript
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
  return (
    <div className="max-w-[840px] mx-auto px-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px bg-stamp-border flex-1" />
        <span className="label">Surfaced from the record</span>
        <div className="h-px bg-stamp-border flex-1" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {cards.map((c, i) => (
          <div key={i} className="bg-white border border-rule rounded-sm p-4">
            <div className="label mb-2">{cardLabel(c)}</div>
            <div className="font-sans font-semibold text-[14.5px] leading-[1.3] text-ink mb-2 tracking-tight">{cardTitle(c)}</div>
            {c.type === "synthesis" ? (
              <p className="font-serif text-[12.5px] leading-[1.6] text-ink drop-cap">{c.body}</p>
            ) : (
              <p className="font-serif text-[12.5px] leading-[1.55] text-[#3a3a35]">{c.body}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** Commit.

```bash
git add web/components/SurfacedCards.tsx web/lib/surfaced.ts
git commit -m "feat: SurfacedCards (3 server-rendered cards from real data)"
```

## Task 14: VerificationTrail and FollowUpChips components

**Files:**
- Create: `web/components/VerificationTrail.tsx`
- Create: `web/components/FollowUpChips.tsx`

- [ ] **Step 1:** Write VerificationTrail.

`web/components/VerificationTrail.tsx`:

```typescript
"use client";
import { useState } from "react";

export interface ToolCallEvent {
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "complete" | "error";
  result_summary?: string;
  message?: string;
}

const HUMAN_LABEL: Record<string, string> = {
  list_candidates: "Listing candidates",
  search_records: "Searching records",
  lookup_council_vote: "Cross-referencing council votes",
  get_synthesis: "Loading synthesis cell",
  get_record_detail: "Loading record detail",
};

export function VerificationTrail({ events, complete }: { events: ToolCallEvent[]; complete: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (events.length === 0 && !complete) return null;

  if (complete && !expanded && events.length > 0) {
    const totalRefs = events.filter(e => e.status === "complete").length;
    return (
      <div className="max-w-[780px] mx-auto bg-white border border-rule rounded-sm px-4 py-2.5 flex items-center gap-2 my-5">
        <span className="text-success font-mono text-[13px]">✓</span>
        <span className="font-sans text-[12.5px] text-[#3a3a35]">Verified. {totalRefs} {totalRefs === 1 ? "source" : "sources"} cross-referenced.</span>
        <button onClick={() => setExpanded(true)} className="ml-auto font-mono text-[10.5px] tracking-[0.06em] text-accent uppercase cursor-pointer">SHOW TRAIL ↓</button>
      </div>
    );
  }

  return (
    <div className="max-w-[780px] mx-auto my-5">
      <div className="label mb-2.5">Verification trail</div>
      <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto font-sans text-[12.5px] text-muted">
        {events.map((e, i) => {
          const verb = HUMAN_LABEL[e.tool] ?? e.tool;
          const args = Object.entries(e.args).filter(([_, v]) => v != null && v !== "").map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
          if (e.status === "running") {
            return <div key={i} className="flex items-center gap-2"><span className="text-accent font-mono">↳</span><span>{verb} {args && <span className="text-[#999] font-mono text-[10.5px]">{args}</span>}</span></div>;
          }
          if (e.status === "error") {
            return <div key={i} className="flex items-center gap-2"><span className="text-[#b50909] font-mono">!</span><span>{verb} {e.message ?? "error"}</span></div>;
          }
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-accent font-mono">↳</span>
              <span>{verb}</span>
              {e.result_summary && <span className="ml-auto font-mono text-[10.5px] text-[#999]">{e.result_summary}</span>}
            </div>
          );
        })}
        {complete && (
          <div className="flex items-center gap-2"><span className="text-success font-mono">✓</span><span className="text-success">Verified. Drafting answer.</span></div>
        )}
      </div>
      {complete && expanded && events.length > 0 && (
        <button onClick={() => setExpanded(false)} className="mt-2 font-mono text-[10.5px] tracking-[0.06em] text-accent uppercase cursor-pointer">HIDE TRAIL ↑</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** Write FollowUpChips.

`web/components/FollowUpChips.tsx`:

```typescript
"use client";

export function FollowUpChips({ chips, onPick }: { chips: string[]; onPick: (query: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap pt-3.5 mt-4 border-t border-[#f3f1ed]">
      <span className="font-mono text-[11px] text-[#999] tracking-[0.06em] uppercase mr-1.5">Follow up</span>
      {chips.map(c => (
        <button key={c} onClick={() => onPick(c)} type="button" className="bg-white border border-stamp-border px-2.5 py-1 rounded-full font-sans font-medium text-[11.5px] text-ink hover:border-accent transition-colors">
          {c}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Commit.

```bash
git add web/components/VerificationTrail.tsx web/components/FollowUpChips.tsx
git commit -m "feat: VerificationTrail and FollowUpChips components"
```

## Task 15: SingleAnswerCard component

**Files:**
- Create: `web/components/SingleAnswerCard.tsx`

- [ ] **Step 1:** Write the component.

`web/components/SingleAnswerCard.tsx`:

```typescript
import type { SingleAnswerCard as SingleAnswerCardType } from "@/lib/card-types";
import { StampPill } from "@/components/Stamp";
import { DropCap } from "@/components/DropCap";
import { FollowUpChips } from "@/components/FollowUpChips";

export function SingleAnswerCard({ card, onFollowUp }: { card: SingleAnswerCardType; onFollowUp: (q: string) => void }) {
  return (
    <div className="max-w-[780px] mx-auto bg-white border border-rule rounded-sm p-7">
      <div className="label mb-3">Answer</div>
      <div className="font-sans font-semibold text-[22px] leading-[1.35] text-ink tracking-tight mb-5">{card.answer}</div>
      {card.evidence.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-5">
          {card.evidence.map((s, i) => <StampPill key={i} stamp={s} />)}
        </div>
      )}
      {card.context && (
        <div className="border-t border-[#f3f1ed] pt-4">
          <div className="label mb-2.5">Context</div>
          <DropCap>{card.context.body}</DropCap>
        </div>
      )}
      <FollowUpChips chips={card.follow_ups} onPick={onFollowUp} />
    </div>
  );
}
```

- [ ] **Step 2:** Commit.

```bash
git add web/components/SingleAnswerCard.tsx
git commit -m "feat: SingleAnswerCard component"
```

## Task 16: ComparisonCard component

**Files:**
- Create: `web/components/ComparisonCard.tsx`

- [ ] **Step 1:** Write the component.

`web/components/ComparisonCard.tsx`:

```typescript
import type { ComparisonCard as ComparisonCardType } from "@/lib/card-types";
import { StampPill } from "@/components/Stamp";
import { FollowUpChips } from "@/components/FollowUpChips";

const DOT_COLORS: Record<string, string> = {
  green: "bg-[#1a5b1a]",
  yellow: "bg-[#b58a32]",
  red: "bg-[#b50909]",
  gray: "bg-[#999]",
};

export function ComparisonCard({ card, onFollowUp }: { card: ComparisonCardType; onFollowUp: (q: string) => void }) {
  const cols = card.candidates.length;
  const gridCols = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-flow-col auto-cols-[minmax(280px,1fr)] overflow-x-auto";

  return (
    <div className="max-w-[880px] mx-auto bg-white border border-rule rounded-sm">
      <div className="px-5 py-4 border-b border-[#f3f1ed]">
        <div className="label mb-2.5">Comparing</div>
        <div className="flex items-center gap-2 flex-wrap">
          {card.candidates.map(c => (
            <span key={c.slug} className="stamp">{c.display_name}</span>
          ))}
          <span className="ml-auto font-sans text-[12.5px] text-muted">on <span className="font-semibold text-ink border-b border-dashed border-stamp-border">{card.topic}</span></span>
        </div>
      </div>

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="font-sans font-semibold text-[16px] leading-[1.2] text-ink tracking-tight mb-1.5">{c.display_name}</div>
            <div className="flex items-center gap-2 font-sans text-[11.5px] text-muted">
              <span className={`inline-block w-2 h-2 rounded-full ${DOT_COLORS[c.consistency_dot] ?? DOT_COLORS.gray}`} />
              <span>{c.consistency_label}.</span>
              <span className="text-[#999]">{c.record_count.toLocaleString()} records.</span>
            </div>
          </div>
        ))}
      </div>

      {card.divergences.length > 0 && (
        <div className="px-5 py-4 border-b border-[#f3f1ed] bg-[#fcfaf4]">
          <div className="label mb-3">Where they diverge</div>
          <ol className="pl-[22px] list-decimal font-serif text-[13.5px] leading-[1.6] text-[#2a2a28] space-y-2">
            {card.divergences.map((d, i) => (
              <li key={i}><strong>{d.headline}</strong> {d.body}</li>
            ))}
          </ol>
        </div>
      )}

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="label mb-2.5">Summary</div>
            <p className="font-serif text-[13px] leading-[1.65] text-[#2a2a28] drop-cap">{c.summary}</p>
          </div>
        ))}
      </div>

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="label mb-2.5">Key positions</div>
            <ul className="pl-[18px] list-disc font-sans text-[12.5px] leading-[1.6] text-[#3a3a35] space-y-1">
              {c.key_positions.map((p, j) => (
                <li key={j}>{p.stance} {p.citations.length > 0 && <span className="font-mono text-accent text-[10.5px]">[{p.citations[0].slice(0, 6)}]</span>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="label mb-2.5">Council votes</div>
            <div className="font-sans text-[12.5px] leading-[1.6] text-[#3a3a35] space-y-1.5">
              {c.council_votes.map((v, j) => (
                <div key={j}><strong>{v.vote}</strong> on {v.agenda_item} {v.title}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-b border-[#f3f1ed]">
        <div className="label mb-2.5">Evidence</div>
        <div className="flex gap-1.5 flex-wrap">
          {card.candidates.flatMap(c => c.evidence).map((s, i) => <StampPill key={i} stamp={s} />)}
        </div>
      </div>

      <div className="px-5 py-3.5">
        <FollowUpChips chips={card.follow_ups} onPick={onFollowUp} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Commit.

```bash
git add web/components/ComparisonCard.tsx
git commit -m "feat: ComparisonCard component"
```

## Task 17: RecordTrailCard component

**Files:**
- Create: `web/components/RecordTrailCard.tsx`

- [ ] **Step 1:** Write the component.

`web/components/RecordTrailCard.tsx`:

```typescript
import type { RecordTrailCard as RecordTrailCardType } from "@/lib/card-types";
import { StampPill } from "@/components/Stamp";
import { FollowUpChips } from "@/components/FollowUpChips";

export function RecordTrailCard({ card, onFollowUp }: { card: RecordTrailCardType; onFollowUp: (q: string) => void }) {
  return (
    <div className="max-w-[780px] mx-auto bg-white border border-rule rounded-sm p-7">
      <div className="label mb-3">Record trail</div>
      <div className="font-sans font-semibold text-[18px] leading-[1.3] text-ink tracking-tight mb-5">{card.theme}</div>
      <div className="relative pl-6 space-y-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-stamp-border">
        {card.entries.map((e, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[18px] top-1 w-2 h-2 rounded-full bg-accent" />
            <div className="font-mono text-[10.5px] uppercase tracking-label text-muted mb-1">{e.date.slice(0, 10)} . {e.label}</div>
            <p className="font-serif text-[13px] leading-[1.65] text-[#2a2a28]">{e.body}</p>
            {e.evidence.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {e.evidence.map((s, j) => <StampPill key={j} stamp={s} />)}
              </div>
            )}
          </div>
        ))}
      </div>
      <FollowUpChips chips={card.follow_ups} onPick={onFollowUp} />
    </div>
  );
}
```

- [ ] **Step 2:** Commit.

```bash
git add web/components/RecordTrailCard.tsx
git commit -m "feat: RecordTrailCard component"
```

## Task 18: ReceiptStream client component (consumes /api/ask)

**Files:**
- Create: `web/components/ReceiptStream.tsx`

- [ ] **Step 1:** Write the streaming consumer.

`web/components/ReceiptStream.tsx`:

```typescript
"use client";
import { useState, useCallback } from "react";
import { VerificationTrail, type ToolCallEvent } from "@/components/VerificationTrail";
import { SingleAnswerCard } from "@/components/SingleAnswerCard";
import { ComparisonCard } from "@/components/ComparisonCard";
import { RecordTrailCard } from "@/components/RecordTrailCard";
import { validateCard, type AnyCard } from "@/lib/card-types";

interface State {
  query: string;
  events: ToolCallEvent[];
  card: AnyCard | null;
  complete: boolean;
  error: string | null;
}

const INITIAL: State = { query: "", events: [], card: null, complete: false, error: null };

export function useReceiptStream() {
  const [state, setState] = useState<State>(INITIAL);

  const submit = useCallback(async (query: string, token: string) => {
    setState({ query, events: [], card: null, complete: false, error: null });
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, turnstile_token: token }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "unknown" }));
        setState(s => ({ ...s, error: err.error ?? "error", complete: true }));
        return;
      }
      const reader = r.body?.getReader();
      if (!reader) { setState(s => ({ ...s, error: "no_stream", complete: true })); return; }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\n\n/);
        buffer = events.pop() ?? "";
        for (const block of events) {
          const lines = block.split("\n");
          let event = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!event) continue;
          const data = dataStr ? JSON.parse(dataStr) : {};
          if (event === "tool_call") {
            setState(s => {
              const others = s.events.filter(e => !(e.tool === data.tool && JSON.stringify(e.args) === JSON.stringify(data.args)));
              return { ...s, events: [...others, data] };
            });
          } else if (event === "card") {
            const card = validateCard(data.payload);
            setState(s => ({ ...s, card, complete: true }));
          } else if (event === "done") {
            setState(s => ({ ...s, complete: true }));
          }
        }
      }
    } catch (err) {
      setState(s => ({ ...s, error: String(err), complete: true }));
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { state, submit, reset };
}

export function ReceiptStream({ state, onFollowUp }: { state: State; onFollowUp: (q: string) => void }) {
  if (!state.query) return null;
  return (
    <div className="px-8">
      <div className="max-w-[780px] mx-auto mb-2">
        <div className="font-sans text-[14px] text-muted mb-1.5">You asked</div>
        <div className="font-sans font-semibold text-[22px] leading-[1.3] text-ink tracking-tight">{state.query}</div>
      </div>
      <VerificationTrail events={state.events} complete={state.complete} />
      {state.error && (
        <div className="max-w-[780px] mx-auto bg-white border border-rule rounded-sm p-6 text-center">
          <p className="font-sans text-[14px] text-muted">Could not produce a sourced answer for this question.</p>
          <button onClick={() => onFollowUp("")} className="chip mt-3">Try a different question</button>
        </div>
      )}
      {state.card?.type === "single_answer" && <SingleAnswerCard card={state.card} onFollowUp={onFollowUp} />}
      {state.card?.type === "comparison" && <ComparisonCard card={state.card} onFollowUp={onFollowUp} />}
      {state.card?.type === "record_trail" && <RecordTrailCard card={state.card} onFollowUp={onFollowUp} />}
    </div>
  );
}
```

- [ ] **Step 2:** Commit.

```bash
git add web/components/ReceiptStream.tsx
git commit -m "feat: ReceiptStream client component (SSE consumer)"
```

---

## Phase D. Routes (Tasks 19 to 22)

## Task 19: Wire the landing page

**Files:**
- Modify: `web/app/page.tsx`

- [ ] **Step 1:** Replace the placeholder page with the full landing.

`web/app/page.tsx`:

```typescript
"use client";
import { useState } from "react";
import { CommandBar } from "@/components/CommandBar";
import { Chips } from "@/components/Chips";
import { SurfacedCards } from "@/components/SurfacedCards";
import { ReceiptStream, useReceiptStream } from "@/components/ReceiptStream";
import { getTurnstileToken } from "@/lib/turnstile-client";

export default function Home() {
  const { state, submit, reset } = useReceiptStream();
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || undefined;
  const [pickedQuery, setPickedQuery] = useState<string | null>(null);

  async function onChipPick(query: string) {
    setPickedQuery(query);
    const token = await getTurnstileToken(siteKey);
    submit(query, token);
  }

  async function onFollowUp(query: string) {
    if (!query) { reset(); return; }
    setPickedQuery(query);
    const token = await getTurnstileToken(siteKey);
    submit(query, token);
  }

  function onCommandSubmit(query: string, token: string) {
    submit(query, token);
  }

  return (
    <div className="min-h-screen">
      <div className="text-center pt-10 px-8">
        <div className="font-sans font-semibold text-[30px] leading-[1.1] tracking-tight text-ink mb-2.5">The Mayoral Record</div>
        <p className="font-serif italic text-[14px] leading-[1.5] text-[#5a5a55] max-w-[560px] mx-auto">Toronto's 2026 mayoral race, sourced and queryable.</p>
      </div>
      <div className="mt-9">
        <CommandBar onSubmit={onCommandSubmit} />
      </div>
      {!state.query && <Chips onPick={onChipPick} />}
      {!state.query && <SurfacedCards />}
      {state.query && <ReceiptStream state={state} onFollowUp={onFollowUp} />}
    </div>
  );
}
```

The `pickedQuery` state is unused in this iteration; we keep it as a hook for future query-history features. Remove if you prefer to avoid the unused-variable lint warning by removing the `useState` import.

Actually, drop it now since YAGNI. Replace the body:

```typescript
"use client";
import { CommandBar } from "@/components/CommandBar";
import { Chips } from "@/components/Chips";
import { SurfacedCards } from "@/components/SurfacedCards";
import { ReceiptStream, useReceiptStream } from "@/components/ReceiptStream";
import { getTurnstileToken } from "@/lib/turnstile-client";

export default function Home() {
  const { state, submit, reset } = useReceiptStream();
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || undefined;

  async function onChipPick(query: string) {
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
      <div className="text-center pt-10 px-8">
        <div className="font-sans font-semibold text-[30px] leading-[1.1] tracking-tight text-ink mb-2.5">The Mayoral Record</div>
        <p className="font-serif italic text-[14px] leading-[1.5] text-[#5a5a55] max-w-[560px] mx-auto">Toronto's 2026 mayoral race, sourced and queryable.</p>
      </div>
      <div className="mt-9">
        <CommandBar onSubmit={onCommandSubmit} />
      </div>
      {!state.query && <Chips onPick={onChipPick} />}
      {!state.query && <SurfacedCards />}
      {state.query && <ReceiptStream state={state} onFollowUp={onFollowUp} />}
    </div>
  );
}
```

- [ ] **Step 2:** Smoke test in dev.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
sleep 8
echo "  / : $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" http://localhost:3000/)"
kill $DEV_PID 2>/dev/null
```

Open in a browser and verify: word-mark, command bar, 10 chips, 3 surfaced cards. Type a query and submit. Expect verification chips to appear and a receipt card to render.

- [ ] **Step 3:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/page.tsx
git commit -m "feat: wire the landing page"
```

## Task 20: /candidates/[slug] deep-dive page

**Files:**
- Create: `web/app/candidates/[slug]/page.tsx`
- Create: `web/app/candidates/page.tsx`

- [ ] **Step 1:** Write the candidate index.

`web/app/candidates/page.tsx`:

```typescript
import Link from "next/link";
import { listCandidates } from "@/lib/agent/data-loader";

export const metadata = { title: "All candidates . The Mayoral Record" };

export default function CandidateIndex() {
  const cands = listCandidates();
  return (
    <main className="max-w-[760px] mx-auto px-8 py-10">
      <h1 className="font-serif font-bold text-[28px] leading-[1.2] text-ink mb-2">Candidates</h1>
      <p className="font-sans text-[14px] text-muted mb-6">Listed alphabetically by surname.</p>
      <ul className="space-y-3">
        {cands.map(c => (
          <li key={c.slug}>
            <Link href={`/candidates/${c.slug}`} className="font-sans font-medium text-[16px] text-ink hover:text-accent">{c.display_name}</Link>
            {c.current_role && <span className="font-sans text-[12.5px] text-muted ml-2">{c.current_role}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2:** Write the deep-dive page.

`web/app/candidates/[slug]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import { listCandidates, getDossier, getSynthesis } from "@/lib/agent/data-loader";
import { DropCap } from "@/components/DropCap";

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

const TOPICS = Object.keys(TOPIC_LABELS);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cand = listCandidates().find(c => c.slug === slug);
  return {
    title: cand ? `${cand.display_name} . The Mayoral Record` : "Not found",
    openGraph: cand ? {
      images: [{ url: `/api/og?type=candidate&name=${encodeURIComponent(cand.display_name)}&records=${cand.record_count ?? 0}&dot=${cand.consistency_dot ?? "gray"}&files_label=${encodeURIComponent("The " + cand.surname + " Files")}`, width: 1200, height: 630 }],
    } : undefined,
  };
}

export default async function CandidatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cands = listCandidates();
  const cand = cands.find(c => c.slug === slug);
  if (!cand) notFound();

  const dossier = getDossier(slug) as { meta?: Record<string, unknown> } | null;
  return (
    <main className="max-w-[840px] mx-auto px-8 py-10">
      <h1 className="font-serif font-bold text-[28px] leading-[1.2] text-ink mb-1.5">{cand.display_name}</h1>
      {cand.current_role && <p className="font-sans text-[13px] text-muted mb-6">{cand.current_role}</p>}

      <div className="space-y-8">
        {TOPICS.map(topic => {
          const cell = getSynthesis(slug, topic);
          if (!cell?.summary) return null;
          return (
            <section key={topic} className="border-l-[3px] border-accent pl-4">
              <div className="label mb-2">{TOPIC_LABELS[topic]}</div>
              <DropCap>{cell.summary}</DropCap>
              {cell.consistency?.label && (
                <div className="font-mono text-[10.5px] uppercase tracking-label text-muted mt-2">
                  {cell.consistency.label}{cell.consistency.stable_since ? ` since ${cell.consistency.stable_since}` : ""}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 3:** Smoke test.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
sleep 8
for path in /candidates /candidates/bradford /candidates/chow; do
  echo "  $path: $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" http://localhost:3000$path)"
done
kill $DEV_PID 2>/dev/null
```

Expected: all return 200.

- [ ] **Step 4:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/candidates/[slug]/page.tsx web/app/candidates/page.tsx
git commit -m "feat: /candidates/[slug] deep-dive + /candidates index"
```

## Task 21: Port existing API endpoints to Next.js

**Files:**
- Create: `web/app/api/og/route.ts`
- Create: `web/app/api/vote/route.ts`
- Create: `web/app/api/aggregate/route.ts`
- Create: `web/app/api/issue-vote/route.ts`
- Create: `web/app/api/issues-aggregate/route.ts`
- Create: `web/lib/api-helpers.ts`

- [ ] **Step 1:** Port the OG endpoint. Read the existing `site/api/og.js` and write the equivalent at `web/app/api/og/route.ts`. The function logic is identical; export named `GET` instead of `default`.

`web/app/api/og/route.ts`:

```typescript
import { ImageResponse } from "@vercel/og";
export const runtime = "edge";

const COLORS = {
  navy: "#0d2f5c", red: "#da291c", white: "#ffffff",
  green: "#1a5b1a", yellow: "#b58a32", redDot: "#b50909", gray: "#999",
};

function frame(children: any) {
  return { type: "div", props: { style: { display: "flex", flexDirection: "column", width: "1200px", height: "630px", background: COLORS.navy, color: COLORS.white, padding: "60px 80px", fontFamily: "system-ui, sans-serif" }, children } };
}

function landingCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Public Record . The 416" } },
    { type: "div", props: { style: { fontSize: 96, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "An independent, sourced record of Toronto's 2026 mayoral race." } },
  ]);
}

function candidateCard(name: string, recordCount: number, dotColor: string, filesLabel: string) {
  const dotMap: Record<string, string> = { green: COLORS.green, yellow: COLORS.yellow, red: COLORS.redDot };
  const dotHex = dotMap[dotColor] ?? COLORS.gray;
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }, children: [
      { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0 }, children: filesLabel } },
      { type: "div", props: { style: { width: 36, height: 36, borderRadius: 18, background: dotHex } } },
    ] } },
    { type: "div", props: { style: { fontSize: 30, opacity: 0.9 }, children: `${name} . ${recordCount.toLocaleString()} sourced records` } },
  ]);
}

function issuesCard() {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 88, fontWeight: 700, lineHeight: 1.0, marginBottom: 24 }, children: "Issues & Agenda Gap" } },
    { type: "div", props: { style: { fontSize: 28, lineHeight: 1.3, opacity: 0.85, maxWidth: 1000 }, children: "Reader priority vs. candidate emphasis." } },
  ]);
}

function answerCard(q: string) {
  return frame([
    { type: "div", props: { style: { fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: COLORS.red, marginBottom: 16 }, children: "Answer . The Mayoral Record" } },
    { type: "div", props: { style: { fontSize: 48, fontWeight: 700, lineHeight: 1.15, marginBottom: 24 }, children: q.slice(0, 180) } },
    { type: "div", props: { style: { fontSize: 22, lineHeight: 1.3, opacity: 0.85 }, children: "An open record. Ask a question. Source the answer." } },
  ]);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "landing";
  let element: any;
  if (type === "candidate") {
    element = candidateCard(
      url.searchParams.get("name") ?? "Candidate",
      parseInt(url.searchParams.get("records") ?? "0", 10),
      url.searchParams.get("dot") ?? "gray",
      url.searchParams.get("files_label") ?? "The Files",
    );
  } else if (type === "issues") element = issuesCard();
  else if (type === "answer") element = answerCard(url.searchParams.get("q") ?? "");
  else element = landingCard();
  return new ImageResponse(element, { width: 1200, height: 630 });
}
```

Add `@vercel/og` to web/package.json:

```bash
cd /Users/aramammo/thebradfordfiles/web
npm install @vercel/og
```

- [ ] **Step 2:** Write the api-helpers.

`web/lib/api-helpers.ts`:

```typescript
import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export function hashFingerprint(raw: string | null): string | null {
  if (!raw || typeof raw !== "string" || raw.length < 8) return null;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
```

- [ ] **Step 3:** Port `/api/vote`. Read `/Users/aramammo/thebradfordfiles/site/api/vote.js`. Translate to Next.js route handler.

`web/app/api/vote/route.ts`:

```typescript
import { redis, hashFingerprint } from "@/lib/api-helpers";
import { verifyTurnstile } from "@/lib/agent/turnstile";

const VALID = new Set(["kept", "broke", "too_early"]);
const RID = /^[A-Za-z0-9_-]{6,32}$/;

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { record_id, judgment, turnstile_token, fingerprint } = body as Record<string, string>;
  if (!record_id || !RID.test(record_id)) return Response.json({ error: "invalid_record_id" }, { status: 400 });
  if (!VALID.has(judgment)) return Response.json({ error: "invalid_judgment" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  if (!await verifyTurnstile(turnstile_token ?? null, ip)) return Response.json({ error: "turnstile_failed" }, { status: 403 });
  const fp = hashFingerprint(fingerprint);
  if (!fp) return Response.json({ error: "missing_fingerprint" }, { status: 400 });

  const dedupKey = `vote:${record_id}:fp:${fp}`;
  const set = await redis.set(dedupKey, judgment, { ex: 60 * 60 * 24 * 365, nx: true });
  if (set !== "OK") {
    const counts = await redis.hgetall(`vote:${record_id}:counts`) as Record<string, string> | null;
    return Response.json({ ok: true, deduped: true, counts: norm(counts) });
  }
  await redis.hincrby(`vote:${record_id}:counts`, judgment, 1);
  await redis.hincrby(`vote:${record_id}:counts`, "total", 1);
  const counts = await redis.hgetall(`vote:${record_id}:counts`) as Record<string, string> | null;
  return Response.json({ ok: true, counts: norm(counts) });
}

function norm(c: Record<string, string> | null) {
  const r = c ?? {};
  return { kept: parseInt(r.kept ?? "0", 10), broke: parseInt(r.broke ?? "0", 10), too_early: parseInt(r.too_early ?? "0", 10), total: parseInt(r.total ?? "0", 10) };
}
```

- [ ] **Step 4:** Port `/api/aggregate`, `/api/issue-vote`, `/api/issues-aggregate` similarly. Each follows the same translation pattern: read the existing JS file, change `export default async function handler(req, res)` to `export async function POST/GET(req: Request)`, change `res.status(N).json(...)` to `Response.json(..., { status: N })`, add `export const runtime = "nodejs"` at top.

For brevity here the four ports are the same exercise; the implementer can copy the existing logic verbatim into the new shape.

- [ ] **Step 5:** Verify by running each new endpoint locally with `vercel dev` (or `npm run dev` if Turnstile is mocked).

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
sleep 8
/usr/bin/curl -s "http://localhost:3000/api/og?type=landing" -o /tmp/og.png
ls -la /tmp/og.png
/usr/bin/curl -s "http://localhost:3000/api/issues-aggregate"
echo
kill $DEV_PID 2>/dev/null
```

Expected: PNG file > 5KB; aggregate returns counts JSON.

- [ ] **Step 6:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/api web/lib/api-helpers.ts web/package.json web/package-lock.json
git commit -m "feat: port /api endpoints to Next.js (og, vote, aggregate, issue-vote, issues-aggregate)"
```

## Task 22: Migrate Pol.is deliberation page

**Files:**
- Create: `web/app/issues/transit-funding/discuss/page.tsx`

- [ ] **Step 1:** Write it.

`web/app/issues/transit-funding/discuss/page.tsx`:

```typescript
"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function TransitFundingDeliberation() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://pol.is/embed.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  return (
    <main className="max-w-[980px] mx-auto px-6 py-6">
      <Link href="/" className="text-accent text-[13px]">{"←"} Back</Link>
      <h1 className="font-serif font-bold text-[24px] leading-[1.2] text-ink mt-4 mb-2">Should Toronto raise property tax to fund TTC expansion?</h1>
      <p className="font-sans text-[14px] leading-[1.55] text-muted mb-4">A deliberative conversation on transit funding. Vote agree or disagree on community-submitted statements; the algorithm clusters opinion groups and surfaces statements that bridge across groups. Powered by <a className="text-accent" href="https://pol.is" target="_blank" rel="noopener noreferrer">Pol.is</a>.</p>
      <div className="bg-white border border-rule min-h-[600px]">
        <div
          className="polis"
          data-page_id="tomf-transit-funding-2026"
          data-site_id="polis_site_id_x051uejVaaUdyHJVvA"
        />
      </div>
      <p className="font-sans italic text-[11.5px] text-muted mt-4">Statements are submitted and voted on by Pol.is users. The Mayoral Record seeds initial statements but does not moderate. Conversation results are not a representative poll.</p>
    </main>
  );
}
```

- [ ] **Step 2:** Smoke check.

```bash
cd /Users/aramammo/thebradfordfiles/web
npm run dev > /tmp/next-dev.log 2>&1 &
DEV_PID=$!
sleep 8
echo "  /issues/transit-funding/discuss: $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" http://localhost:3000/issues/transit-funding/discuss)"
kill $DEV_PID 2>/dev/null
```

Expected: 200.

- [ ] **Step 3:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/issues/transit-funding/discuss/page.tsx
git commit -m "feat: migrate Pol.is deliberation page"
```

---

## Phase E. Synthesis prompt update (Tasks 23 to 24)

## Task 23: Update SYSTEM_PROMPT to forbid em dashes

**Files:**
- Modify: `scripts/lib/synthesis.py`
- Modify: `tests/test_synthesis_helpers.py`

- [ ] **Step 1:** Add a rule to the prompt. In `SYSTEM_PROMPT`, after rule 5 (the model_declined option), insert:

Find:

```python
6. Use the candidate's name (not pronouns) in the first sentence of summary.
```

Replace with:

```python
6. Never use em dashes (the U+2014 character). Use periods, colons, commas,
   or parentheses instead. En dashes for date ranges (2018 to 2022) and
   hyphens are fine.
7. Use the candidate's name (not pronouns) in the first sentence of summary.
```

And renumber the rules below to 8 and 9 (the existing rules 6, 7, 8 shift down by one).

- [ ] **Step 2:** Update the existing prompt-stability test.

In `tests/test_synthesis_helpers.py`, find `test_system_prompt_hash_is_stable`. Add a new test below it:

```python
def test_system_prompt_forbids_em_dashes():
    assert "em dashes" in synthesis.SYSTEM_PROMPT
    assert "U+2014" in synthesis.SYSTEM_PROMPT
```

- [ ] **Step 3:** Run the tests.

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python -m pytest tests/test_synthesis_helpers.py -v 2>&1 | tail -8
```

Expected: all pass, including the new no-em-dash assertion. The system_prompt_hash test still passes because it computes the hash from the new prompt.

- [ ] **Step 4:** Commit.

```bash
git add scripts/lib/synthesis.py tests/test_synthesis_helpers.py
git commit -m "fix: synthesis prompt forbids em dashes"
```

## Task 24: Regenerate synthesis cells

**Files:** none (data refresh).

- [ ] **Step 1:** Run the batch.

```bash
cd /Users/aramammo/thebradfordfiles
set -a && source ./.env && set +a
.venv/bin/python scripts/synthesize_all.py 2>&1 | tee synthesize-all-9.log
```

Expected: ~$10, ~10 min wall-clock. All 20 cells regenerate.

- [ ] **Step 2:** Verify no em dashes remain.

```bash
.venv/bin/python -c "
import json
from pathlib import Path
em = 0
for path in sorted(Path('data').glob('*/synthesis/*.json')):
    d = json.loads(path.read_text())
    text = (d.get('summary') or '') + ' ' + json.dumps(d.get('consistency') or {})
    if '—' in text:
        em += 1
        print(f'  em dash in {path}')
print(f'em dashes found: {em}')
assert em == 0
"
```

Expected: 0 em dashes.

- [ ] **Step 3:** Run build_site to refresh dossiers (and copy to web/public/data/).

```bash
.venv/bin/python scripts/build_site.py 2>&1 | tail -5
```

- [ ] **Step 4:** Commit synthesis outputs.

```bash
git add data/bradfordgrams/synthesis data/oliviachow/synthesis
git commit -m "chore: regenerate synthesis under no-em-dash prompt"
```

---

## Phase F. Cutover and deploy (Tasks 25 to 28)

## Task 25: Vercel project root swap

**Files:**
- No file changes; Vercel dashboard action.

- [ ] **Step 1:** In the Vercel dashboard for `bottlenecklabs/thebradfordfiles`, change **Settings → General → Root Directory** from `site` to `web`.

- [ ] **Step 2:** Confirm Build & Development Settings: Framework = `Next.js`, Build Command = `next build`, Install Command = `npm install`, Output Directory = `.next`. (Vercel auto-detects.)

- [ ] **Step 3:** Add NEXT_PUBLIC_TURNSTILE_SITE_KEY to the Vercel env (if not present already). Production scope.

```bash
vercel env add NEXT_PUBLIC_TURNSTILE_SITE_KEY production preview development
# paste the same TURNSTILE_SITE_KEY value
```

- [ ] **Step 4:** Trigger a preview deploy from the CLI.

```bash
cd /Users/aramammo/thebradfordfiles/web
vercel --yes 2>&1 | tail -8
```

Expected: preview URL printed; build succeeds.

- [ ] **Step 5:** Smoke-test the preview URL.

```bash
URL=<preview-url-from-step-4>
for path in / /privacy /terms /methodology /about /candidates /candidates/bradford /candidates/chow /issues/transit-funding/discuss; do
  echo "  $path: $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" $URL$path)"
done
/usr/bin/curl -s "$URL/api/og?type=landing" -o /tmp/og-prev.png && ls -la /tmp/og-prev.png
```

Expected: all routes return 200; OG returns a PNG.

- [ ] **Step 6:** In a browser, open the preview URL. Confirm:
- Landing renders with command bar, 10 chips, 3 surfaced cards.
- Submit a query like "Compare candidates on housing." Verify chips appear, then a comparison card.
- Submit "How did Bradford vote on the watercraft ban?" Verify a single answer card.
- Click `/candidates/bradford` to confirm the deep-dive page loads.

- [ ] **Step 7:** No commit (Vercel state change only).

## Task 26: Production deploy

**Files:** none.

- [ ] **Step 1:** Promote to production.

```bash
cd /Users/aramammo/thebradfordfiles/web
vercel --prod --yes 2>&1 | tail -8
```

Expected: deploy succeeds; alias resolves to mayoralrecord.com.

- [ ] **Step 2:** Live smoke-test.

```bash
URL="https://www.mayoralrecord.com"
for path in / /privacy /terms /methodology /about /candidates /candidates/bradford /bradford /chow /issues /compare /sitemap.xml /robots.txt; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL$path")
  echo "  $code  $path"
done
/usr/bin/curl -s "$URL/api/og?type=landing" -o /tmp/og-live.png && ls -la /tmp/og-live.png
```

Expected: `/`, `/privacy`, `/terms`, `/methodology`, `/about`, `/candidates`, `/candidates/bradford`, `/sitemap.xml`, `/robots.txt`, `/api/og?type=landing` return 200. `/bradford` and `/chow` return 308 (redirect). `/issues` and `/compare` return 308.

- [ ] **Step 3:** Push.

```bash
cd /Users/aramammo/thebradfordfiles
git push origin main 2>&1 | tail -3
```

## Task 27: Sitemap and robots regenerated for new routes

**Files:**
- Modify: `scripts/build_site.py` (or copy sitemap into web/public)
- Move: `site/robots.txt` to `web/public/robots.txt`

- [ ] **Step 1:** Update `_emit_sitemap` in `scripts/build_site.py` to also write the sitemap to `web/public/sitemap.xml`. After the existing write to SITE_DIR, add a parallel write:

```python
(WEB_DATA_DIR.parent / "sitemap.xml").write_text("\n".join(lines) + "\n")
print(f"  also wrote web/public/sitemap.xml")
```

(WEB_DATA_DIR is `web/public/data`, so `WEB_DATA_DIR.parent` is `web/public`.)

Update the static_routes list to include `/candidates` (the index).

- [ ] **Step 2:** Move robots.txt.

```bash
cp /Users/aramammo/thebradfordfiles/site/robots.txt /Users/aramammo/thebradfordfiles/web/public/robots.txt
```

- [ ] **Step 3:** Rebuild and re-deploy.

```bash
cd /Users/aramammo/thebradfordfiles
.venv/bin/python scripts/build_site.py 2>&1 | tail -5
cd web
vercel --prod --yes 2>&1 | tail -5
```

- [ ] **Step 4:** Verify.

```bash
/usr/bin/curl -sL https://www.mayoralrecord.com/sitemap.xml | head -10
/usr/bin/curl -sL https://www.mayoralrecord.com/robots.txt
```

Expected: sitemap lists the new routes; robots.txt prints with the sitemap pointer.

- [ ] **Step 5:** Commit.

```bash
cd /Users/aramammo/thebradfordfiles
git add scripts/build_site.py web/public/robots.txt
git commit -m "feat: sitemap and robots.txt under web/"
git push origin main
```

## Task 28: Archive the legacy site

**Files:**
- Rename: `site/` to `legacy-site/`

- [ ] **Step 1:** Verify production is happy and stable for at least one full smoke run.

```bash
URL="https://www.mayoralrecord.com"
for path in / /candidates/bradford /candidates/chow /privacy /terms /api/og?type=landing; do
  echo "  $path: $(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL$path")"
done
```

Expected: all 200.

- [ ] **Step 2:** Archive the old site directory.

```bash
cd /Users/aramammo/thebradfordfiles
git mv site legacy-site
echo "Archived 2026-05-04. Replaced by web/. To restore, set Vercel root directory back to legacy-site/." > legacy-site/ARCHIVED.md
git add legacy-site/ARCHIVED.md
git commit -m "chore: archive legacy site directory after Sprint 9 cutover"
git push origin main
```

- [ ] **Step 3:** Final verification.

```bash
URL="https://www.mayoralrecord.com"
/usr/bin/curl -sL "$URL/" | grep -c "The Mayoral Record"
echo "Sprint 9 complete."
```

Expected: brand string still present; site fully migrated.

---

## Self-review

**Spec coverage:**
- ✅ Documentary type system (Tasks 1, 3 globals.css)
- ✅ Editorial drop cap (Task 3 DropCap component, used in Tasks 13, 15, 16, 20)
- ✅ Invisible landing with command bar + 10 chips + 3 surfaced cards (Tasks 11, 12, 13, 19)
- ✅ Three card types with TS interfaces and runtime validation (Tasks 6, 15, 16, 17)
- ✅ Verification chip stream (Tasks 14, 18)
- ✅ Agent + 6 tools (Tasks 7, 8, 9)
- ✅ /api/ask streaming SSE endpoint (Task 10)
- ✅ Migration plan for static pages (Task 4)
- ✅ /candidates/[slug] deep-dive (Task 20)
- ✅ URL redirects /bradford, /chow, /issues, /compare (Task 1, next.config.mjs)
- ✅ Synthesis SYSTEM_PROMPT updated to forbid em dashes (Task 23)
- ✅ All synthesis cells regenerated (Task 24)
- ✅ Existing /api endpoints ported (Task 21)
- ✅ Pol.is preserved (Task 22)
- ✅ Sitemap + robots updated (Task 27)
- ✅ Vercel project root swap (Task 25)
- ✅ Production deploy + push (Task 26)
- ✅ Legacy site archived (Task 28)

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Step 4 of Task 21 says "follows the same translation pattern; the implementer can copy the existing logic verbatim into the new shape" which is a soft instruction. To be precise: the four endpoints to port are `/api/aggregate` (GET), `/api/issue-vote` (POST), `/api/issues-aggregate` (GET) and the existing logic lives at `site/api/aggregate.js`, `site/api/issue-vote.js`, `site/api/issues-aggregate.js` respectively. Each is ~40 lines of JS. The translation: rename `default async function handler` to `export async function POST` (or GET), change `res.status(N).json(...)` to `Response.json(..., { status: N })`, add `export const runtime = "nodejs"` at top, change Node imports to ESM. The `req.query` object in the GET endpoints becomes `new URL(req.url).searchParams.get("...")`. Reasonable for the implementer to handle without verbatim code in this plan.

**Type consistency:**
- `Stamp` interface defined in Task 3 (lib/stamp-types.ts) consumed by SingleAnswerCard (Task 15), ComparisonCard (Task 16), RecordTrailCard (Task 17), surfaced (Task 13). Consistent.
- `AnyCard`, `SingleAnswerCard`, `ComparisonCard`, `RecordTrailCard` defined in Task 6, consumed by Task 18 (ReceiptStream).
- `validateCard` defined in Task 6, consumed by Task 10 (/api/ask) and Task 18 (ReceiptStream). Consistent.
- `containsEmDash` defined in Task 6, consumed by Task 10. Consistent.
- Tool function names match between Task 8 (implementations) and Task 9 (schemas) and Task 10 (callTool dispatcher).
- The `Anthropic` SDK import in Task 10 uses `@anthropic-ai/sdk` which is in the dependencies in Task 1.
- `setDataDir` exported from data-loader (Task 7) is used by tests in Tasks 7 and 8.

No gaps. Plan is implementable as-is.
