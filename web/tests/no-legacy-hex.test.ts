import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const files = [
  "../components/ComparisonCard.tsx",
  "../components/SingleAnswerCard.tsx",
  "../components/RecordTrailCard.tsx",
  "../components/Stamp.tsx",
  "../components/FollowUpChips.tsx",
  "../components/VerificationTrail.tsx",
];
const LEGACY = ["#15110d", "#1c1813", "#e8e3d5", "#8a8275", "#c4923a", "#2a2520", "#3a8a3a"];

test("answer-view components use tokens, not legacy dark hex", () => {
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf-8");
    for (const hex of LEGACY) expect(src, `${f} contains ${hex}`).not.toContain(hex);
  }
});

test("date-helpers uses tokens, not arbitrary hex color classes", () => {
  const src = readFileSync(new URL("../lib/date-helpers.ts", import.meta.url), "utf-8");
  expect(src).not.toMatch(/text-\[#|bg-\[#|border-\[#/);
});
