import { test, expect } from "vitest";
import { lookupSource, NAMED_SOURCES, type SourceKind } from "@/lib/data-sources";

const VALID_KINDS: SourceKind[] = ["ckan", "statcan", "url"];

test("lookupSource returns named source", () => {
  const source = lookupSource("tps_auto_theft_annual");
  expect(source).not.toBeNull();
  expect(source?.kind).toBe("ckan");
});

test("lookupSource returns null for unknown name", () => {
  expect(lookupSource("nope_does_not_exist")).toBeNull();
});

test("registry has at least 5 sources", () => {
  expect(Object.keys(NAMED_SOURCES).length).toBeGreaterThanOrEqual(5);
});

test("every NamedSource has required fields", () => {
  for (const [name, source] of Object.entries(NAMED_SOURCES)) {
    expect(typeof source.kind, name + " has non-string kind").toBe("string");
    expect(typeof source.fetch, name + " has non-function fetch").toBe("function");
    expect(source.description.length, name + " has empty description").toBeGreaterThan(0);
  }
});

test("every NamedSource has a valid kind", () => {
  for (const [name, source] of Object.entries(NAMED_SOURCES)) {
    expect(VALID_KINDS, name + " has invalid kind: " + source.kind).toContain(source.kind);
  }
});
