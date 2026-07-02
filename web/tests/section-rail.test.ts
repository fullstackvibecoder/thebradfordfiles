import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/SectionRail.tsx", import.meta.url), "utf-8");

test("SectionRail is a client component", () => {
  expect(src).toMatch(/^["']use client["']/);
});

test("section rows trigger the search via onSectionPick with the section query", () => {
  expect(src).toMatch(/onSectionPick\(\s*s\.query\s*\)/);
});

test("candidate rows link to the dossier route", () => {
  expect(src).toMatch(/href=\{`\/candidates\/\$\{c\.slug\}`\}/);
});

test("counts render with tabular numerals and record_count is shown", () => {
  expect(src).toMatch(/nums-tabular/);
  expect(src).toMatch(/record_count/);
});

test("SectionRail uses theme tokens and no hardcoded hex", () => {
  expect(src).toMatch(/border-rule/);
  expect(src).not.toMatch(/text-\[#|bg-\[#|border-\[#/);
});
