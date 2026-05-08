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
