import { test, expect } from "vitest";
import { validateScenarioCard } from "@/lib/scenario-types";
import { validScenario } from "./fixtures/valid-scenario";

test("validateScenarioCard accepts a fully-formed card", () => {
  const result = validateScenarioCard(validScenario());
  expect(result.ok).toBe(true);
  expect(result.card?.slug).toBe("test-scenario");
});

test("validateScenarioCard rejects a card missing pull_quote", () => {
  const card = validScenario();
  const broken = { ...card, pull_quote: undefined } as unknown;
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("pull_quote"))).toBe(true);
});

test("validateScenarioCard rejects a card with an invalid tier", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  broken.positions[0].citations[0].tier = "T7";
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard rejects content with an em dash", () => {
  const card = validScenario({ pull_quote: "Research — finds that the test mechanism reaches different populations." });
  const result = validateScenarioCard(card);
  expect(result.ok).toBe(false);
  expect(result.errors?.[0]).toContain("em dash");
});

test("validateScenarioCard requires methodology_notes when T4 citations are present", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  broken.who_benefits.literature_row.push({ tier: "T4", label: "Mayoral Record extrapolation" });
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("methodology_notes"))).toBe(true);
});

test("validateScenarioCard rejects fewer than 3 comparables", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  broken.comparables = broken.comparables.slice(0, 2);
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard rejects more than 5 comparables", () => {
  const card = validScenario();
  const broken = JSON.parse(JSON.stringify(card));
  const extra = broken.comparables[0];
  broken.comparables = [extra, extra, extra, extra, extra, extra];
  const result = validateScenarioCard(broken);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard rejects pull_quote shorter than 40 chars", () => {
  const card = validScenario({ pull_quote: "too short" });
  const result = validateScenarioCard(card);
  expect(result.ok).toBe(false);
});

test("validateScenarioCard accepts a plural projections block", () => {
  const card = validScenario({
    projections: {
      kind: "plural",
      intro: "Literature supports a range.",
      items: [
        { scenario_label: "Low", range_or_value: "+2%", citation: { tier: "T3", label: "Author 2024" } },
        { scenario_label: "High", range_or_value: "+8%", citation: { tier: "T3", label: "Author 2024" } },
      ],
    },
  });
  const result = validateScenarioCard(card);
  expect(result.ok).toBe(true);
});
