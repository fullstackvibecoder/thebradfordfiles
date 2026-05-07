export interface CkanRecord {
  [key: string]: unknown;
}

export interface CkanDatastoreResult {
  records: CkanRecord[];
  total: number;
}

export interface CkanResourceMetadata {
  id: string;
  last_modified: string | null;
  created: string;
  format: string;
}

export interface CkanClientOptions {
  timeout_ms?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 3;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  baseDelayMs: number
): Promise<T> {
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

export async function datastoreSearch(
  domain: string,
  resource_id: string,
  filters: Record<string, string | number> | null,
  options: CkanClientOptions = {}
): Promise<CkanDatastoreResult> {
  const f = options.fetchImpl ?? fetch;
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const url = "https://" + domain + "/api/3/action/datastore_search";
  const body = JSON.stringify({
    resource_id,
    filters: filters ?? undefined,
    limit: 1000,
  });
  return withRetry(async () => {
    const resp = await withTimeout(
      f(url, { method: "POST", headers: { "content-type": "application/json" }, body }),
      timeout
    );
    if (!resp.ok) throw new Error("CKAN datastore_search HTTP " + resp.status);
    const json = await resp.json() as { success: boolean; result?: { records?: CkanRecord[]; total?: number }; error?: unknown };
    if (!json.success) throw new Error("CKAN reported error: " + JSON.stringify(json.error));
    return {
      records: json.result?.records ?? [],
      total: json.result?.total ?? 0,
    };
  }, retries, 500);
}

export async function resourceShow(
  domain: string,
  resource_id: string,
  options: CkanClientOptions = {}
): Promise<CkanResourceMetadata> {
  const f = options.fetchImpl ?? fetch;
  const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const url = "https://" + domain + "/api/3/action/resource_show?id=" + encodeURIComponent(resource_id);
  return withRetry(async () => {
    const resp = await withTimeout(f(url), timeout);
    if (!resp.ok) throw new Error("CKAN resource_show HTTP " + resp.status);
    const json = await resp.json() as { success: boolean; result?: CkanResourceMetadata; error?: unknown };
    if (!json.success) throw new Error("CKAN reported error: " + JSON.stringify(json.error));
    if (!json.result) throw new Error("CKAN resource_show returned no result");
    return json.result;
  }, retries, 500);
}
