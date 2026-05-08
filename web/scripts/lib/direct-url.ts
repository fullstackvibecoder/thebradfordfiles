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
