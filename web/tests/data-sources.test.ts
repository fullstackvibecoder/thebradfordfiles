import { test, expect } from "vitest";
import { lookupSource, NAMED_SOURCES } from "@/lib/data-sources";

test("lookupSource returns named source", () => {
  const source = lookupSource("tps_auto_theft_annual");
  expect(source).not.toBeNull();
  expect(source?.domain).toBe("ckan0.cf.opendata.inter.prod-toronto.ca");
});

test("lookupSource returns null for unknown name", () => {
  expect(lookupSource("nope_does_not_exist")).toBeNull();
});

test("registry has at least 5 sources", () => {
  expect(Object.keys(NAMED_SOURCES).length).toBeGreaterThanOrEqual(5);
});

test("every NamedSource has required fields", () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const [name, source] of Object.entries(NAMED_SOURCES)) {
    expect(source.domain, name + " has invalid domain").toMatch(/(open\.toronto\.ca|data\.torontopolice\.on\.ca|ckan0\.cf\.opendata\.inter\.prod-toronto\.ca)/);
    expect(source.resource_id, name + " has non-uuid resource_id").toMatch(uuidPattern);
    expect(typeof source.fetch, name + " has non-function fetch").toBe("function");
    expect(source.description.length, name + " has empty description").toBeGreaterThan(0);
  }
});
