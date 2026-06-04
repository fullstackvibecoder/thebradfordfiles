# Sprint 13. Auto-pulled Data Refresh

**Date:** 2026-05-07
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 10 (scenarios), Sprint 11 (warm-dark aesthetic), Sprint 12 (receipts).

## Goal

Receipt and scenario data anchors get fresh values from Toronto Open Data weekly via a GitHub Action cron. Eliminate the editorial cost of manual refresh and the credibility cost of stale `as_of` markers.

## Motivation

Sprint 12 shipped 5 receipt cards with hand-curated data anchors against Toronto Open Data. Each anchor carries an `as_of` date and a `metric` string. The editorial value of a receipt depends on the metric being current; a card titled "Crime trends, 2018 to 2025" loses force when its anchor data is six months old.

Today, freshness depends on the operator manually re-running deep research and editing JSON. That is editorial overhead the format does not justify when the underlying data is published on a regular cadence by Toronto Open Data CKAN endpoints.

Sprint 13 closes that gap mechanically. A weekly GitHub Action runs a Node script that reads every receipt and scenario JSON, finds anchors that opted in to auto-pull (have a `pull_config` field), fetches the latest values from a typed source registry, updates the `metric` and `as_of` fields in place, commits with a deterministic message, and pushes. Vercel auto-deploys on the push. Editorial fields (`finding`, `caveats`, `sub_claim`, `pull_quote`) are never touched. Failures preserve existing data and surface as a single GitHub issue per run.

## Non-goals

- Non-CKAN data sources. StatCan API, direct CSV/JSON URLs, and HTML scraping are explicitly Sprint 14 or later. CKAN-only at launch.
- Slack, email, or other external notifications. Failures land in GitHub issues; that is the only notification surface.
- PR-based diff review. The cron commits straight to main. The diff is visible in the commit history.
- Auto-close of GitHub issues when failures resolve. Operator closes manually after fix.
- Operator-triggered refresh button in `/admin/`. Manual triggers happen via `gh workflow run` for now.
- Backfilling historical values. The cron updates anchors to current values only. Historical context lives in the editorial framing.
- Modifying editorial fields (`finding`, `caveats`, `sub_claim`, `pull_quote`, `topic`, `topic_short`, `claims`) under any circumstances. Schema-enforced.
- Reformatting metric strings. Authors control the format string. The cron only substitutes `{value}` and similar placeholders.

## Architecture

### New code surfaces

- `web/lib/data-sources.ts`. Typed named-source registry. Maps friendly names like `tps_auto_theft_annual` to a CKAN domain + resource_id + parameter-typed fetch function. Single source of truth for which datasets the cron knows about.
- `scripts/refresh-data.ts`. Node script. Reads all JSON files in `web/public/data/receipts/` and `web/public/data/scenarios/`. For each anchor with `pull_config`, calls the registered fetcher. On success, updates `metric` and `as_of` in place. On failure, appends to a failures array. After all files processed, writes JSON files that changed and emits a markdown report of failures (read by the workflow).
- `scripts/lib/ckan.ts`. Thin CKAN client. Functions: `datastoreSearch(domain, resource_id, filters)` and `resourceShow(domain, resource_id)` (for last-modified date). Used by the registry's fetch functions.
- `.github/workflows/data-refresh.yml`. GitHub Action workflow. Cron schedule. Steps: checkout, setup Node, install, run script, commit on diff, push, open or update GitHub issue on failure.
- `web/lib/receipt-types.ts`. Modified to add optional `pull_config?` field on `DataAnchor`. Schema enforces that `pull_config.source` is non-empty and `format` is non-empty.

### Schema delta

```typescript
// web/lib/receipt-types.ts (additions)

export const PullConfigSchema = z.object({
  source: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  format: z.string().min(1),
});
export type PullConfig = z.infer<typeof PullConfigSchema>;

// DataAnchorSchema extended:
export const DataAnchorSchema = z.object({
  sub_section_anchor: z.string().regex(/^[a-z0-9-]+$/),
  sub_claim: z.string().min(1),
  finding: z.string().min(1),
  metric: z.string().min(1),
  source: CitationSchema,
  caveats: z.string().optional(),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pull_config: PullConfigSchema.optional(),
});
```

### Registry shape

```typescript
// web/lib/data-sources.ts

export interface FetchResult {
  value: string | number;
  as_of: string;
}

export interface NamedSource {
  domain: "open.toronto.ca" | "data.torontopolice.on.ca";
  resource_id: string;
  description: string;
  fetch: (params: Record<string, string | number>) => Promise<FetchResult>;
}

export const NAMED_SOURCES: Record<string, NamedSource> = {
  // entries listed in "Initial source coverage" below
};

export function lookupSource(name: string): NamedSource | null {
  return NAMED_SOURCES[name] ?? null;
}
```

### Data flow

1. GitHub Action cron fires weekly (Sunday 06:00 UTC).
2. Action checks out main, installs deps, runs `npm run refresh-data` (a script in `web/package.json` that invokes `node scripts/refresh-data.ts`).
3. Script reads every JSON file under `web/public/data/receipts/` and `web/public/data/scenarios/`.
4. For each `DataAnchor` with a `pull_config`:
   - Resolves `pull_config.source` via the registry.
   - Calls the source's `fetch(params)`.
   - On success: substitutes `{value}` in `pull_config.format` and writes the result back to `anchor.metric`. Sets `anchor.as_of` to the fetched `as_of`.
   - On failure: appends `{ file, anchor_id, source, error_message, attempted_at }` to a failures array. Anchor is unchanged.
5. After all anchors processed, script writes JSON files that changed and prints a summary:
   - `N anchors updated, M unchanged, K failed`
6. If any anchors changed, action commits the JSON file changes with message `data: weekly refresh YYYY-MM-DD (N anchors updated)` and pushes.
7. If failures array is non-empty, action opens (or appends to today's) GitHub issue titled `Data refresh failures YYYY-MM-DD` with the failure details rendered as a markdown table.
8. Vercel auto-deploys on push. New anchor values surface on the next request.

## Validation invariants

Enforced by Zod at JSON load time. Failed validation blocks the build, exactly as in Sprints 10 and 12.

- `pull_config` is optional. When absent, anchor is curated-only (cron ignores).
- When `pull_config` is present:
  - `pull_config.source` is a non-empty string.
  - `pull_config.format` is a non-empty string. Must contain at least one substitution placeholder (e.g., `{value}`).
  - `pull_config.params` is optional; when present, all values are strings or numbers.
- Existing receipt and scenario JSON files without `pull_config` continue to validate (backward-compatible delta).
- The cron script verifies `pull_config.source` exists in the registry at runtime; an unknown source is a per-anchor failure (not a script-level abort).

## Registry: initial source coverage

At launch, the registry covers Toronto Open Data sources used by the existing receipt corpus. Anchors that need non-CKAN sources (StatCan, TTC monthly PDFs, IMFG papers) stay curated-only and are slated for Sprint 14.

| Registry name | Domain | Resource | Used by anchors |
|---|---|---|---|
| `tps_auto_theft_annual` | data.torontopolice.on.ca | TPS Auto Theft dataset | crime-trends:auto-theft-trend |
| `tps_homicide_annual` | data.torontopolice.on.ca | TPS Homicide dataset | crime-trends:homicide-trend |
| `tps_shooting_incidents_annual` | data.torontopolice.on.ca | TPS Shooting Incidents dataset | crime-trends:shootings-trend |
| `tps_mci_annual` | data.torontopolice.on.ca | TPS Major Crime Indicators dataset | crime-trends:mci-aggregate |
| `toronto_building_permits_annual` | open.toronto.ca | Building Permits Active dataset | housing-supply:permits |
| `toronto_open_door_completions_annual` | open.toronto.ca | Open Door Affordable Housing program reports (CKAN if available) | housing-supply:open-door-program |
| `ttc_monthly_ridership` | open.toronto.ca | TTC monthly performance dataset (if CKAN-published) | ttc-performance:ridership-recovery |
| `streets_to_homes_placements_annual` | open.toronto.ca | Streets to Homes program data | encampment-response:streets-to-homes-outputs |

Each registry entry has a typed `fetch(params)` function. The function calls CKAN's `datastore_search` action, applies the params as filters, picks the right field, and returns `{ value, as_of }` where `as_of` is the resource's `last_modified` from `resource_show` (or the published year for annual datasets).

If a CKAN endpoint a registered name points to is unavailable on launch day (e.g., Open Door is published as PDF only), that registry entry is omitted from the launch and the corresponding anchor stays curated-only.

## GitHub Action workflow

```yaml
# .github/workflows/data-refresh.yml

name: Weekly data refresh
on:
  schedule:
    - cron: "0 6 * * 0"   # Sunday 06:00 UTC, Saturday ~01:00 Toronto
  workflow_dispatch: {}    # manual trigger via gh workflow run

permissions:
  contents: write          # to commit + push
  issues: write            # to open failure issues

jobs:
  refresh:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - id: refresh
        run: npm run refresh-data
        env:
          NODE_OPTIONS: --enable-source-maps
      - name: Commit changes
        run: |
          cd ..
          git config user.name "data-refresh[bot]"
          git config user.email "actions@github.com"
          git add web/public/data/receipts/ web/public/data/scenarios/
          if git diff --staged --quiet; then
            echo "No changes."
          else
            DATE=$(date -u +%Y-%m-%d)
            UPDATED=$(cat web/.refresh-summary.json | jq -r .updated_count)
            git commit -m "data: weekly refresh ${DATE} (${UPDATED} anchors updated)"
            git push
          fi
      - name: Open failure issue
        if: always()
        run: node scripts/post-refresh-issue.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        working-directory: ${{ github.workspace }}
```

## Failure handling

When `scripts/refresh-data.ts` finishes, it writes a summary file at `web/.refresh-summary.json` with shape:

```json
{
  "run_at": "2026-05-10T06:00:00Z",
  "updated_count": 7,
  "unchanged_count": 12,
  "failures": [
    {
      "file": "web/public/data/receipts/crime-trends.json",
      "anchor_id": "auto-theft-trend",
      "source": "tps_auto_theft_annual",
      "error": "CKAN datastore_search returned 503 after 3 retries",
      "attempted_at": "2026-05-10T06:00:01Z",
      "resource_url": "https://data.torontopolice.on.ca/datasets/..."
    }
  ]
}
```

A separate Node script `scripts/post-refresh-issue.mjs` reads this summary and, if `failures.length > 0`, creates or updates a GitHub issue:

- Title: `Data refresh failures YYYY-MM-DD`
- Body: a markdown table of the failures with file, anchor, source, error, attempted-at, resource URL.
- Label: `data-refresh-failure`
- Issue is created fresh per run (not appended to old issues). Old issues are not auto-closed.

The script uses the `gh` CLI or the GitHub REST API via `GITHUB_TOKEN`.

## Editorial guardrails (encoded in script + schema)

1. The cron NEVER touches: `slug`, `topic`, `topic_short`, `pull_quote`, `claims`, `receipt.intro`, `what_data_cannot_settle`, `comparables`, `meta.last_reviewed`, `meta.next_review`, `sub_claim`, `finding`, `caveats`, `source.tier`, `source.label`, `source.url`. The script writes ONLY `metric` and `as_of`.
2. Anchors without `pull_config` are ignored. The default state of any new anchor is curated-only.
3. The script does not insert `pull_config` into any anchor. Authors add `pull_config` manually when they want auto-pull.
4. The format string is author-controlled. The script substitutes `{value}` and any other `{key}` placeholders that match `pull_config.params` keys, but does not invent or paraphrase prose.
5. On any per-anchor failure, the existing `metric` and `as_of` are preserved. A failure cannot regress data freshness backwards.
6. The cron's commit message follows the deterministic pattern; failures DO NOT block the commit (partial-success semantics).

## Acceptance criteria

1. `web/lib/data-sources.ts` exports a `NAMED_SOURCES` registry with at least 5 named sources whose `fetch` function returns valid `FetchResult` against live CKAN endpoints.
2. `web/lib/receipt-types.ts` (and `scenario-types.ts` if scenarios opt in) extends `DataAnchor` with optional `pull_config` field. Existing JSON without `pull_config` validates unchanged.
3. `scripts/refresh-data.ts` reads every `web/public/data/receipts/*.json` and `web/public/data/scenarios/*.json`, finds anchors with `pull_config`, calls the registered fetcher, and updates `metric` and `as_of` in place.
4. The script preserves existing `metric` and `as_of` on per-anchor failure.
5. The script writes `web/.refresh-summary.json` with `run_at`, `updated_count`, `unchanged_count`, `failures[]`.
6. `.github/workflows/data-refresh.yml` runs on cron `0 6 * * 0` and on `workflow_dispatch`. Has `contents: write` and `issues: write` permissions.
7. The workflow commits changed JSON files with message `data: weekly refresh YYYY-MM-DD (N anchors updated)`, pushes, and opens a GitHub issue on failure.
8. At least 5 anchors in the receipt corpus opt in to `pull_config` at launch (one per receipt card where a CKAN source is available).
9. New vitest tests cover: registry lookup hits and misses, anchor update from a mocked successful fetch, anchor preservation from a mocked failed fetch, format-string substitution.
10. Existing 75 vitest tests continue to pass (the schema delta is backward-compatible).
11. No em dashes anywhere.
12. Workflow can be manually triggered via `gh workflow run data-refresh` for verification before the first scheduled run.
13. After the first manual run, observe a commit (if any anchor data changed) and a closed-state of zero failure issues (if all fetches succeeded).

## Sprint sequencing

- Phase 1: schema delta + registry skeleton + tests. Validators reject malformed `pull_config` and accept anchors without it.
- Phase 2: CKAN client (`scripts/lib/ckan.ts`) with retry + timeout + typed result.
- Phase 3: `scripts/refresh-data.ts` reading both receipt and scenario JSON, calling registry, writing summary file.
- Phase 4: At least 5 named sources implemented with real CKAN fetch logic. Live-tested against TPS auto theft, TPS homicide, building permits, plus 2 more.
- Phase 5: Opt 5 receipt anchors in to `pull_config` (one per card). Test the script end-to-end on real data.
- Phase 6: GitHub Action workflow + `scripts/post-refresh-issue.mjs`. Manual trigger via `gh workflow run` to validate the run-and-commit-and-push flow.
- Phase 7: Production deploy + acceptance criteria verification. First scheduled run lands on the next Sunday after deploy.

## Risks and mitigations

- **CKAN endpoint instability.** Toronto Open Data has occasional 5xx outages and resource_id renames. Mitigation: per-anchor retry (3 retries with exponential backoff) inside each fetcher; on persistent failure, anchor preserved + GitHub issue. Cron runs weekly so a one-time outage just means data is one week older.
- **Schema drift in CKAN datasets.** A field rename or type change breaks the fetcher. Mitigation: each fetcher is typed and has its own assertion ("expects column 'count' of type number"); on assertion failure, throw a clear error to the issue. The next manual fix is one line in the registry.
- **Over-pulling.** Cron runs hit Toronto Open Data weekly. With ~10 sources and weekly cadence, that is 10 requests per week. Negligible load. Mitigation: respect any cache headers; do not parallelise aggressively.
- **Editorial drift via auto-pulls.** The format string substitution means the metric prose stays editor-authored. The risk is that an editor's format string assumes a value type (number) and the source returns a different type (string). Mitigation: each fetcher returns typed result; format substitution wraps the value with `String()` to be safe.
- **Stale `caveats` after data updates.** The data may move enough that the editorial caveat no longer applies. Mitigation: cron updates `as_of` so reviewers can see when data moved without the caveat changing. Quarterly editorial review (using the existing `meta.next_review` cadence) catches caveat drift.
- **Cron commit not running locally.** The action runs in CI only; bots commit. The bot must have `contents: write` permission. Mitigation: explicit `permissions:` block in the workflow, plus verify on the first manual `workflow_dispatch` run.
- **GitHub Action quota.** Public repos have unlimited Actions minutes. Private repos have 2,000 minutes/month free. The cron runs once per week and finishes in under 2 minutes. No quota concern.
