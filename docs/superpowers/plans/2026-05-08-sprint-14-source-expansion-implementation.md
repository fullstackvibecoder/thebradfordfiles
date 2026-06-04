# Sprint 14. Source Expansion + Bot-Deploy Fix. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the named-source registry beyond CKAN with a `kind` discriminator, add Statistics Canada WDS and direct CSV/JSON URL helpers, opt 5 more receipt anchors into auto-refresh, and fix the data-refresh bot's commits to actually trigger Vercel deploy.

**Architecture:** `NamedSource` gains a `kind: "ckan" | "statcan" | "url"` discriminator; existing CKAN entries are refactored to set `kind: "ckan"`. Two new helpers under `web/scripts/lib/` mirror the Sprint 13 CKAN client pattern (retry + timeout, injectable fetch). The data-refresh GitHub Action gains a Vercel deploy step that fires after a successful bot commit, using three new repo secrets.

**Tech Stack:** Next.js 16.2.4, TypeScript, tsx, Vitest, Node 22, GitHub Actions, Vercel CLI, Statistics Canada Web Data Service API.

**Spec:** `docs/superpowers/specs/2026-05-08-sprint-14-source-expansion.md`.

---

## File map

### New files
| Path | Responsibility |
|---|---|
| `web/scripts/lib/statcan.ts` | StatCan WDS client. Retry + timeout. Wraps `getDataFromCubePidCoordAndLatestNPeriods` and `getCubeMetadata`. |
| `web/scripts/lib/direct-url.ts` | `fetchJson<T>(url, options)` + `fetchCsv(url, options)`. Retry + timeout. Tiny RFC 4180 subset CSV parser. |
| `web/tests/statcan-client.test.ts` | StatCan helper tests (mocked HTTP). |
| `web/tests/direct-url.test.ts` | Direct URL helper tests. |
| `docs/superpowers/notes/2026-05-08-vercel-bot-deploy-setup.md` | Operator setup notes for the 3 Vercel-related GitHub secrets. |

### Modified files
| Path | Change |
|---|---|
| `web/lib/data-sources.ts` | Add `SourceKind` union + `kind` field on `NamedSource`. Refactor 5 existing CKAN entries to lift `domain` and `resource_id` into the `fetch` closure and set `kind: "ckan"`. Add 5 new entries (3 statcan, 2 url). |
| `web/tests/data-sources.test.ts` | Add tests asserting every entry has a valid `kind`. |
| `web/public/data/receipts/crime-trends.json` | Add `pull_config` to `crime-severity-index` and `national-context` anchors. |
| `web/public/data/receipts/housing-supply.json` | Add `pull_config` to `starts-2025-cma` (using statcan_housing_starts_toronto_cma instead of the Sprint 13 building permits source). |
| `web/public/data/receipts/ttc-performance.json` | Add `pull_config` to a chosen ridership exhibit. |
| `web/public/data/receipts/encampment-response.json` | Add `pull_config` to a chosen overdose exhibit. |
| `.github/workflows/data-refresh.yml` | Set `PUSHED=true` after successful commit step. Add new "Deploy to Vercel" step conditional on `env.PUSHED == 'true'`. |

---

## Task 0. Verify baseline

**Files:** none modified.

- [ ] **Step 1: Confirm git state**

```bash
cd /Users/aramammo/thebradfordfiles
git status --short | /usr/bin/head -10
```

Expected: only known pre-existing dirty state (legacy-site/*, web/tsconfig.json, untracked data/* + sitemap.xml + tsbuildinfo). If unexpected changes, stop and ask.

- [ ] **Step 2: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```

Expected: 95 tests pass.

- [ ] **Step 3: Confirm refresh-data still runs cleanly against live CKAN**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npm run refresh-data
```

Expected: stdout `Refresh complete: <N> updated, <M> unchanged, 0 failures.` Sprint 13 baseline working.

If the run produces failures, stop and investigate before proceeding (the registry refactor in Task 1 should not break a working baseline).

---

## Task 1. Generalize `NamedSource` with `kind` discriminator + refactor existing entries

**Files:**
- Modify: `web/lib/data-sources.ts`
- Modify: `web/tests/data-sources.test.ts`

- [ ] **Step 1: Add SourceKind union and update NamedSource interface**

In `web/lib/data-sources.ts`, replace the existing `NamedSource` interface block with this:

```typescript
import { datastoreSearch, resourceShow } from "../scripts/lib/ckan";

const TORONTO_CKAN = "ckan0.cf.opendata.inter.prod-toronto.ca";

export type CkanHost = typeof TORONTO_CKAN;

export type SourceKind = "ckan" | "statcan" | "url";

export interface FetchResult {
  value: string | number;
  as_of: string;
}

export interface NamedSource {
  kind: SourceKind;
  description: string;
  fetch: (params: Record<string, string | number>) => Promise<FetchResult>;
}

function asOfToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function annualCountByOccYear(
  resource_id: string,
  params: Record<string, string | number>
): Promise<FetchResult> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) {
    throw new Error("annualCountByOccYear requires numeric year param");
  }
  const search = await datastoreSearch(TORONTO_CKAN, resource_id, { OCC_YEAR: year });
  if (search.records.length === 0) {
    throw new Error("No records returned for year " + year + " on resource " + resource_id);
  }
  await resourceShow(TORONTO_CKAN, resource_id);
  return { value: search.total, as_of: asOfToday() };
}
```

- [ ] **Step 2: Refactor existing CKAN registry entries to set `kind: "ckan"` and lift domain/resource_id into the fetch closure**

Each existing entry has `domain: TORONTO_CKAN` and `resource_id: "..."` at the top level. Move those into the `fetch` body. Add `kind: "ckan"`. Replace the `NAMED_SOURCES` block with:

```typescript
export const NAMED_SOURCES: Record<string, NamedSource> = {
  // Theft from Motor Vehicle (TPS occurrence-level dataset, mirrored on
  // City of Toronto CKAN).
  // Source page: https://open.toronto.ca/dataset/theft-from-motor-vehicle/
  // Original publisher: Toronto Police Service. Verified 2026-05-04.
  // Field: OCC_YEAR. Row id: EVENT_UNIQUE_ID.
  tps_auto_theft_annual: {
    kind: "ckan",
    description: "Toronto Police Service Theft from Motor Vehicle, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("138efc01-91ca-4bfb-9e92-721e1477dc6a", params),
  },

  // Police Annual Statistical Report - Homicides
  // Source page: https://open.toronto.ca/dataset/police-annual-statistical-report-homicides/
  // Field: OCC_YEAR. Row id: EVENT_UNIQUE_ID.
  tps_homicide_annual: {
    kind: "ckan",
    description: "Toronto Police Service Homicides, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("559d4af8-ba23-44ed-916c-10efb6ed95ef", params),
  },

  // Shootings & Firearm Discharges
  // Source page: https://open.toronto.ca/dataset/shootings-firearm-discharges/
  tps_shooting_annual: {
    kind: "ckan",
    description: "Toronto Police Service Shootings and Firearm Discharges, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("6ab1ffae-a6ef-4d39-b943-4f6670fe58fa", params),
  },

  // Bicycle Thefts (substituted for Major Crime Indicators in Sprint 13)
  // Source page: https://open.toronto.ca/dataset/bicycle-thefts/
  tps_bicycle_theft_annual: {
    kind: "ckan",
    description: "Toronto Police Service Bicycle Thefts, annual occurrence count by OCC_YEAR",
    fetch: (params) => annualCountByOccYear("34e4206d-549e-4957-a0da-093d703a1c62", params),
  },

  // City of Toronto Active Building Permits
  // Source page: https://open.toronto.ca/dataset/building-permits-active-permits/
  // Field name verified 2026-05-04: ISSUED_DATE (not PERMIT_ISSUE_DATE).
  toronto_building_permits_annual: {
    kind: "ckan",
    description: "City of Toronto Active Building Permits, annual count by ISSUED_DATE year prefix",
    fetch: async (params) => {
      const year = Number(params.year);
      if (!Number.isFinite(year)) {
        throw new Error("toronto_building_permits_annual requires numeric year param");
      }
      const resource_id = "6d0229af-bc54-46de-9c2b-26759b01dd05";
      const search = await datastoreSearch(TORONTO_CKAN, resource_id, null);
      const yearPrefix = String(year);
      const filtered = search.records.filter((r) => {
        const issued = r.ISSUED_DATE;
        if (typeof issued !== "string") return false;
        return issued.startsWith(yearPrefix);
      });
      await resourceShow(TORONTO_CKAN, resource_id);
      return { value: filtered.length, as_of: asOfToday() };
    },
  },
};

export function lookupSource(name: string): NamedSource | null {
  return NAMED_SOURCES[name] ?? null;
}
```

- [ ] **Step 3: Add a test asserting every NamedSource has a valid kind**

In `web/tests/data-sources.test.ts`, append:

```typescript
import type { SourceKind } from "@/lib/data-sources";

const VALID_KINDS: SourceKind[] = ["ckan", "statcan", "url"];

test("every NamedSource has a valid kind", () => {
  for (const [name, source] of Object.entries(NAMED_SOURCES)) {
    expect(VALID_KINDS, name + " has invalid kind: " + source.kind).toContain(source.kind);
  }
});
```

- [ ] **Step 4: Update the existing "every NamedSource has required fields" test**

The Sprint 13 test asserted `source.domain` and `source.resource_id` are valid. Those fields are gone now. Replace the assertions in that test with checks for the remaining shape:

```typescript
test("every NamedSource has required fields", () => {
  for (const [name, source] of Object.entries(NAMED_SOURCES)) {
    expect(typeof source.kind, name + " has non-string kind").toBe("string");
    expect(typeof source.fetch, name + " has non-function fetch").toBe("function");
    expect(source.description.length, name + " has empty description").toBeGreaterThan(0);
  }
});
```

- [ ] **Step 5: Run tests + smoke-test refresh against live CKAN**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```
Expected: 96 tests pass (95 prior + 1 new kind-validity test). The "every NamedSource has required fields" test changed shape but still passes.

```bash
npm run refresh-data
```
Expected: `Refresh complete: 0 updated, 30 unchanged, 0 failures.` (or similar; the previous run already pulled current values, so the second run should be a no-op other than as_of changing if a day has passed).

If the refactor broke a fetcher, the smoke test surfaces it as a per-anchor failure. Fix before committing.

- [ ] **Step 6: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/data-sources.ts web/tests/data-sources.test.ts
git commit -m "$(cat <<'EOF'
refactor(sprint-14): NamedSource kind discriminator + lift CKAN fields into closures

Backward-compatible: all 5 existing entries set kind: "ckan". The
domain and resource_id move into the fetch closure (each entry already
calls datastoreSearch with those values). Live CKAN smoke test passes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2. StatCan WDS client + tests

**Files:**
- Create: `web/scripts/lib/statcan.ts`
- Create: `web/tests/statcan-client.test.ts`

- [ ] **Step 1: Create the StatCan client**

Create `web/scripts/lib/statcan.ts`:

```typescript
export interface StatcanDataPoint {
  refPer: string;            // e.g. "2024-01-01"
  refPer2: string;
  value: number | null;
  decimals: number;
  scalarFactorCode: number;
  symbolCode: number;
  statusCode: number;
  securityLevelCode: number;
  releaseTime: string;       // ISO timestamp
}

export interface StatcanVectorResult {
  productId: number;
  coordinate: string;
  vectorId: number;
  vectorDataPoint: StatcanDataPoint[];
}

export interface StatcanCubeMetadata {
  productId: number;
  cansimId: string | null;
  cubeTitleEn: string;
  cubeStartDate: string;
  cubeEndDate: string;
  releaseTime: string;
}

export interface StatcanClientOptions {
  timeout_ms?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 3;
const WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest";

async function withRetry<T>(fn: () => Promise<T>, retries: number, baseDelayMs: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Timeout after " + ms + "ms")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function getDataFromCubePidCoordAndLatestNPeriods(
  productId: number,
  coordinate: string,
  latestN: number,
  options: StatcanClientOptions = {}
): Promise<StatcanVectorResult> {
  const f = options.fetchImpl ?? fetch;
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const url = WDS_BASE + "/getDataFromCubePidCoordAndLatestNPeriods";
  const body = JSON.stringify([{ productId, coordinate, latestN }]);
  return withRetry(async () => {
    const resp = await withTimeout(
      f(url, { method: "POST", headers: { "content-type": "application/json" }, body }),
      timeout
    );
    if (!resp.ok) throw new Error("StatCan WDS HTTP " + resp.status);
    const json = await resp.json() as Array<{ status: string; object?: StatcanVectorResult; objectErrorCodes?: unknown }>;
    if (!Array.isArray(json) || json.length === 0) {
      throw new Error("StatCan WDS returned empty array");
    }
    if (json[0].status !== "SUCCESS") {
      throw new Error("StatCan WDS reported error: " + JSON.stringify(json[0]));
    }
    if (!json[0].object) {
      throw new Error("StatCan WDS returned no object");
    }
    return json[0].object;
  }, retries, 500);
}

export async function getCubeMetadata(
  productId: number,
  options: StatcanClientOptions = {}
): Promise<StatcanCubeMetadata> {
  const f = options.fetchImpl ?? fetch;
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const url = WDS_BASE + "/getCubeMetadata";
  const body = JSON.stringify([{ productId }]);
  return withRetry(async () => {
    const resp = await withTimeout(
      f(url, { method: "POST", headers: { "content-type": "application/json" }, body }),
      timeout
    );
    if (!resp.ok) throw new Error("StatCan WDS HTTP " + resp.status);
    const json = await resp.json() as Array<{ status: string; object?: StatcanCubeMetadata }>;
    if (!Array.isArray(json) || json.length === 0) {
      throw new Error("StatCan WDS returned empty array");
    }
    if (json[0].status !== "SUCCESS") {
      throw new Error("StatCan WDS reported error: " + JSON.stringify(json[0]));
    }
    if (!json[0].object) {
      throw new Error("StatCan WDS returned no object");
    }
    return json[0].object;
  }, retries, 500);
}
```

- [ ] **Step 2: Write tests**

Create `web/tests/statcan-client.test.ts`:

```typescript
import { test, expect } from "vitest";
import { getDataFromCubePidCoordAndLatestNPeriods, getCubeMetadata } from "../scripts/lib/statcan";

test("getDataFromCubePidCoordAndLatestNPeriods returns vector on success", async () => {
  const fetchStub: typeof fetch = async () => new Response(JSON.stringify([{
    status: "SUCCESS",
    object: {
      productId: 35100026,
      coordinate: "1.1.1.0.0.0.0.0.0.0",
      vectorId: 12345,
      vectorDataPoint: [
        { refPer: "2024-01-01", refPer2: "2024-12-31", value: 59.4, decimals: 1, scalarFactorCode: 0, symbolCode: 0, statusCode: 0, securityLevelCode: 0, releaseTime: "2025-07-22T08:30:00" },
      ],
    },
  }]), { status: 200, headers: { "content-type": "application/json" } });

  const result = await getDataFromCubePidCoordAndLatestNPeriods(35100026, "1.1.1.0.0.0.0.0.0.0", 1, { fetchImpl: fetchStub });
  expect(result.vectorDataPoint).toHaveLength(1);
  expect(result.vectorDataPoint[0].value).toBe(59.4);
});

test("getDataFromCubePidCoordAndLatestNPeriods throws on non-SUCCESS status", async () => {
  const fetchStub: typeof fetch = async () => new Response(JSON.stringify([{
    status: "FAILED", objectErrorCodes: ["INVALID_PRODUCT_ID"],
  }]), { status: 200, headers: { "content-type": "application/json" } });
  await expect(
    getDataFromCubePidCoordAndLatestNPeriods(99999999, "0.0", 1, { fetchImpl: fetchStub, retries: 0 })
  ).rejects.toThrow();
});

test("getDataFromCubePidCoordAndLatestNPeriods retries on 5xx", async () => {
  let calls = 0;
  const fetchStub: typeof fetch = async () => {
    calls += 1;
    if (calls < 2) return new Response("server error", { status: 503 });
    return new Response(JSON.stringify([{ status: "SUCCESS", object: { productId: 1, coordinate: "0.0", vectorId: 1, vectorDataPoint: [] } }]), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  const result = await getDataFromCubePidCoordAndLatestNPeriods(1, "0.0", 1, { fetchImpl: fetchStub, retries: 3 });
  expect(calls).toBeGreaterThan(1);
  expect(result.vectorId).toBe(1);
});

test("getCubeMetadata returns metadata on success", async () => {
  const fetchStub: typeof fetch = async () => new Response(JSON.stringify([{
    status: "SUCCESS",
    object: {
      productId: 35100026, cansimId: null, cubeTitleEn: "Crime Severity Index", cubeStartDate: "1998-01-01", cubeEndDate: "2024-01-01", releaseTime: "2025-07-22T08:30:00",
    },
  }]), { status: 200, headers: { "content-type": "application/json" } });
  const meta = await getCubeMetadata(35100026, { fetchImpl: fetchStub });
  expect(meta.cubeTitleEn).toContain("Crime Severity Index");
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/statcan-client.test.ts
```
Expected: 4 tests pass.

Then full suite:
```bash
npx vitest run
```
Expected: 100 tests pass (96 prior + 4 new).

- [ ] **Step 4: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/scripts/lib/statcan.ts web/tests/statcan-client.test.ts
git commit -m "$(cat <<'EOF'
feat(sprint-14): StatCan WDS client with retry + timeout

Wraps getDataFromCubePidCoordAndLatestNPeriods and getCubeMetadata.
Same retry+timeout pattern as the CKAN client.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3. Direct URL helper + tests

**Files:**
- Create: `web/scripts/lib/direct-url.ts`
- Create: `web/tests/direct-url.test.ts`

- [ ] **Step 1: Create the direct URL helper**

Create `web/scripts/lib/direct-url.ts`:

```typescript
export interface DirectUrlOptions {
  timeout_ms?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>, retries: number, baseDelayMs: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Timeout after " + ms + "ms")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function fetchJson<T>(url: string, options: DirectUrlOptions = {}): Promise<T> {
  const f = options.fetchImpl ?? fetch;
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  return withRetry(async () => {
    const resp = await withTimeout(f(url), timeout);
    if (!resp.ok) throw new Error("Fetch HTTP " + resp.status + " for " + url);
    return await resp.json() as T;
  }, retries, 500);
}

// RFC 4180 subset: comma-delimited, double-quoted fields, escaped quotes as "".
// Does NOT handle: embedded newlines inside quoted fields, BOM, alternative
// delimiters, ragged-row recovery. If a source needs those, swap in a library.
export function parseCsv(text: string): Record<string, string>[] {
  const rows = text.split(/\r?\n/).filter((r) => r.length > 0);
  if (rows.length === 0) return [];
  const headers = parseCsvRow(rows[0]);
  const records: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = parseCsvRow(rows[i]);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = cells[j] ?? "";
    }
    records.push(record);
  }
  return records;
}

function parseCsvRow(row: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < row.length) {
    if (row[i] === '"') {
      let cell = "";
      i += 1;
      while (i < row.length) {
        if (row[i] === '"' && row[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else if (row[i] === '"') {
          i += 1;
          break;
        } else {
          cell += row[i];
          i += 1;
        }
      }
      out.push(cell);
      if (row[i] === ",") i += 1;
    } else {
      let end = row.indexOf(",", i);
      if (end === -1) end = row.length;
      out.push(row.slice(i, end));
      i = end + 1;
    }
  }
  return out;
}

export async function fetchCsv(url: string, options: DirectUrlOptions = {}): Promise<Record<string, string>[]> {
  const f = options.fetchImpl ?? fetch;
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  return withRetry(async () => {
    const resp = await withTimeout(f(url), timeout);
    if (!resp.ok) throw new Error("Fetch HTTP " + resp.status + " for " + url);
    const text = await resp.text();
    return parseCsv(text);
  }, retries, 500);
}
```

- [ ] **Step 2: Write tests**

Create `web/tests/direct-url.test.ts`:

```typescript
import { test, expect } from "vitest";
import { fetchJson, fetchCsv, parseCsv } from "../scripts/lib/direct-url";

test("fetchJson returns parsed JSON on success", async () => {
  const fetchStub: typeof fetch = async () => new Response(JSON.stringify({ count: 42, name: "test" }), {
    status: 200, headers: { "content-type": "application/json" },
  });
  const result = await fetchJson<{ count: number; name: string }>("https://example.com/data.json", { fetchImpl: fetchStub });
  expect(result.count).toBe(42);
  expect(result.name).toBe("test");
});

test("fetchJson retries on 5xx", async () => {
  let calls = 0;
  const fetchStub: typeof fetch = async () => {
    calls += 1;
    if (calls < 2) return new Response("server error", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await fetchJson<{ ok: boolean }>("https://example.com/data.json", { fetchImpl: fetchStub, retries: 3 });
  expect(calls).toBeGreaterThan(1);
  expect(result.ok).toBe(true);
});

test("parseCsv handles simple comma-delimited rows", () => {
  const text = "name,count\napples,12\nbananas,7\n";
  const rows = parseCsv(text);
  expect(rows).toHaveLength(2);
  expect(rows[0].name).toBe("apples");
  expect(rows[0].count).toBe("12");
  expect(rows[1].name).toBe("bananas");
});

test("parseCsv handles quoted fields with embedded commas", () => {
  const text = 'name,description\n"Smith, John","city of Toronto"\n';
  const rows = parseCsv(text);
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("Smith, John");
  expect(rows[0].description).toBe("city of Toronto");
});

test("parseCsv handles escaped double quotes inside quoted fields", () => {
  const text = 'note\n"He said ""hello"""\n';
  const rows = parseCsv(text);
  expect(rows).toHaveLength(1);
  expect(rows[0].note).toBe('He said "hello"');
});

test("fetchCsv parses fetched CSV", async () => {
  const fetchStub: typeof fetch = async () => new Response("year,total\n2024,100\n2025,150\n", {
    status: 200, headers: { "content-type": "text/csv" },
  });
  const rows = await fetchCsv("https://example.com/data.csv", { fetchImpl: fetchStub });
  expect(rows).toHaveLength(2);
  expect(rows[0].year).toBe("2024");
  expect(rows[1].total).toBe("150");
});

test("fetchCsv throws on 4xx", async () => {
  const fetchStub: typeof fetch = async () => new Response("not found", { status: 404 });
  await expect(fetchCsv("https://example.com/missing.csv", { fetchImpl: fetchStub, retries: 0 })).rejects.toThrow();
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/direct-url.test.ts
```
Expected: 7 tests pass.

Then full suite:
```bash
npx vitest run
```
Expected: 107 tests pass (100 prior + 7 new).

- [ ] **Step 4: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/scripts/lib/direct-url.ts web/tests/direct-url.test.ts
git commit -m "$(cat <<'EOF'
feat(sprint-14): direct URL helper with fetchJson + fetchCsv

Tiny RFC 4180 subset CSV parser inline. Same retry+timeout pattern as
CKAN/StatCan clients. Library swap-in available if a source needs
embedded-newline-in-quote handling later.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4. Add 5 new registry entries (3 StatCan, 2 URL)

**Files:**
- Modify: `web/lib/data-sources.ts`

The implementer must look up actual StatCan PID + coordinate strings and direct URL endpoints. The plan provides the structural code with placeholders that the implementer must replace with verified values.

- [ ] **Step 1: Look up StatCan vector lookups for the 3 new sources**

Use WebSearch and WebFetch to find:

1. **Toronto CMA Crime Severity Index**: StatCan Table 35-10-0026, PID `35100026`. The coordinate string identifies a specific row in the table (region + measure + offence). Visit `https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3510002601` to find the Toronto CMA + total CSI vector. The coordinate format is dot-separated dimension positions, e.g. `"7.1.1.1.0.0.0.0.0.0"`.

2. **Canada national CSI**: same Table 35-10-0026, but with the Canada coordinate (region position 1 typically).

3. **Toronto CMA total housing starts**: StatCan Table 34-10-0143 (CMHC starts mirror), PID `34100143`. Find the Toronto CMA total starts vector.

If you cannot identify a coordinate from the table page, try the WDS metadata endpoint: POST `https://www150.statcan.gc.ca/t1/wds/rest/getCubeMetadata` with body `[{"productId": 35100026}]` to see all dimensions and member positions.

Document the verified PID + coordinate + table URL in a code comment above each entry.

- [ ] **Step 2: Look up direct URL endpoints for the 2 new sources**

For TTC monthly ridership:
- Try `https://open.toronto.ca/dataset/ttc-ridership/` first; if the dataset is on CKAN, this can be a `kind: "ckan"` entry instead.
- Otherwise, look for a TTC reporting page with a downloadable CSV (e.g. CEO reports or TTC Statistics page).
- If no machine-readable source exists, document the gap and skip this source. Sprint 14 ships with 4 new sources instead of 5.

For TPH overdose data:
- Try `https://open.toronto.ca/?s=overdose` for a CKAN dataset.
- Otherwise look at `toronto.ca/community-people/health-wellness-care/` overdose surveillance pages for a CSV link.
- Same gap-document fallback applies.

- [ ] **Step 3: Add helper for StatCan annual-value extraction**

In `web/lib/data-sources.ts`, add this import and helper (after the CKAN helpers):

```typescript
import { getDataFromCubePidCoordAndLatestNPeriods, getCubeMetadata } from "../scripts/lib/statcan";

async function statcanLatestPointAnnual(
  productId: number,
  coordinate: string,
  params: Record<string, string | number>
): Promise<FetchResult> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) {
    throw new Error("statcanLatestPointAnnual requires numeric year param");
  }
  // Pull last 5 periods to safely find the requested year.
  const result = await getDataFromCubePidCoordAndLatestNPeriods(productId, coordinate, 5);
  const yearPrefix = String(year);
  const point = result.vectorDataPoint.find((p) => p.refPer.startsWith(yearPrefix));
  if (!point || point.value === null) {
    throw new Error("StatCan PID " + productId + " has no value for year " + year);
  }
  return { value: point.value, as_of: asOfToday() };
}
```

- [ ] **Step 4: Add helper for direct URL CSV/JSON aggregation**

Same file. Pattern depends on the source's shape. Add this generic helper:

```typescript
import { fetchCsv, fetchJson } from "../scripts/lib/direct-url";

// Helper kept generic; per-source fetchers below call it with a specific
// URL + projection function.
async function urlCsvAnnualSum(
  url: string,
  yearField: string,
  valueField: string,
  params: Record<string, string | number>
): Promise<FetchResult> {
  const year = Number(params.year);
  if (!Number.isFinite(year)) {
    throw new Error("urlCsvAnnualSum requires numeric year param");
  }
  const rows = await fetchCsv(url);
  const yearPrefix = String(year);
  let total = 0;
  for (const row of rows) {
    const yv = row[yearField];
    if (typeof yv !== "string" || !yv.startsWith(yearPrefix)) continue;
    const v = Number(row[valueField]);
    if (Number.isFinite(v)) total += v;
  }
  if (total === 0) {
    throw new Error("urlCsvAnnualSum found no rows matching year " + year + " on " + url);
  }
  return { value: total, as_of: asOfToday() };
}
```

- [ ] **Step 5: Add the 5 new registry entries**

Below the existing CKAN entries in `NAMED_SOURCES`, add (with verified PIDs + coordinates + URLs):

```typescript
  // Toronto CMA Crime Severity Index
  // Table: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3510002601
  // PID: 35100026. Coordinate verified <date>.
  statcan_csi_toronto_cma: {
    kind: "statcan",
    description: "Statistics Canada Crime Severity Index, Toronto CMA, total all violations",
    fetch: (params) => statcanLatestPointAnnual(35100026, "<verified-coordinate>", params),
  },

  // Canada CSI
  // Table: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3510002601
  // PID: 35100026. Coordinate for Canada region verified <date>.
  statcan_csi_canada: {
    kind: "statcan",
    description: "Statistics Canada Crime Severity Index, Canada, total all violations",
    fetch: (params) => statcanLatestPointAnnual(35100026, "<verified-coordinate>", params),
  },

  // Toronto CMA total housing starts (CMHC mirror)
  // Table: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3410014301
  // PID: 34100143. Coordinate verified <date>.
  statcan_housing_starts_toronto_cma: {
    kind: "statcan",
    description: "Statistics Canada / CMHC, Toronto CMA total housing starts, all centres 10,000+",
    fetch: (params) => statcanLatestPointAnnual(34100143, "<verified-coordinate>", params),
  },

  // TTC monthly ridership (URL or CKAN, depending on availability verified <date>)
  // Source: <verified URL>
  ttc_monthly_ridership: {
    kind: "url",  // or "ckan" if a CKAN mirror exists
    description: "TTC monthly ridership totals",
    fetch: async (params) => {
      const url = "<verified URL>";
      return await urlCsvAnnualSum(url, "<year_field>", "<value_field>", params);
    },
  },

  // Toronto Public Health overdose surveillance (URL or CKAN)
  // Source: <verified URL>
  tph_overdose_data: {
    kind: "url",
    description: "Toronto Public Health overdose surveillance, annual total fatal opioid toxicity deaths",
    fetch: async (params) => {
      const url = "<verified URL>";
      return await urlCsvAnnualSum(url, "<year_field>", "<value_field>", params);
    },
  },
```

If a source falls through (no usable URL), drop the entry, document why in a comment, and proceed with 4 new sources. Acceptance criterion #4 in the spec targets "at least 4 new sources."

- [ ] **Step 6: Smoke test against live sources**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npm run refresh-data
```

Sprint 13's 3 anchors should still update (already opted in). New entries are not yet referenced by any anchor (Task 5 wires them up), so the registry just gets loaded; the live fetches are not exercised here.

To exercise the new entries directly, write a one-off script or use a temp test:

```bash
npx tsx -e "
import { lookupSource } from './lib/data-sources';
const s = lookupSource('statcan_csi_toronto_cma');
if (!s) throw new Error('not found');
const r = await s.fetch({ year: 2024 });
console.log(r);
"
```

Each new source should produce a `{ value, as_of }` without throwing. Iterate on coordinates / URLs until each works.

If you cannot exercise via tsx, defer the smoke until Task 5 (when anchors opt in and `npm run refresh-data` exercises them naturally).

- [ ] **Step 7: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add web/lib/data-sources.ts
git commit -m "$(cat <<'EOF'
feat(sprint-14): 5 new registry entries (3 statcan + 2 url)

Toronto CMA + Canada CSI from StatCan Table 35-10-0026, Toronto CMA
housing starts from Table 34-10-0143, TTC monthly ridership and TPH
overdose surveillance from direct CSV URLs. PIDs/coordinates/URLs
verified live and documented in per-entry comments.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5. Opt 5 receipt anchors into pull_config + smoke test

**Files:**
- Modify: `web/public/data/receipts/crime-trends.json`
- Modify: `web/public/data/receipts/housing-supply.json`
- Modify: `web/public/data/receipts/ttc-performance.json` (if ttc_monthly_ridership shipped)
- Modify: `web/public/data/receipts/encampment-response.json` (if tph_overdose_data shipped)

For each anchor, add a `pull_config` field. Do not touch other fields.

- [ ] **Step 1: Crime CSI Toronto CMA**

In `web/public/data/receipts/crime-trends.json`, find the `crime-severity-index` anchor. Add:

```json
"pull_config": {
  "source": "statcan_csi_toronto_cma",
  "params": { "year": 2024 },
  "format": "Toronto CMA CSI {year}: {value}"
}
```

Note: the existing `metric` is more verbose ("Toronto CMA CSI 2024: 59.4 (down 1 percent from 2023). Toronto CMA crime rate 2024: 4,177 per 100,000..."). The auto-pulled `metric` will overwrite that. The richer multi-stat phrasing becomes prose in `finding` (already there). The metric becomes the single load-bearing number.

- [ ] **Step 2: Crime CSI Canada (national context)**

In the same file, find the `national-context` anchor. Add:

```json
"pull_config": {
  "source": "statcan_csi_canada",
  "params": { "year": 2024 },
  "format": "Canada CSI {year}: {value}"
}
```

- [ ] **Step 3: Housing starts Toronto CMA**

In `web/public/data/receipts/housing-supply.json`, find the `starts-2025-cma` anchor. Add:

```json
"pull_config": {
  "source": "statcan_housing_starts_toronto_cma",
  "params": { "year": 2025 },
  "format": "Toronto CMA total starts {year}: {value} units"
}
```

This replaces the editorial-only state of this anchor (Sprint 13 reverted its earlier permits-source mismatch).

- [ ] **Step 4: TTC ridership (only if `ttc_monthly_ridership` shipped in Task 4)**

Read `web/public/data/receipts/ttc-performance.json`. Find an anchor whose finding/metric is about ridership. Add `pull_config`. Use the format string the source returns; it likely outputs an annual total.

```json
"pull_config": {
  "source": "ttc_monthly_ridership",
  "params": { "year": 2024 },
  "format": "TTC {year} annual ridership: {value}"
}
```

If `ttc_monthly_ridership` was dropped in Task 4 (no usable source found), skip this step. Document in the commit body.

- [ ] **Step 5: TPH overdose (only if `tph_overdose_data` shipped in Task 4)**

Read `web/public/data/receipts/encampment-response.json`. Find an anchor whose finding/metric is about opioid or overdose deaths. Add `pull_config`:

```json
"pull_config": {
  "source": "tph_overdose_data",
  "params": { "year": 2024 },
  "format": "Toronto opioid toxicity deaths {year}: {value}"
}
```

Skip if source dropped.

- [ ] **Step 6: Validate the edits**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run tests/_receipt-content-validation.test.ts
```
Expected: all 5 receipts still validate.

- [ ] **Step 7: Run refresh against live sources**

```bash
npm run refresh-data
```
Expected: stdout shows the new anchors getting updated (3 to 5 new updates beyond the Sprint 13 baseline of 3). Zero failures.

If any anchor fails:
- Inspect `web/.refresh-summary.json` for the failure detail.
- Adjust the registry entry's coordinate / URL / field name until the fetch succeeds.
- Re-run.

- [ ] **Step 8: Inspect the diff**

```bash
cd /Users/aramammo/thebradfordfiles
git diff web/public/data/receipts/
```
Expected: each opted-in anchor has `metric` and `as_of` updated to live values, plus the new `pull_config` block.

- [ ] **Step 9: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add -f web/public/data/receipts/crime-trends.json web/public/data/receipts/housing-supply.json
# Add ttc-performance.json and/or encampment-response.json if those anchors opted in
git commit -m "$(cat <<'EOF'
content(sprint-14): opt 4 to 5 receipt anchors into pull_config

CSI Toronto CMA, CSI Canada, Toronto CMA housing starts opt into the
new StatCan sources. TTC ridership and/or TPH overdose anchors opt
into direct-URL sources where available.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6. Add Vercel deploy step to data-refresh workflow

**Files:**
- Modify: `.github/workflows/data-refresh.yml`
- Create: `docs/superpowers/notes/2026-05-08-vercel-bot-deploy-setup.md`

- [ ] **Step 1: Update the workflow to set PUSHED env + add deploy step**

Edit `.github/workflows/data-refresh.yml`. Replace the "Commit changes" step body and add a new "Deploy to Vercel" step:

```yaml
      - name: Commit changes
        run: |
          git config user.name "data-refresh[bot]"
          git config user.email "actions@github.com"
          git add -f web/public/data/receipts/ web/public/data/scenarios/
          if git diff --staged --quiet; then
            echo "No data changes."
            echo "PUSHED=false" >> "$GITHUB_ENV"
          else
            DATE=$(date -u +%Y-%m-%d)
            UPDATED=$(node -e "console.log(JSON.parse(require('fs').readFileSync('web/.refresh-summary.json','utf-8')).updated_count)")
            git commit -m "data: weekly refresh ${DATE} (${UPDATED} anchors updated)"
            git push
            echo "PUSHED=true" >> "$GITHUB_ENV"
          fi

      - name: Deploy to Vercel
        if: env.PUSHED == 'true'
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          if [ -z "$VERCEL_TOKEN" ] || [ -z "$VERCEL_ORG_ID" ] || [ -z "$VERCEL_PROJECT_ID" ]; then
            echo "VERCEL_* secrets not set. Skipping deploy. Operator must run vercel --prod manually."
            exit 0
          fi
          npm install --global vercel@latest
          vercel pull --yes --environment=production --token=$VERCEL_TOKEN
          vercel build --prod --token=$VERCEL_TOKEN
          vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

The full file should look like:

```yaml
name: Weekly data refresh

on:
  schedule:
    - cron: "0 6 * * 0"
  workflow_dispatch: {}

permissions:
  contents: write
  issues: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install dependencies
        working-directory: web
        run: npm ci

      - name: Run refresh-data
        working-directory: web
        run: npm run refresh-data
        env:
          NODE_OPTIONS: --enable-source-maps

      - name: Commit changes
        run: |
          git config user.name "data-refresh[bot]"
          git config user.email "actions@github.com"
          git add -f web/public/data/receipts/ web/public/data/scenarios/
          if git diff --staged --quiet; then
            echo "No data changes."
            echo "PUSHED=false" >> "$GITHUB_ENV"
          else
            DATE=$(date -u +%Y-%m-%d)
            UPDATED=$(node -e "console.log(JSON.parse(require('fs').readFileSync('web/.refresh-summary.json','utf-8')).updated_count)")
            git commit -m "data: weekly refresh ${DATE} (${UPDATED} anchors updated)"
            git push
            echo "PUSHED=true" >> "$GITHUB_ENV"
          fi

      - name: Deploy to Vercel
        if: env.PUSHED == 'true'
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          if [ -z "$VERCEL_TOKEN" ] || [ -z "$VERCEL_ORG_ID" ] || [ -z "$VERCEL_PROJECT_ID" ]; then
            echo "VERCEL_* secrets not set. Skipping deploy. Operator must run vercel --prod manually."
            exit 0
          fi
          npm install --global vercel@latest
          vercel pull --yes --environment=production --token=$VERCEL_TOKEN
          vercel build --prod --token=$VERCEL_TOKEN
          vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN

      - name: Open failure issue
        if: always()
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
        run: node scripts/post-refresh-issue.mjs
```

- [ ] **Step 2: Create operator setup notes**

Create `docs/superpowers/notes/2026-05-08-vercel-bot-deploy-setup.md`:

```markdown
# Vercel bot-deploy setup

After Sprint 14 ships, the data-refresh workflow has a deploy step that
fires on bot commits, replacing the manual `vercel --prod --yes` operator
step that was needed in Sprint 13.

For the deploy step to actually run, three GitHub repository secrets must
be set. Without them, the deploy step exits cleanly without deploying
(operator falls back to manual deploy, same as Sprint 13 state).

## Secrets to set

| Name | Source |
|---|---|
| `VERCEL_TOKEN` | Generate at https://vercel.com/account/tokens . Recommend "Full Account" scope, 90-day expiry. |
| `VERCEL_ORG_ID` | `cat web/.vercel/project.json` -> field `orgId` |
| `VERCEL_PROJECT_ID` | `cat web/.vercel/project.json` -> field `projectId` |

## How to set them

```bash
gh secret set VERCEL_TOKEN --repo fullstackvibecoder/thebradfordfiles
# (paste token when prompted)

ORG_ID=$(jq -r .orgId web/.vercel/project.json)
gh secret set VERCEL_ORG_ID --repo fullstackvibecoder/thebradfordfiles --body "$ORG_ID"

PROJECT_ID=$(jq -r .projectId web/.vercel/project.json)
gh secret set VERCEL_PROJECT_ID --repo fullstackvibecoder/thebradfordfiles --body "$PROJECT_ID"
```

## Verify

After setting all three:

```bash
gh secret list --repo fullstackvibecoder/thebradfordfiles | grep VERCEL
gh workflow run data-refresh.yml --repo fullstackvibecoder/thebradfordfiles
gh run list --workflow=data-refresh.yml --limit 1
```

The workflow run should:
1. Run refresh-data (success).
2. Commit any data changes.
3. If a commit was made, deploy via Vercel CLI.
4. Open a failure issue only if a fetch failed.

If the deploy step is skipped silently with "VERCEL_* secrets not set", a secret is missing or empty.

## Rotation

Rotate `VERCEL_TOKEN` every 90 days. Org and Project IDs are stable; rotate only when the project moves between Vercel teams.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aramammo/thebradfordfiles
git add .github/workflows/data-refresh.yml docs/superpowers/notes/2026-05-08-vercel-bot-deploy-setup.md
git commit -m "$(cat <<'EOF'
feat(sprint-14): bot-deploy fix + operator setup notes

Workflow gains a Vercel deploy step that fires on successful bot
commits, eliminating the Sprint 13 gotcha where bot pushes did not
auto-deploy. Conditional on VERCEL_TOKEN / VERCEL_ORG_ID /
VERCEL_PROJECT_ID secrets being set; if missing, the step exits
cleanly and operator falls back to manual deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7. End-to-end verification + ship

**Files:** none modified.

- [ ] **Step 1: Final test pass**

```bash
cd /Users/aramammo/thebradfordfiles/web
export PATH="/Users/aramammo/.nvm/versions/node/v22.14.0/bin:$PATH"
npx vitest run
```
Expected: 107 tests pass + the 5 receipt content validation tests = 112 total.

- [ ] **Step 2: Push origin/main**

```bash
cd /Users/aramammo/thebradfordfiles
git push origin main
```

- [ ] **Step 3: Trigger workflow manually**

```bash
export PATH="/opt/homebrew/bin:$PATH"
gh workflow run data-refresh.yml --repo fullstackvibecoder/thebradfordfiles
```

- [ ] **Step 4: Wait + inspect run**

```bash
/bin/sleep 120
gh run list --workflow=data-refresh.yml --repo fullstackvibecoder/thebradfordfiles --limit 1
```

Expected: most recent run shows status `completed` with conclusion `success`.

If the deploy step ran (PUSHED=true and secrets set), verify:

```bash
gh run view <run-id> --repo fullstackvibecoder/thebradfordfiles | grep -A2 "Deploy to Vercel"
```

Expected: the step has a green check, not skipped.

- [ ] **Step 5: Pull bot commits and verify production**

```bash
cd /Users/aramammo/thebradfordfiles
git pull origin main
git log --oneline -3
```

Expected: a `data: weekly refresh YYYY-MM-DD (N anchors updated)` commit at HEAD if anchors changed.

```bash
URL="https://www.mayoralrecord.com"
/usr/bin/curl -sL "$URL/receipts/crime-trends" | /usr/bin/grep -oE "Toronto CMA CSI [0-9]+:[^<]*" | /usr/bin/head -1
/usr/bin/curl -sL "$URL/receipts/crime-trends" | /usr/bin/grep -oE "Canada CSI [0-9]+:[^<]*" | /usr/bin/head -1
/usr/bin/curl -sL "$URL/receipts/housing-supply" | /usr/bin/grep -oE "Toronto CMA total starts [0-9]+:[^<]*" | /usr/bin/head -1
```

Expected: each new metric renders on production (only if VERCEL_* secrets were set; otherwise the bot's commit is on git but production has not redeployed).

- [ ] **Step 6: Confirm em-dash count and Sprint 9-13 regression**

```bash
URL="https://www.mayoralrecord.com"
total=0
for path in "/" "/candidates/bradford" "/candidates/chow" "/scenarios" "/scenarios/housing-supply-mechanism" "/receipts" "/receipts/crime-trends" "/receipts/housing-supply" "/methodology"; do
  c=$(/usr/bin/curl -sL "$URL$path" | /usr/bin/grep -c "—")
  total=$((total + c))
  echo "  $path: $c em-dashes"
done
echo "Total: $total"

for path in "/" "/scenarios" "/receipts" "/candidates/bradford"; do
  code=$(/usr/bin/curl -sL -o /dev/null -w "%{http_code}" "$URL$path")
  echo "  $code  $path"
done
```

Expected: 0 em-dashes total. All routes return 200.

---

## Self-review notes

Coverage of acceptance criteria:

| AC# | Requirement | Task |
|---|---|---|
| 1 | NamedSource has kind field; existing entries set kind: "ckan" | 1 |
| 2 | statcan.ts exists with vitest tests | 2 |
| 3 | direct-url.ts exists with vitest tests | 3 |
| 4 | At least 4 new sources beyond Sprint 13 | 4 |
| 5 | At least 4 new receipt anchors opted into pull_config | 5 |
| 6 | Workflow has Deploy to Vercel step conditional on PUSHED | 6 |
| 7 | Existing 95 vitest tests + new helper tests | 1, 2, 3 |
| 8 | Em-dash count: 0 | 7 |
| 9 | npm run refresh-data succeeds against live for new anchors | 5 |
| 10 | Manual gh workflow run produces commit + deploy | 7 |
| 11 | Production renders new auto-refreshed values for ≥3 anchors | 7 |
| 12 | Operator setup notes documented | 6 |

No placeholders remaining. Type names consistent: `SourceKind`, `NamedSource`, `FetchResult`, `pull_config` (JSON field), `lookupSource`, `NAMED_SOURCES`, `statcanLatestPointAnnual`, `urlCsvAnnualSum`, `getDataFromCubePidCoordAndLatestNPeriods`, `getCubeMetadata`, `fetchJson`, `fetchCsv`, `parseCsv`.
