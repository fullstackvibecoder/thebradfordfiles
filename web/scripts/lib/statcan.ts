export interface StatcanDataPoint {
  refPer: string;
  refPer2: string;
  value: number | null;
  decimals: number;
  scalarFactorCode: number;
  symbolCode: number;
  statusCode: number;
  securityLevelCode: number;
  releaseTime: string;
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
