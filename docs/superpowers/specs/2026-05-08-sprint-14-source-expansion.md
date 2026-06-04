# Sprint 14. Source Expansion (StatCan + direct URLs) and Bot-Deploy Fix

**Date:** 2026-05-08
**Status:** Spec. Ready for implementation plan.
**Builds on:** Sprint 13 (data refresh cron, named-source registry, CKAN integration).

## Goal

Auto-refresh roughly 5 more receipt anchors per week (8 total, ~27 percent of the receipt corpus) by generalizing the named-source registry beyond CKAN to support Statistics Canada Web Data Service (StatCan WDS API) and direct CSV/JSON URL fetches. Fix the Sprint 13 gotcha where the data-refresh bot's commits do not trigger Vercel auto-deploy, so cron runs surface on production without operator intervention.

## Motivation

Sprint 13 shipped the auto-refresh infrastructure with CKAN-only support. It auto-refreshes 3 of roughly 30 receipt anchors (10 percent). Three real gaps surfaced:

1. **Coverage is thin.** Most non-crime receipt anchors source from StatCan tables (CSI, housing starts, national context) or organisation-specific endpoints (TTC monthly performance, Toronto Public Health overdose data). CKAN does not cover these.
2. **Vercel does not auto-deploy bot commits.** Vercel's git integration only triggers on the linked operator's pushes. The `data-refresh[bot]` user's commits push to git but do not deploy. After every cron run, the operator currently has to manually run `vercel --prod --yes` to surface the fresh data. That breaks the "set and forget" promise.
3. **The registry interface is CKAN-shaped.** The current `NamedSource` carries `domain` and `resource_id` at the top level. Adding StatCan or URL kinds requires either polluting the interface with kind-specific fields or refactoring to a discriminator.

Sprint 14 closes those three gaps.

## Non-goals

- HTML scraping. Scraper-kind sources are explicitly Sprint 16 or later if and when an anchor genuinely cannot be reached via API or direct URL.
- Auto-discovery of CKAN datasets. The registry remains hand-authored.
- Slack or email notifications on failures. GitHub issues remain the only failure surface.
- Operator-triggered manual refresh button (e.g. an admin endpoint). Manual triggers happen via `gh workflow run data-refresh.yml` for now.
- News and op-ed ingestion. Slated for Sprint 15+.
- Source registry expansion beyond ~5 new entries. Future sprints can add more once this set is proven.
- Modifying receipt editorial fields (`finding`, `caveats`, `sub_claim`, `pull_quote`, `topic`, `topic_short`, `claims`). Schema-enforced from Sprint 13.

## Architecture

### Generalize `NamedSource` with a `kind` discriminator

The existing interface in `web/lib/data-sources.ts` carries `domain: CkanHost` and `resource_id: string` at the top level. Sprint 14 lifts those into the per-source `fetch` closure and adds a `kind` discriminator:

```typescript
export type SourceKind = "ckan" | "statcan" | "url";

export interface NamedSource {
  kind: SourceKind;
  description: string;
  fetch: (params: Record<string, string | number>) => Promise<FetchResult>;
}
```

Each existing CKAN entry adds `kind: "ckan"`. The `domain` and `resource_id` move into the fetch closure (each entry already calls `datastoreSearch(TORONTO_CKAN, resource_id, ...)`; that call moves up into the fetch body). This is a mechanical refactor with no behavior change.

The dispatch in `scripts/refresh-data.ts` does not need to switch on `kind` because each source's `fetch` is a closure that already knows what to do. The `kind` field is editorial: it documents the source type and lets future tools (e.g. a `/admin/sources` page) group sources by kind.

### Two new helpers in `web/scripts/lib/`

#### `statcan.ts`
Wraps the Statistics Canada Web Data Service (WDS) JSON API at `https://www150.statcan.gc.ca/t1/wds/rest/`. Two functions:
- `getDataFromCubePidCoordAndLatestNPeriods(productId, coordinate, n)` returns the latest N periods of a series.
- `getCubeMetadata(productId)` returns the metadata for a cube (used for `as_of` derivation).

WDS responses are typed JSON; no parsing needed beyond JSON.parse. Authentication is anonymous for public tables.

#### `direct-url.ts`
Fetches a CSV or JSON from a given URL with retry + timeout. Two functions:
- `fetchJson<T>(url, options)` returns parsed JSON typed as T.
- `fetchCsv(url, options)` returns parsed rows as `Record<string, string>[]` using a tiny CSV parser (no library dependency for now; comma-delimited, quoted fields, RFC 4180 subset).

Both reuse the retry+timeout pattern from `ckan.ts`.

### Five new registry entries

| Registry name | Kind | Target anchor | Source |
|---|---|---|---|
| `statcan_csi_toronto_cma` | statcan | crime-trends:crime-severity-index | StatCan Table 35-10-0026, vector for Toronto CMA CSI |
| `statcan_csi_canada` | statcan | crime-trends:national-context | StatCan Table 35-10-0026, vector for Canada CSI |
| `statcan_housing_starts_toronto_cma` | statcan | housing-supply:starts-2025-cma | StatCan Table 34-10-0143, vector for Toronto CMA total starts |
| `ttc_monthly_ridership` | url | ttc-performance:ridership-recovery | TTC monthly performance CSV. URL is looked up at implementation time (same live-discovery pattern Sprint 13 used for CKAN resource_ids). Falls back to open.toronto.ca CKAN if a TTC dataset is mirrored there. |
| `tph_overdose_data` | url | encampment-response:overdose-trends | Toronto Public Health overdose surveillance CSV. URL looked up at implementation time. Likely lives at toronto.ca/health/ overdose surveillance pages. |

Source URLs and StatCan PID/coordinate lookups happen during implementation. If a particular source cannot be wired (URL behind auth, CSV format too irregular), document the gap and ship the remaining 4. Acceptance criterion #3 below targets "at least 4 new sources" rather than exactly 5.

### Five new opted-in receipt anchors

| Receipt | Anchor | Mapped source |
|---|---|---|
| crime-trends.json | crime-severity-index | statcan_csi_toronto_cma |
| crime-trends.json | national-context | statcan_csi_canada |
| housing-supply.json | starts-2025-cma | statcan_housing_starts_toronto_cma |
| ttc-performance.json | (a ridership exhibit chosen during implementation) | ttc_monthly_ridership |
| encampment-response.json | (an overdose exhibit chosen during implementation) | tph_overdose_data |

Editorial fields are not modified. Only `pull_config` is added. The format string preserves the existing prose register.

### Bot-deploy workflow step

Current `data-refresh.yml` ends after the commit-and-push step. Sprint 14 adds a deploy step that runs after a successful commit. The step is conditional: it only runs if the commit step actually pushed something.

```yaml
      - name: Deploy to Vercel
        if: env.PUSHED == 'true'
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          npm install --global vercel@latest
          vercel pull --yes --environment=production --token=$VERCEL_TOKEN
          vercel build --prod --token=$VERCEL_TOKEN
          vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

The commit step gains an `echo "PUSHED=true" >> "$GITHUB_ENV"` after a successful push, so the deploy step knows whether to fire.

`VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are GitHub repository secrets. The operator must set them once. Token: generate at `vercel.com/account/tokens`. Org ID and Project ID: read from `web/.vercel/project.json` (already present locally).

If the secrets are not set, the deploy step is a no-op (the conditional `if: env.PUSHED == 'true'` does not gate on secret presence; the `vercel` CLI will fail authentically with a clear error). Non-blocking failure: the next `vercel --prod --yes` from the operator picks up the bot's commit when run.

### Sequencing

- Phase 1: Generalize `NamedSource` with `kind` discriminator. Refactor existing 5 CKAN entries. Tests: existing tests pass plus a new test asserting every entry has a valid `kind`.
- Phase 2: StatCan helper (`web/scripts/lib/statcan.ts`) + 3 StatCan registry entries + helper tests (mocked WDS responses) + smoke test against live WDS.
- Phase 3: Direct URL helper (`web/scripts/lib/direct-url.ts`) + 2 direct-URL registry entries + helper tests (mocked HTTP) + smoke test against live URLs.
- Phase 4: Opt 5 new receipt anchors into `pull_config`. Manual `npm run refresh-data` run against live sources. Iterate on registry entries until clean.
- Phase 5: Bot-deploy workflow step. Document the operator's secret-setup checklist.
- Phase 6: End-to-end verification. Manual `gh workflow run data-refresh.yml` confirms the workflow now (a) commits + (b) auto-deploys via Vercel.

## Acceptance criteria

1. `NamedSource` interface in `web/lib/data-sources.ts` has a `kind: SourceKind` field. All 5 existing CKAN entries set `kind: "ckan"`.
2. `web/scripts/lib/statcan.ts` exists, exports a typed StatCan WDS client, and has its own vitest tests with mocked HTTP responses.
3. `web/scripts/lib/direct-url.ts` exists, exports `fetchJson` and `fetchCsv`, and has its own vitest tests.
4. Registry has at least 4 new sources beyond the Sprint 13 launch set (target 5: 3 statcan + 2 url).
5. At least 4 new receipt anchors opt into `pull_config` (bringing total to 7+).
6. `.github/workflows/data-refresh.yml` has a new "Deploy to Vercel" step that runs after a successful commit, conditional on the commit having pushed.
7. Existing 95 vitest tests continue to pass. New tests for the two helpers add at least 6 tests (3 per helper minimum).
8. Em-dash count: 0 across all changed files and rendered HTML.
9. Manual `npm run refresh-data` against live sources produces a clean summary (zero failures) for the 4-5 newly-opted-in anchors.
10. Manual `gh workflow run data-refresh.yml` confirms the workflow now produces both a commit (when data changes) AND a triggered Vercel deployment.
11. Production rendered HTML shows the new auto-refreshed values for at least 3 of the 5 newly-opted-in anchors after deployment.
12. Operator setup notes for `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` are documented in `docs/superpowers/notes/2026-05-08-vercel-bot-deploy-setup.md`.

## Risks and mitigations

- **StatCan WDS schema drift.** WDS is well-documented but vector IDs occasionally change when StatCan re-publishes a series. Mitigation: each StatCan registry entry comments the cube PID + vector + last-verified date inline. On schema drift, the helper throws a clear error and the failure issues system surfaces it.
- **Direct URL endpoints rot.** Organisation-specific URLs (TTC, TPH) can change without notice. Mitigation: same retry+timeout pattern as Sprint 13 plus per-source descriptive errors. If a source rots, the failure issue tells the operator which URL needs updating.
- **CSV parser edge cases.** Hand-rolled CSV parser may not handle all edge cases (embedded newlines in quoted fields, etc.). Mitigation: target subset of RFC 4180 that real Toronto/StatCan CSVs use; document the limitation; if a source needs richer parsing, Sprint 15 imports a library (papaparse or csv-parse).
- **Vercel deploy step adds cron runtime.** The deploy step adds 30-60 seconds to each cron run. Negligible against the weekly cadence.
- **VERCEL_TOKEN scope and rotation.** Operator must rotate tokens periodically. Mitigation: the operator setup notes document the recommended rotation cadence (every 90 days) and the steps to rotate.
- **Registry refactor breaks existing entries.** Moving `domain` and `resource_id` into closures could miss an entry. Mitigation: Phase 1 includes a smoke test (`npm run refresh-data` locally) that exercises each existing source after the refactor. Tests must show 95 + new tests passing before commit.
- **TTC and TPH may not publish machine-readable data publicly.** If both targets fall through, Sprint 14 ships with 3 new sources (3 statcan) and the receipt corpus reaches 6 auto-refreshed anchors. Acceptance criteria 3 and 5 are loose (target 4) so partial success is acceptable.
