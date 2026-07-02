import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/FeaturedComparison.tsx", import.meta.url), "utf-8");

test("L1 lead color-blocks the two sides with accent and success top borders", () => {
  expect(src).toMatch(/border-t-4/);
  expect(src).toMatch(/border-accent/);
  expect(src).toMatch(/border-success/);
});

test("L1 lead shows a centered VS medallion", () => {
  expect(src).toMatch(/VS/);
});

test("carousel keeps reduced-motion opt-out and aria-current dots", () => {
  expect(src).toMatch(/prefers-reduced-motion/);
  expect(src).toMatch(/aria-current/);
});

test("lead no longer pins a fixed 780px island width", () => {
  expect(src).not.toMatch(/max-w-\[780px\]/);
});

test("FeaturedComparison uses tokens and no hardcoded hex", () => {
  expect(src).not.toMatch(/text-\[#|bg-\[#|border-\[#/);
});
