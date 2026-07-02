import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const shell = readFileSync(new URL("../components/LandingShell.tsx", import.meta.url), "utf-8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf-8");

test("LandingShell renders the SectionRail with sections, candidates, and a pick handler", () => {
  expect(shell).toMatch(/import \{ SectionRail \}/);
  expect(shell).toMatch(/<SectionRail[\s\S]*sections=\{sections\}[\s\S]*candidates=\{candidates\}[\s\S]*onSectionPick=\{onSectionPick\}/);
});

test("section picks go through the Turnstile token -> submit path", () => {
  expect(shell).toMatch(/async function onSectionPick/);
  expect(shell).toMatch(/getTurnstileToken\(siteKey\)/);
  expect(shell).toMatch(/submit\(query, token\)/);
});

test("editorial front page renders only when there is no active query, in a two-column body", () => {
  expect(shell).toMatch(/!state\.query &&/);
  expect(shell).toMatch(/lg:flex-row/);
  expect(shell).toMatch(/state\.query && <ReceiptStream/);
});

test("the standalone Chips block is gone from the homepage", () => {
  expect(shell).not.toMatch(/<Chips/);
});

test("page.tsx loads sections + candidates and passes them to LandingShell", () => {
  expect(page).toMatch(/getSectionCounts/);
  expect(page).toMatch(/getCandidateSummaries/);
  expect(page).toMatch(/sections=\{sections\}/);
  expect(page).toMatch(/candidates=\{candidates\}/);
});
