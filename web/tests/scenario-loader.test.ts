import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setScenarioDataDir, listScenarios, getScenario, listScenarioSlugs } from "@/lib/scenario-loader";
import { validScenario } from "./fixtures/valid-scenario";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-scenarios-"));
  setScenarioDataDir(tmp);
});

test("listScenarios returns empty when directory is empty", () => {
  expect(listScenarios()).toEqual([]);
});

test("listScenarios loads valid JSON files", () => {
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validScenario({ slug: "a", topic_short: "A topic" })));
  writeFileSync(join(tmp, "b.json"), JSON.stringify(validScenario({ slug: "b", topic_short: "B topic" })));
  const cards = listScenarios();
  expect(cards).toHaveLength(2);
  expect(cards.map((c) => c.slug)).toEqual(["a", "b"]);
});

test("listScenarios skips invalid JSON", () => {
  writeFileSync(join(tmp, "valid.json"), JSON.stringify(validScenario({ slug: "valid" })));
  writeFileSync(join(tmp, "broken.json"), JSON.stringify({ slug: "broken" }));
  const cards = listScenarios();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("valid");
});

test("listScenarios skips files starting with underscore", () => {
  writeFileSync(join(tmp, "_fixture-valid.json"), JSON.stringify(validScenario({ slug: "fixture" })));
  writeFileSync(join(tmp, "real.json"), JSON.stringify(validScenario({ slug: "real" })));
  const cards = listScenarios();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("real");
});

test("getScenario returns the card by slug", () => {
  writeFileSync(join(tmp, "housing.json"), JSON.stringify(validScenario({ slug: "housing", topic_short: "Housing" })));
  const card = getScenario("housing");
  expect(card?.slug).toBe("housing");
});

test("getScenario returns null for unknown slug", () => {
  expect(getScenario("nonexistent")).toBeNull();
});

test("listScenarioSlugs returns all valid slugs sorted by topic_short", () => {
  writeFileSync(join(tmp, "z.json"), JSON.stringify(validScenario({ slug: "z", topic_short: "Z" })));
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validScenario({ slug: "a", topic_short: "A" })));
  expect(listScenarioSlugs()).toEqual(["a", "z"]);
});
