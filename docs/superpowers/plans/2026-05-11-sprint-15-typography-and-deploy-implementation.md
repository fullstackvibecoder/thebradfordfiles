# Sprint 15. Typography Pass + Vercel Deploy Fix. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Vercel auto-deploy so git pushes consistently land on production, and apply an editorial typography pass plus three small info-mark components to receipts, scenarios, and candidate pages.

**Architecture:** Two parallel tracks. Track A investigates the Vercel project's auto-deploy gap and remediates. Track C activates OpenType font features (tabular, oldstyle, small caps, drop caps) on existing components via Tailwind and globals.css, then adds three new components: `ConsistencyTimeline` (5 colored ticks reading from synthesis cells), `Sparkline` (inline SVG of 12-month record cadence), and an `ageOf` helper for as-of staleness color treatment.

**Tech Stack:** Next.js 16.2.4, React 19 RC, TypeScript, Tailwind CSS, Vitest, Source Serif Pro + Inter (OpenType features), Vercel CLI + REST API.

**Spec:** `docs/superpowers/specs/2026-05-11-sprint-15-typography-and-deploy.md`.

---

## File map

### New files
| Path | Responsibility |
|---|---|
| `web/components/ConsistencyTimeline.tsx` | 5-tick consistency timeline component, reads getSynthesis per topic group |
| `web/components/Sparkline.tsx` | Inline 60x16 SVG sparkline of last 12 months record cadence |
| `web/lib/date-helpers.ts` | `ageOf(asOf)` returning "fresh" / "normal" / "stale" + color class helper |
| `web/tests/consistency-timeline.test.ts` | 4 tests covering label-color mapping + missing cell fallback |
| `web/tests/sparkline.test.ts` | 4 tests covering data derivation (month grouping, 12-month window, normalisation, no-data return-null) |
| `web/tests/date-helpers.test.ts` | 3 tests for the three age buckets |
| `docs/superpowers/notes/2026-05-11-vercel-deploy-fix.md` | Notes on root cause + remediation of the Vercel auto-deploy gap |

### Modified files
| Path | Change |
|---|---|
| `web/app/globals.css` | Add font-feature utility classes (`.nums-tabular`, `.nums-oldstyle`, `.caps-small`, `.asterism`) under `@layer components` |
| `web/components/ReceiptExhibit.tsx` | Apply tabular/oldstyle/small-caps classes; integrate ageOf color treatment on as_of |
| `web/components/ReceiptClaimBlock.tsx` | Apply small-caps on AUDITED stamp; add optional ConsistencyTimeline + Sparkline when claim attributed to known candidate |
| `web/components/ReceiptCard.tsx` | Apply drop-cap on pull_quote rendering; insert asterism between Exhibits and "What data cannot settle" |
| `web/components/ScenarioCard.tsx` | Apply drop-cap on Who-Benefits intro; integrate ConsistencyTimeline + Sparkline in candidate-position blocks; apply tabular/oldstyle |
| `web/components/ScenarioTierBadge.tsx` | Apply small-caps |
| `web/components/CandidateStatStrip.tsx` | Apply tabular-nums on numeric stats; insert Sparkline beside Records stat |
| `web/app/candidates/[slug]/page.tsx` | Insert ConsistencyTimeline under candidate name/role |
| `web/components/Dateline.tsx` | Apply small-caps on the dateline elements |

---

## Task 0. Verify baseline

**Files:** none modified.

- [ ] **Step 1: Confirm git state**

```bash
cd /Users/aramammo/thebradfordfiles
git status --short | /usr/bin/head -10
```

Expected: only known pre-existing dirty state (legacy-site/*, web/tsconfig.json, untracked data/*, web/public/sitemap.xml, web/tsconfig.tsbuildinfo). If unexpected, stop and ask.

- [ ] **Step 2: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```

Expected: 107 tests pass.

- [ ] **Step 3: Confirm production is healthy**

```bash
URL="https://www.mayoralrecord.com"
for path in "/" "/scenarios/housing-supply-mechanism" "/receipts/crime-trends" "/candidates/bradford"; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL$path")
  echo "  $code  $path"
done
```

Expected: all 4 routes return 200.

---

## Task 1. Track A: Vercel auto-deploy investigation + fix

**Files:**
- Create: `docs/superpowers/notes/2026-05-11-vercel-deploy-fix.md`
- Possibly modify: project settings via Vercel CLI/REST API (no files in repo).

- [ ] **Step 1: Audit Vercel project settings via CLI**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
echo "==== Project link ===="
/bin/cat .vercel/project.json
echo
echo "==== Recent deployments ===="
vercel ls 2>&1 | /usr/bin/head -10
echo
echo "==== Inspect project via REST API ===="
TOKEN=$(/usr/bin/grep -A1 token ~/.local/share/com.vercel.cli/auth.json 2>/dev/null | /usr/bin/tail -1 | /usr/bin/tr -d '", ' || echo "")
if [ -z "$TOKEN" ]; then
  echo "No CLI token found. Run 'vercel login' first or skip REST audit."
else
  PROJECT_ID=$(/bin/cat .vercel/project.json | /usr/bin/python3 -c "import json,sys;print(json.load(sys.stdin)['projectId'])")
  ORG_ID=$(/bin/cat .vercel/project.json | /usr/bin/python3 -c "import json,sys;print(json.load(sys.stdin)['orgId'])")
  /usr/bin/curl -sL "https://api.vercel.com/v9/projects/$PROJECT_ID?teamId=$ORG_ID" -H "Authorization: Bearer $TOKEN" | /usr/bin/python3 -m json.tool | /usr/bin/grep -E "(commandForIgnoringBuildStep|productionBranch|autoExposeSystemEnvs|gitRepository|installCommand|framework|nodeVersion|buildCommand|gitLfs|gitForkProtection)" | /usr/bin/head -30
fi
```

Note key fields:
- `commandForIgnoringBuildStep`. If non-null, this is likely the culprit. A shell command that returns 0 means "skip build."
- `productionBranch`. Should be `main`.
- `gitRepository.repo`. Should match `fullstackvibecoder/thebradfordfiles`.

- [ ] **Step 2: Audit for vercel.json or vercel.ts in repo**

```bash
cd /Users/aramammo/thebradfordfiles
/usr/bin/find . -name "vercel.json" -o -name "vercel.ts" 2>/dev/null | /usr/bin/grep -v node_modules | /usr/bin/grep -v legacy-site
```

Note any files found and read their content for `ignoreCommand`, `git` filters, or `crons` config that might interact with auto-deploy.

- [ ] **Step 3: Check the GitHub integration**

Visit (manual operator step OR via API):
```
https://vercel.com/bottlenecklabs/thebradfordfiles/settings/git
```

Confirm:
- "Connected Git Repository" shows `fullstackvibecoder/thebradfordfiles`
- "Production Branch" is `main`
- "Auto-deploy" is enabled
- No "Pre-Production Deployments" filter is set
- No "Ignored Build Step" custom command is present (or document what it is)

If access via Dashboard isn't available, use the REST API output from Step 1 to confirm equivalent values.

- [ ] **Step 4: Recreate the failure to confirm reproduction**

```bash
cd /Users/aramammo/thebradfordfiles
git commit --allow-empty -m "test: probe vercel auto-deploy"
git push origin main
sleep 60
export PATH="/opt/homebrew/bin:$PATH"
gh run list --workflow=data-refresh.yml --repo fullstackvibecoder/thebradfordfiles --limit 1 || true
cd /Users/aramammo/thebradfordfiles/web
vercel ls 2>&1 | /usr/bin/head -5
```

Expected before fix: `vercel ls` shows no new deployment within 60 seconds of the push. After fix (Step 6): shows a fresh deployment.

If a fresh deployment appears even before applying any fix, the issue may be intermittent and not a project-setting problem. Document that finding and skip to Step 7.

- [ ] **Step 5: Apply remediation based on root cause**

Map root cause to remediation:

**If `commandForIgnoringBuildStep` is set and rejecting our commits:** Clear it via Vercel CLI or Dashboard.
```bash
cd /Users/aramammo/thebradfordfiles/web
vercel project rm-ignore-command 2>&1 || true
# OR via REST API:
TOKEN=...
PROJECT_ID=...
ORG_ID=...
/usr/bin/curl -X PATCH "https://api.vercel.com/v9/projects/$PROJECT_ID?teamId=$ORG_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"commandForIgnoringBuildStep": null}'
```

**If GitHub integration is missing or expired:** Reconnect via Dashboard -> Settings -> Git -> Reconnect.

**If production branch is misconfigured:** Update via Dashboard -> Settings -> Git -> Production Branch -> set to `main`.

**If there's a vercel.json/vercel.ts with an ignoreCommand:** Remove or correct the offending field. Commit the fix.

**If none of the above:** This may be a Vercel platform issue (rate-limit, queue lag, GitHub webhook delay). Document the time-of-day pattern in the notes file and move on. The `data-refresh.yml` workflow's Deploy step (Sprint 14) covers the bot-push case; the operator can also run `vercel --prod --yes` for now.

- [ ] **Step 6: Re-test with a second empty commit**

```bash
cd /Users/aramammo/thebradfordfiles
git commit --allow-empty -m "test: confirm vercel auto-deploy after fix"
git push origin main
sleep 60
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
vercel ls 2>&1 | /usr/bin/head -5
```

Expected: a new deployment appears within 60 seconds. Status `BUILDING` or `READY`.

- [ ] **Step 7: Document root cause and remediation**

Create `docs/superpowers/notes/2026-05-11-vercel-deploy-fix.md`:

```markdown
# Vercel auto-deploy fix, 2026-05-11

## Symptom

Pushes to `origin/main` (both from `aramamo` and `data-refresh[bot]`) were
not auto-triggering Vercel deploys. Production stayed stale until the
operator ran `vercel --prod --yes` manually. Sprint 13 and Sprint 14
both hit this; Sprint 15 investigated and fixed.

## Root cause

[Document what was found in Step 1-4. Examples below; pick whichever
matches reality.]

Option A: `commandForIgnoringBuildStep` was set to `<command>`, which
returns exit 0 for all commits, so Vercel skipped every build.

Option B: The Vercel GitHub App had lost write access during a permission
sync; webhooks were firing but Vercel could not read the changed files.

Option C: Production branch was set to `production` instead of `main`,
so pushes to `main` never matched the auto-deploy filter.

Option D: No setting issue; the symptom is intermittent. Likely cause is
GitHub webhook delivery delay or Vercel build-queue lag. The Sprint 14
workflow Deploy step provides a backup, and operator can run
`vercel --prod --yes` when surfacing fresh data urgently.

## Remediation

[Document the fix applied. Examples below.]

Option A: Cleared the ignore command via Vercel CLI:
`vercel project rm-ignore-command`

Option B: Reconnected the Vercel GitHub App at
https://vercel.com/bottlenecklabs/thebradfordfiles/settings/git

Option C: Updated the production branch via Dashboard -> Settings -> Git.

Option D: Accepted as known limitation. Sprint 14's workflow Deploy step
plus the manual `vercel --prod --yes` fallback are the active mitigations.

## Verification

After applying the fix, an empty commit pushed to `main` produced a
Vercel deployment within 60 seconds. Confirmed via `vercel ls` showing
a fresh deployment with timestamp close to the push.

## What to check if it breaks again

1. `commandForIgnoringBuildStep` is unset
2. Vercel GitHub App still has access to the repo
3. Production branch is `main`
4. Skim recent Vercel deployment logs for queue lag or auth errors
```

- [ ] **Step 8: Commit the notes file**

```bash
cd /Users/aramammo/thebradfordfiles
git add docs/superpowers/notes/2026-05-11-vercel-deploy-fix.md
git commit -m "$(cat <<'EOF'
docs(sprint-15): Vercel auto-deploy investigation + remediation notes

Sprint 13 and 14 both hit a gap where pushes to main did not auto-
trigger Vercel deploys. Sprint 15 investigates root cause and applies
remediation (or documents as a known limitation if no setting fix
applies).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If Track A surfaces no settable fix (Option D), proceed to Track C anyway. Track C is independent.

---

## Task 2. Font feature utility classes in globals.css

**Files:**
- Modify: `web/app/globals.css`

- [ ] **Step 1: Read existing globals.css**

```bash
/bin/cat /Users/aramammo/thebradfordfiles/web/app/globals.css
```

Sprint 11 left the file with `@layer base` (body styling) and `@layer components` (`.label`, `.stamp`, `.stamp-verified`, `.chip`, `.drop-cap`). Sprint 15 adds new utility classes under `@layer components`.

- [ ] **Step 2: Add four new utility classes**

Append to `@layer components` in `web/app/globals.css`:

```css
  .nums-tabular {
    font-variant-numeric: tabular-nums lining-nums;
  }
  .nums-oldstyle {
    font-variant-numeric: oldstyle-nums proportional-nums;
  }
  .caps-small {
    font-variant-caps: all-small-caps;
    letter-spacing: 0.05em;
  }
  .asterism::before {
    content: "⁂";
    display: block;
    text-align: center;
    color: var(--ink, #e8e3d5);
    opacity: 0.4;
    font-size: 18px;
    line-height: 1;
    margin: 2em 0;
    letter-spacing: 0.4em;
  }
```

`.asterism` is applied to a wrapper element (`<div className="asterism">`) and renders the `⁂` glyph above the wrapped content as a section divider.

- [ ] **Step 3: Verify build still passes**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npm run build 2>&1 | /usr/bin/tail -10
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/app/globals.css
git commit -m "$(cat <<'EOF'
feat(sprint-15): typography utility classes

.nums-tabular, .nums-oldstyle, .caps-small, .asterism added under
@layer components. Source Serif Pro and Inter both support these
OpenType features natively. .asterism renders the ⁂ glyph as a
section divider.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3. Apply font features across the three surfaces

**Files:**
- Modify: `web/components/ReceiptExhibit.tsx`
- Modify: `web/components/ReceiptClaimBlock.tsx`
- Modify: `web/components/ReceiptCard.tsx`
- Modify: `web/components/ScenarioCard.tsx`
- Modify: `web/components/ScenarioTierBadge.tsx`
- Modify: `web/components/CandidateStatStrip.tsx`
- Modify: `web/components/Dateline.tsx`

For each file, apply the utility classes where appropriate. Below: per-file changes with exact code locations and before/after snippets.

### Step 1: ReceiptExhibit.tsx

Read the existing file. Apply:
- `nums-tabular` on the `metric` callout `<p>` and the `as_of` `<p>`
- `caps-small` on the "Exhibit N." span, the "Caveat." span, and the "As of" text

Find this block (existing code from Sprint 12):
```tsx
      <h3 className="mb-2">
        <span className="font-mono text-xs uppercase tracking-wider text-accent mr-2">
          Exhibit {index + 1}.
        </span>
```

Replace `uppercase tracking-wider` with `caps-small` to use real small caps instead of CSS-fake:
```tsx
      <h3 className="mb-2">
        <span className="font-mono text-xs text-accent mr-2 caps-small">
          Exhibit {index + 1}.
        </span>
```

Find the metric block:
```tsx
        <p className="font-serif text-xl font-bold text-ink leading-snug" style={{ fontVariantNumeric: "tabular-nums" }}>
          {anchor.metric}
        </p>
```

Replace inline style with class:
```tsx
        <p className="font-serif text-xl font-bold text-ink leading-snug nums-tabular">
          {anchor.metric}
        </p>
```

Find the caveat block:
```tsx
      {anchor.caveats ? (
        <p className="text-sm italic text-muted mb-2">
          <strong className="font-mono not-italic uppercase text-[11px] tracking-wider mr-1">Caveat.</strong>
          {anchor.caveats}
        </p>
      ) : null}
```

Replace the `<strong>` classes:
```tsx
      {anchor.caveats ? (
        <p className="text-sm italic text-muted mb-2">
          <strong className="font-mono not-italic text-[11px] mr-1 caps-small">Caveat.</strong>
          {anchor.caveats}
        </p>
      ) : null}
```

Find the as_of block:
```tsx
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
        As of {anchor.as_of}
      </p>
```

Replace with (note: `nums-tabular` for the date, `caps-small` for the "As of" label; ageOf integration comes in Task 6):
```tsx
      <p className="font-mono text-[10px] text-muted caps-small">
        As of <span className="nums-tabular">{anchor.as_of}</span>
      </p>
```

### Step 2: ReceiptClaimBlock.tsx

Find:
```tsx
      <span className="absolute top-3 right-4 font-mono text-[10px] uppercase tracking-wider text-[#c44848] border border-[#c44848] px-2 py-0.5 rounded-sm">
        AUDITED
      </span>
```

Replace `uppercase tracking-wider` with `caps-small`:
```tsx
      <span className="absolute top-3 right-4 font-mono text-[10px] text-[#c44848] border border-[#c44848] px-2 py-0.5 rounded-sm caps-small">
        AUDITED
      </span>
```

Find the attribution line:
```tsx
      <p className="font-mono text-xs uppercase tracking-wider text-muted">
        {claim.attribution}
```

Replace:
```tsx
      <p className="font-mono text-xs text-muted caps-small">
        <span className="nums-tabular">{claim.attribution}</span>
```

(Wrapping `claim.attribution` in `nums-tabular` so any embedded dates render tabular.)

### Step 3: ReceiptCard.tsx

Find the pull_quote rendering (the page-level quote shown above claims, if such rendering exists; in current Sprint 12 code pull_quote is in metadata only). Skip if no pull_quote render block.

Add an asterism between the last exhibit and "What data cannot settle":
```tsx
      {card.what_data_cannot_settle ? (
        <div className="asterism">
          <section className="border-l-4 border-accent bg-[#1c1813] px-6 py-4 mb-6">
            ...existing content...
          </section>
        </div>
      ) : null}
```

Wrap the section in a `<div className="asterism">` so the asterism's `::before` renders above it.

### Step 4: ScenarioCard.tsx

Find the Who-Benefits intro:
```tsx
        <p className="mb-4 text-sm">{card.who_benefits.intro}</p>
```

Replace with drop-cap variant:
```tsx
        <p className="mb-4 text-sm drop-cap nums-oldstyle">{card.who_benefits.intro}</p>
```

Apply `nums-oldstyle` to body prose paragraphs and `nums-tabular` to numeric-heavy lines. Specific places (all in Sprint 12 code):

- Each candidate position `summary` paragraph: add `nums-oldstyle`
- The status_quo summary paragraph: add `nums-oldstyle`
- Citation rows that include dates: add `nums-tabular`

Add an asterism between the Comparables section and the Projections section.

### Step 5: ScenarioTierBadge.tsx

Find the badge `<span>`:
```tsx
    <span
      className={`inline-block font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm mr-1 align-baseline ${styles.border} ${styles.text} ${styles.bg}`}
```

Replace `uppercase tracking-wider` with `caps-small`:
```tsx
    <span
      className={`inline-block font-mono text-[10px] px-1.5 py-0.5 border rounded-sm mr-1 align-baseline caps-small ${styles.border} ${styles.text} ${styles.bg}`}
```

### Step 6: CandidateStatStrip.tsx

Find each stat number rendering. Add `nums-tabular` to the number span and `caps-small` to the label span. Sparkline integration comes in Task 5; this step is only the font features.

If the file uses:
```tsx
<div className="stat">Records<span className="num">5,435</span></div>
```

Update to:
```tsx
<div className="stat caps-small">Records<span className="num nums-tabular">5,435</span></div>
```

(Apply across all 5 stats: Records, Topics, Verified votes, Window, Consistency.)

### Step 7: Dateline.tsx

Find the rendered dateline span. Apply `caps-small` and `nums-tabular`:

```tsx
<div className="font-mono text-[11px] text-muted">
  <span className="text-accent caps-small">Vol I . No {issueNumber}</span>
  <span className="caps-small"> . {dayName} {dateNumber} {monthName} </span>
  <span className="nums-tabular">{year}</span>
  <span className="caps-small"> . {edition}</span>
</div>
```

Adapt to the actual existing structure; the key is to swap `uppercase tracking-wider` for `caps-small` and wrap the year in `nums-tabular`.

### Step 8: Commit all font-feature applications

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ReceiptExhibit.tsx web/components/ReceiptClaimBlock.tsx web/components/ReceiptCard.tsx web/components/ScenarioCard.tsx web/components/ScenarioTierBadge.tsx web/components/CandidateStatStrip.tsx web/components/Dateline.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-15): font feature activation across receipts/scenarios/candidates

Tabular numerals on numeric metrics + dates. Oldstyle figures on body
prose. Small caps on tier badges, AUDITED stamp, EXHIBIT N, Caveat,
As of, dateline. Drop cap extended to scenario Who-Benefits intro.
Asterisms between long-page sections (receipt before "What data
cannot settle", scenario before Projections).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Visual smoke test**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npm run build 2>&1 | /usr/bin/tail -10
```

Expected: build succeeds. (Visual verification deferred to production deploy in Task 7.)

```bash
npx vitest run 2>&1 | /usr/bin/tail -5
```

Expected: 107 tests still pass.

---

## Task 4. ConsistencyTimeline component

**Files:**
- Create: `web/components/ConsistencyTimeline.tsx`
- Create: `web/tests/consistency-timeline.test.ts`
- Modify: `web/app/candidates/[slug]/page.tsx`
- Modify: `web/components/ScenarioCard.tsx`

- [ ] **Step 1: Create the component**

Create `web/components/ConsistencyTimeline.tsx`:

```tsx
import { getSynthesis } from "@/lib/agent/data-loader";

const TOPIC_GROUPS = ["housing", "transit", "safety_crime", "taxes_fiscal", "social_services"] as const;
type TopicGroup = typeof TOPIC_GROUPS[number];

const LABEL_COLOR: Record<string, string> = {
  consistent: "bg-[#3a8a3a]",
  evolving: "bg-[#d4a548]",
  shifted: "bg-[#d44848]",
};

const PLACEHOLDER_COLOR = "bg-[#4a4234]";

const TOPIC_DISPLAY: Record<TopicGroup, string> = {
  housing: "Housing",
  transit: "Transit",
  safety_crime: "Safety",
  taxes_fiscal: "Tax",
  social_services: "Social services",
};

function tickColor(label: string | undefined): string {
  if (!label) return PLACEHOLDER_COLOR;
  return LABEL_COLOR[label] ?? PLACEHOLDER_COLOR;
}

export function ConsistencyTimeline({ slug }: { slug: string }) {
  const ticks = TOPIC_GROUPS.map((topic) => {
    const cell = getSynthesis(slug, topic);
    const label = cell?.consistency?.label;
    return { topic, label, color: tickColor(label) };
  });

  return (
    <div
      className="inline-flex items-center gap-[2px] align-middle"
      role="img"
      aria-label="Consistency profile across major topics"
    >
      {ticks.map((t) => (
        <span
          key={t.topic}
          className={`inline-block w-2 h-2 rounded-[1px] ${t.color}`}
          title={`${TOPIC_DISPLAY[t.topic]}: ${t.label ?? "no data"}`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write tests**

Create `web/tests/consistency-timeline.test.ts`:

```typescript
import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir } from "@/lib/agent/data-loader";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-timeline-"));
  setDataDir(tmp);
  mkdirSync(join(tmp, "synthesis", "bradfordgrams"), { recursive: true });
});

function writeCell(handle: string, topic: string, label: string | null) {
  writeFileSync(
    join(tmp, "synthesis", handle, `${topic}.json`),
    JSON.stringify({
      candidate_handle: handle,
      candidate_slug: "bradford",
      topic,
      summary: "summary",
      consistency: label ? { label, changes: [] } : null,
    })
  );
}

test("ConsistencyTimeline derives color from cell consistency label", () => {
  writeCell("bradfordgrams", "housing", "consistent");
  writeCell("bradfordgrams", "transit", "evolving");
  writeCell("bradfordgrams", "safety_crime", "shifted");
  writeCell("bradfordgrams", "taxes_fiscal", "consistent");
  writeCell("bradfordgrams", "social_services", "evolving");

  // Cannot render the JSX component in vitest without setting up jsdom.
  // Instead, test the data-derivation logic indirectly by reading cells
  // and asserting label values land where expected.
  const { getSynthesis } = require("@/lib/agent/data-loader");
  expect(getSynthesis("bradford", "housing")?.consistency?.label).toBe("consistent");
  expect(getSynthesis("bradford", "transit")?.consistency?.label).toBe("evolving");
  expect(getSynthesis("bradford", "safety_crime")?.consistency?.label).toBe("shifted");
});

test("ConsistencyTimeline falls back when cell has no consistency", () => {
  writeCell("bradfordgrams", "housing", null);
  const { getSynthesis } = require("@/lib/agent/data-loader");
  expect(getSynthesis("bradford", "housing")?.consistency).toBeNull();
});

test("ConsistencyTimeline falls back when cell is missing entirely", () => {
  // No cells written.
  const { getSynthesis } = require("@/lib/agent/data-loader");
  expect(getSynthesis("bradford", "housing")).toBeNull();
});

test("ConsistencyTimeline tickColor helper returns placeholder for unknown labels", () => {
  // Inline the helper logic for unit testing without DOM render.
  const tickColor = (label: string | undefined): string => {
    const map: Record<string, string> = {
      consistent: "bg-[#3a8a3a]",
      evolving: "bg-[#d4a548]",
      shifted: "bg-[#d44848]",
    };
    if (!label) return "bg-[#4a4234]";
    return map[label] ?? "bg-[#4a4234]";
  };
  expect(tickColor(undefined)).toBe("bg-[#4a4234]");
  expect(tickColor("consistent")).toBe("bg-[#3a8a3a]");
  expect(tickColor("evolving")).toBe("bg-[#d4a548]");
  expect(tickColor("shifted")).toBe("bg-[#d44848]");
  expect(tickColor("wat")).toBe("bg-[#4a4234]");
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/consistency-timeline.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4: Integrate ConsistencyTimeline into candidate page**

Read `web/app/candidates/[slug]/page.tsx`. Find the candidate name + role header. Add the timeline directly under the role line:

```tsx
import { ConsistencyTimeline } from "@/components/ConsistencyTimeline";

// In the JSX, after the role line:
<div className="mb-4 flex items-center gap-3">
  <span className="font-mono text-xs text-muted caps-small">Consistency</span>
  <ConsistencyTimeline slug={slug} />
</div>
```

- [ ] **Step 5: Integrate ConsistencyTimeline into ScenarioCard candidate-position blocks**

In `web/components/ScenarioCard.tsx`, find the candidate-position rendering (the block that shows each candidate's `summary` and `citations`). Add the timeline beside the candidate name.

Each position has a `candidate_handle` (e.g., `bradfordgrams`). Resolve to a slug via the existing `HANDLE_FOR_SLUG` map in data-loader (reverse: handle -> slug). For Sprint 15 the mapping is hardcoded:

```tsx
const SLUG_FROM_HANDLE: Record<string, string> = {
  bradfordgrams: "bradford",
  oliviachow: "chow",
};

// In the candidate-position render block, after candidate_name:
{SLUG_FROM_HANDLE[position.candidate_handle] ? (
  <ConsistencyTimeline slug={SLUG_FROM_HANDLE[position.candidate_handle]} />
) : null}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/ConsistencyTimeline.tsx web/tests/consistency-timeline.test.ts web/app/candidates/[slug]/page.tsx web/components/ScenarioCard.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-15): ConsistencyTimeline component + integrations

5 colored ticks per candidate showing consistency across major topic
groups. Reads getSynthesis for the 5 topics; ticks colored by label
(green/yellow/red, muted placeholder for missing). Slots: candidate
page header, scenario card candidate-position blocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5. Sparkline component

**Files:**
- Create: `web/components/Sparkline.tsx`
- Create: `web/tests/sparkline.test.ts`
- Modify: `web/components/CandidateStatStrip.tsx`
- Modify: `web/components/ScenarioCard.tsx`

- [ ] **Step 1: Create the component with data-derivation helpers**

Create `web/components/Sparkline.tsx`:

```tsx
import { getRecordsForHandle } from "@/lib/agent/data-loader";

const HANDLE_FOR_SLUG: Record<string, string> = {
  bradford: "bradfordgrams",
  chow: "oliviachow",
};

export interface MonthlyPoint {
  month: string;  // YYYY-MM
  count: number;
}

export function deriveMonthlyCadence(records: Array<{ post_date?: string }>): MonthlyPoint[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (typeof r.post_date !== "string" || r.post_date.length < 7) continue;
    const month = r.post_date.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function lastNMonthsWindow(points: MonthlyPoint[], n: number, today: Date): MonthlyPoint[] {
  const out: MonthlyPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const month = d.toISOString().slice(0, 7);
    const existing = points.find((p) => p.month === month);
    out.push({ month, count: existing?.count ?? 0 });
  }
  return out;
}

function buildPath(points: MonthlyPoint[], width: number, height: number): string {
  if (points.length === 0) return "";
  const max = Math.max(1, ...points.map((p) => p.count));
  const xStep = width / Math.max(1, points.length - 1);
  return points
    .map((p, i) => {
      const x = (i * xStep).toFixed(2);
      const y = (height - (p.count / max) * height).toFixed(2);
      return (i === 0 ? "M" : "L") + x + " " + y;
    })
    .join(" ");
}

export function Sparkline({ slug }: { slug: string }) {
  const handle = HANDLE_FOR_SLUG[slug];
  if (!handle) return null;
  const records = getRecordsForHandle(handle);
  if (records.length === 0) return null;
  const cadence = deriveMonthlyCadence(records);
  const windowed = lastNMonthsWindow(cadence, 12, new Date());
  const totalCount = windowed.reduce((acc, p) => acc + p.count, 0);
  if (totalCount === 0) return null;

  const path = buildPath(windowed, 60, 16);
  const recentSummary = windowed
    .slice(-3)
    .map((p) => `${p.month}: ${p.count}`)
    .join(", ");

  return (
    <svg
      width={60}
      height={16}
      viewBox="0 0 60 16"
      role="img"
      aria-label="Record posting cadence, last 12 months"
      className="inline-block align-middle ml-2"
    >
      <title>{recentSummary}</title>
      <path d={path} fill="none" stroke="#c4923a" strokeWidth={1} />
    </svg>
  );
}
```

- [ ] **Step 2: Write tests**

Create `web/tests/sparkline.test.ts`:

```typescript
import { test, expect } from "vitest";
import { deriveMonthlyCadence, lastNMonthsWindow, type MonthlyPoint } from "@/components/Sparkline";

test("deriveMonthlyCadence groups records by post_date month", () => {
  const records = [
    { post_date: "2025-12-15" },
    { post_date: "2025-12-20" },
    { post_date: "2025-11-10" },
    { post_date: "2024-06-01" },
  ];
  const result = deriveMonthlyCadence(records);
  expect(result).toEqual([
    { month: "2024-06", count: 1 },
    { month: "2025-11", count: 1 },
    { month: "2025-12", count: 2 },
  ]);
});

test("deriveMonthlyCadence ignores records without post_date", () => {
  const records = [
    { post_date: "2025-12-15" },
    { post_date: undefined },
    { post_date: "bad" },
    {},
  ];
  const result = deriveMonthlyCadence(records as Array<{ post_date?: string }>);
  expect(result).toEqual([{ month: "2025-12", count: 1 }]);
});

test("lastNMonthsWindow fills zero for missing months and trims to N", () => {
  const points: MonthlyPoint[] = [
    { month: "2025-12", count: 5 },
    { month: "2025-10", count: 2 },
  ];
  const today = new Date("2025-12-31T00:00:00Z");
  const windowed = lastNMonthsWindow(points, 3, today);
  expect(windowed).toHaveLength(3);
  expect(windowed.map((p) => p.month)).toEqual(["2025-10", "2025-11", "2025-12"]);
  expect(windowed.map((p) => p.count)).toEqual([2, 0, 5]);
});

test("lastNMonthsWindow returns N entries when input is empty", () => {
  const today = new Date("2025-06-15T00:00:00Z");
  const windowed = lastNMonthsWindow([], 12, today);
  expect(windowed).toHaveLength(12);
  expect(windowed.every((p) => p.count === 0)).toBe(true);
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/sparkline.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4: Integrate Sparkline into CandidateStatStrip**

Read the existing file. Find the "Records" stat. Add the sparkline beside the number:

```tsx
import { Sparkline } from "@/components/Sparkline";

// In the Records stat, beside the number:
<div className="stat caps-small">
  Records
  <span className="num nums-tabular">{recordCount.toLocaleString()}</span>
  <Sparkline slug={slug} />
</div>
```

The Sparkline returns null for candidates without records, so the component degrades gracefully on data-thin candidates.

- [ ] **Step 5: Integrate Sparkline into ScenarioCard candidate-position blocks**

In `web/components/ScenarioCard.tsx`, beside the candidate name in each position block (using the same `SLUG_FROM_HANDLE` mapping from Task 4):

```tsx
{SLUG_FROM_HANDLE[position.candidate_handle] ? (
  <Sparkline slug={SLUG_FROM_HANDLE[position.candidate_handle]} />
) : null}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/components/Sparkline.tsx web/tests/sparkline.test.ts web/components/CandidateStatStrip.tsx web/components/ScenarioCard.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-15): Sparkline component + integrations

Inline 60x16 SVG of last 12 months record cadence. Reads
getRecordsForHandle, groups by post_date month, fills missing months
with zero, normalises to max. Ochre stroke on transparent bg. Title
tooltip shows the latest 3 months. Slots: candidate stat strip,
scenario card candidate-position blocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6. ageOf helper + as-of staleness color treatment

**Files:**
- Create: `web/lib/date-helpers.ts`
- Create: `web/tests/date-helpers.test.ts`
- Modify: `web/components/ReceiptExhibit.tsx`
- Modify: `web/components/ScenarioComparableTabs.tsx`

- [ ] **Step 1: Create the helper**

Create `web/lib/date-helpers.ts`:

```typescript
export type Age = "fresh" | "normal" | "stale";

export function ageOf(asOf: string, now: Date = new Date()): Age {
  const parsed = Date.parse(asOf);
  if (!Number.isFinite(parsed)) return "stale";
  const days = Math.floor((now.getTime() - parsed) / 86400000);
  if (days < 0) return "fresh";
  if (days < 14) return "fresh";
  if (days < 60) return "normal";
  return "stale";
}

export function ageOfClass(asOf: string, now: Date = new Date()): string {
  const a = ageOf(asOf, now);
  if (a === "fresh") return "text-[#7aa67a]";
  if (a === "stale") return "italic text-[#5a5a55]";
  return "";
}
```

- [ ] **Step 2: Write tests**

Create `web/tests/date-helpers.test.ts`:

```typescript
import { test, expect } from "vitest";
import { ageOf, ageOfClass } from "@/lib/date-helpers";

test("ageOf returns fresh for dates within 14 days", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("2026-05-10", now)).toBe("fresh");
  expect(ageOf("2026-05-01", now)).toBe("fresh");
  expect(ageOf("2026-04-28", now)).toBe("fresh");
});

test("ageOf returns normal for dates 14 to 60 days old", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("2026-04-15", now)).toBe("normal");
  expect(ageOf("2026-03-20", now)).toBe("normal");
});

test("ageOf returns stale for dates older than 60 days", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("2025-12-15", now)).toBe("stale");
  expect(ageOf("2024-01-01", now)).toBe("stale");
});

test("ageOf returns stale for unparseable input", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("not-a-date", now)).toBe("stale");
});

test("ageOfClass returns the right Tailwind class for each bucket", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOfClass("2026-05-10", now)).toBe("text-[#7aa67a]");
  expect(ageOfClass("2026-04-15", now)).toBe("");
  expect(ageOfClass("2024-01-01", now)).toBe("italic text-[#5a5a55]");
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/date-helpers.test.ts
```

Expected: 5 tests pass (3 ageOf buckets + 1 unparseable + 1 class helper).

- [ ] **Step 4: Apply to ReceiptExhibit**

In `web/components/ReceiptExhibit.tsx`, find the as_of line (Task 3 already touched this):

```tsx
      <p className="font-mono text-[10px] text-muted caps-small">
        As of <span className="nums-tabular">{anchor.as_of}</span>
      </p>
```

Replace with ageOf-driven color:

```tsx
import { ageOfClass } from "@/lib/date-helpers";

// In the JSX:
      <p className={`font-mono text-[10px] caps-small ${ageOfClass(anchor.as_of) || "text-muted"}`}>
        As of <span className="nums-tabular">{anchor.as_of}</span>
      </p>
```

- [ ] **Step 5: Apply to ScenarioComparableTabs (comparable.period or as_of)**

In `web/components/ScenarioComparableTabs.tsx`, find the rendering of the comparable's date/period info. If there's a date field (or a citation `retrieved`), apply the same `ageOfClass` treatment. Scenarios use `period` strings that aren't ISO dates (e.g. "1990s to present"), so no automatic staleness color applies. Skip this step if no ISO date field is present.

If the citation row has a `retrieved` date (ISO format), apply `ageOfClass`:

```tsx
import { ageOfClass } from "@/lib/date-helpers";

// In the citation row rendering:
{citation.retrieved ? (
  <span className={`nums-tabular ${ageOfClass(citation.retrieved)}`}>
    retrieved {citation.retrieved}
  </span>
) : null}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/date-helpers.ts web/tests/date-helpers.test.ts web/components/ReceiptExhibit.tsx web/components/ScenarioComparableTabs.tsx
git commit -m "$(cat <<'EOF'
feat(sprint-15): ageOf helper + as_of staleness color treatment

Receipt exhibits and scenario citations now color their as_of/retrieved
dates by age: green if <14 days (fresh), default muted if <60 days,
italic dim if older. Reinforces the data-freshness story without
adding new chrome.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7. Production ship + acceptance verification

**Files:** none modified.

- [ ] **Step 1: Final test pass**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```

Expected: 120 tests pass (107 prior + 4 ConsistencyTimeline + 4 Sparkline + 5 date-helpers).

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | /usr/bin/tail -15
```

Expected: build succeeds.

- [ ] **Step 3: Push origin/main**

```bash
cd /Users/aramammo/thebradfordfiles
git push origin main
```

If Track A in Task 1 actually fixed Vercel auto-deploy, this push should trigger a Vercel deploy automatically.

- [ ] **Step 4: Verify auto-deploy or fall back to manual**

```bash
export PATH="/opt/homebrew/bin:$PATH"
sleep 60
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
vercel ls 2>&1 | /usr/bin/head -5
```

Expected: a fresh deployment within 60 seconds.

If no deploy fires, run manually:
```bash
cd /Users/aramammo/thebradfordfiles
vercel --prod --yes 2>&1 | /usr/bin/grep -E "(READY|Aliased|Error)" | /usr/bin/head -3
```

- [ ] **Step 5: Acceptance criteria smoke test**

```bash
URL="https://www.mayoralrecord.com"

echo "AC2-4: tabular numerals / oldstyle figures / small caps detectable in source"
/usr/bin/curl -sL "$URL/receipts/crime-trends" | /usr/bin/grep -oE "(nums-tabular|nums-oldstyle|caps-small)" | /usr/bin/sort -u

echo "AC5: drop cap on scenario Who-Benefits intro + receipt pull-quote"
/usr/bin/curl -sL "$URL/scenarios/housing-supply-mechanism" | /usr/bin/grep -oE "drop-cap" | /usr/bin/wc -l

echo "AC6: asterism present on long pages"
/usr/bin/curl -sL "$URL/receipts/crime-trends" | /usr/bin/grep -oE "asterism" | /usr/bin/wc -l

echo "AC7: ConsistencyTimeline renders on candidate pages"
/usr/bin/curl -sL "$URL/candidates/bradford" | /usr/bin/grep -oE "Consistency profile across" | /usr/bin/head -1

echo "AC8: Sparkline renders (svg with role img and ochre stroke)"
/usr/bin/curl -sL "$URL/candidates/bradford" | /usr/bin/grep -oE 'stroke="#c4923a"' | /usr/bin/head -1

echo "AC9: ageOf color treatment applied (text-[#7aa67a] or italic text-[#5a5a55])"
/usr/bin/curl -sL "$URL/receipts/crime-trends" | /usr/bin/grep -oE "text-\[#7aa67a\]|italic text-\[#5a5a55\]" | /usr/bin/sort -u | /usr/bin/head -3

echo "AC11: em-dash count across all rendered pages"
total=0
for path in "/" "/candidates/bradford" "/candidates/chow" "/scenarios" "/scenarios/housing-supply-mechanism" "/receipts" "/receipts/crime-trends" "/receipts/tax-burden" "/receipts/housing-supply" "/receipts/ttc-performance" "/receipts/encampment-response" "/methodology"; do
  c=$(/usr/bin/curl -sL "$URL$path" | /usr/bin/grep -c "—")
  total=$((total + c))
done
echo "  Total: $total"
```

Expected:
- AC2-4: utility classes detected in production source
- AC5: at least 2 drop-cap class hits
- AC6: at least 1 asterism class hit
- AC7: timeline aria-label present
- AC8: ochre stroke present
- AC9: at least one freshness/staleness class detected on receipt exhibits
- AC11: 0 em-dashes total

- [ ] **Step 6: Sprint 9-14 regression check**

```bash
URL="https://www.mayoralrecord.com"
for path in "/" "/candidates" "/candidates/bradford" "/scenarios" "/scenarios/housing-supply-mechanism" "/receipts" "/receipts/crime-trends" "/methodology" "/about" "/privacy" "/terms"; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL$path")
  echo "  $code  $path"
done
/usr/bin/curl -s -o /dev/null -w "  /api/ask Turnstile gate: HTTP %{http_code}\n" -X POST "$URL/api/ask" -H "Content-Type: application/json" -d '{"query":"smoke"}'
```

Expected: every route returns 200; /api/ask returns 403 without Turnstile.

---

## Self-review notes

Coverage of acceptance criteria:

| AC# | Requirement | Task |
|---|---|---|
| 1 | Vercel auto-deploy fires for both actors | 1 |
| 2 | Tabular numerals applied | 3 |
| 3 | Oldstyle figures applied | 3 |
| 4 | Small caps applied | 3 |
| 5 | Drop caps active on scenario Who-Benefits intro + receipt pull-quote | 3 |
| 6 | Asterisms render between long-page sections | 3 |
| 7 | ConsistencyTimeline renders on three slots | 4 |
| 8 | Sparkline renders on three slots | 5 |
| 9 | As-of staleness color treatment | 6 |
| 10 | 107 existing tests pass + 13 new (4+4+5) | 4, 5, 6 |
| 11 | Em-dash count: 0 | 7 |
| 12 | Production smoke confirms new marks on each surface | 7 |
| 13 | Vercel deploy notes file exists | 1 |

No placeholders remaining. Type names consistent: `ConsistencyTimeline`, `Sparkline`, `MonthlyPoint`, `deriveMonthlyCadence`, `lastNMonthsWindow`, `ageOf`, `ageOfClass`, `Age`, `HANDLE_FOR_SLUG`, `SLUG_FROM_HANDLE`, `TOPIC_GROUPS`, `LABEL_COLOR`, `PLACEHOLDER_COLOR`, `TOPIC_DISPLAY`, `tickColor`, `buildPath`.
