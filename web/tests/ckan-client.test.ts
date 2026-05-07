import { test, expect } from "vitest";
import { datastoreSearch, resourceShow } from "../scripts/lib/ckan";

function makeFetchStub(responses: { url: RegExp; status: number; body: unknown }[]) {
  return async (url: string | URL, _init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    const match = responses.find((r) => r.url.test(u));
    if (!match) throw new Error("No stub match for " + u);
    return new Response(JSON.stringify(match.body), {
      status: match.status,
      headers: { "content-type": "application/json" },
    });
  };
}

test("datastoreSearch returns records on success", async () => {
  const fetchStub = makeFetchStub([
    {
      url: /datastore_search/,
      status: 200,
      body: { success: true, result: { records: [{ year: 2024, count: 12408 }], total: 1 } },
    },
  ]);
  const result = await datastoreSearch("data.torontopolice.on.ca", "abc-123", { year: 2024 }, { fetchImpl: fetchStub as unknown as typeof fetch });
  expect(result.records).toHaveLength(1);
  expect(result.records[0].count).toBe(12408);
});

test("datastoreSearch retries on 5xx and eventually succeeds", async () => {
  let calls = 0;
  const fetchStub: typeof fetch = async () => {
    calls += 1;
    if (calls < 2) return new Response("server error", { status: 503 });
    return new Response(JSON.stringify({ success: true, result: { records: [{ count: 5 }], total: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const result = await datastoreSearch("data.torontopolice.on.ca", "abc", null, { fetchImpl: fetchStub, retries: 3 });
  expect(calls).toBeGreaterThan(1);
  expect(result.records[0].count).toBe(5);
});

test("datastoreSearch throws after exhausting retries", async () => {
  const fetchStub: typeof fetch = async () => new Response("nope", { status: 503 });
  await expect(
    datastoreSearch("data.torontopolice.on.ca", "abc", null, { fetchImpl: fetchStub, retries: 1 })
  ).rejects.toThrow();
});

test("resourceShow returns metadata", async () => {
  const fetchStub = makeFetchStub([
    {
      url: /resource_show/,
      status: 200,
      body: { success: true, result: { id: "abc", last_modified: "2025-12-26T12:00:00", created: "2020-01-01", format: "CSV" } },
    },
  ]);
  const meta = await resourceShow("data.torontopolice.on.ca", "abc", { fetchImpl: fetchStub as unknown as typeof fetch });
  expect(meta.last_modified).toBe("2025-12-26T12:00:00");
});
