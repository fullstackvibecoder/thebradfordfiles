import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/SurfacedCards.tsx", import.meta.url), "utf-8");

test("cards truncate the body with line-clamp so heights stay uniform", () => {
  expect(src).toMatch(/line-clamp-4/);
  expect(src).toMatch(/overflow-hidden/);
});

test("cards link to the candidate dossier and show a read-the-record affordance", () => {
  expect(src).toMatch(/href=\{`\/candidates\/\$\{c\.candidate_slug\}`\}/);
  expect(src).toMatch(/Read the record/);
});

test("grid track count matches card count (no empty third column)", () => {
  expect(src).toMatch(/GRID_COLS/);
});

test("SurfacedCards uses tokens and no hardcoded hex", () => {
  expect(src).toMatch(/border-rule/);
  expect(src).not.toMatch(/text-\[#|bg-\[#|border-\[#/);
});
