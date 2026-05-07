import { test, expect, vi } from "vitest";
import { applyFormat, refreshAnchor } from "../scripts/refresh-data";

vi.mock("../lib/data-sources", () => ({
  lookupSource: vi.fn(),
}));

import { lookupSource } from "../lib/data-sources";

test("applyFormat substitutes {value}", () => {
  expect(applyFormat("{value} reported", 42, undefined)).toBe("42 reported");
});

test("applyFormat substitutes named params", () => {
  expect(applyFormat("{value} cases in {year}", 9876, { year: 2024 })).toBe("9876 cases in 2024");
});

test("applyFormat handles multiple substitutions of same key", () => {
  expect(applyFormat("{year} to {year}", "x", { year: 2024 })).toBe("2024 to 2024");
});

test("refreshAnchor updates anchor metric and as_of on success", async () => {
  vi.mocked(lookupSource).mockReturnValue({
    domain: "ckan0.cf.opendata.inter.prod-toronto.ca",
    resource_id: "abc",
    description: "test",
    fetch: async () => ({ value: 9876, as_of: "2025-12-31" }),
  } as never);
  const failures: never[] = [];
  const anchor = {
    sub_section_anchor: "test",
    metric: "old metric",
    as_of: "2024-01-01",
    pull_config: { source: "test_source", params: { year: 2024 }, format: "{value} cases in {year}" },
  };
  const changed = await refreshAnchor("/tmp/test.json", anchor, failures);
  expect(changed).toBe(true);
  expect(anchor.metric).toBe("9876 cases in 2024");
  expect(anchor.as_of).toBe("2025-12-31");
  expect(failures).toHaveLength(0);
});

test("refreshAnchor preserves anchor on fetch failure", async () => {
  vi.mocked(lookupSource).mockReturnValue({
    domain: "ckan0.cf.opendata.inter.prod-toronto.ca",
    resource_id: "abc",
    description: "test",
    fetch: async () => { throw new Error("CKAN unavailable"); },
  } as never);
  const failures: { file: string; anchor_id: string; source: string; error: string; attempted_at: string; resource_url?: string }[] = [];
  const anchor = {
    sub_section_anchor: "test",
    metric: "preserved metric",
    as_of: "2024-01-01",
    pull_config: { source: "test_source", params: {}, format: "{value}" },
  };
  const changed = await refreshAnchor("/tmp/test.json", anchor, failures);
  expect(changed).toBe(false);
  expect(anchor.metric).toBe("preserved metric");
  expect(anchor.as_of).toBe("2024-01-01");
  expect(failures).toHaveLength(1);
  expect(failures[0].error).toContain("CKAN unavailable");
});

test("refreshAnchor records failure when source not in registry", async () => {
  vi.mocked(lookupSource).mockReturnValue(null);
  const failures: { file: string; anchor_id: string; source: string; error: string; attempted_at: string; resource_url?: string }[] = [];
  const anchor = {
    sub_section_anchor: "test",
    metric: "preserved",
    as_of: "2024-01-01",
    pull_config: { source: "no_such_source", format: "{value}" },
  };
  const changed = await refreshAnchor("/tmp/test.json", anchor, failures);
  expect(changed).toBe(false);
  expect(failures[0].error).toContain("Unknown source");
  expect(anchor.metric).toBe("preserved");
});

test("refreshAnchor returns false for anchor without pull_config", async () => {
  const failures: never[] = [];
  const anchor = {
    sub_section_anchor: "test",
    metric: "static metric",
    as_of: "2024-01-01",
  };
  const changed = await refreshAnchor("/tmp/test.json", anchor, failures);
  expect(changed).toBe(false);
});
