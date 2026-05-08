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
