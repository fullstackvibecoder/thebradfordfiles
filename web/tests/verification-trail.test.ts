import { test, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/VerificationTrail.tsx", import.meta.url), "utf-8");

test("completed trail row constrains the result chip so it cannot overflow", () => {
  // the label/verb side must be able to shrink...
  expect(src).toMatch(/min-w-0/);
  // ...and the result summary must be a non-shrinking, wrapping chip
  expect(src).toMatch(/shrink-0[^"]*break-words|break-words[^"]*shrink-0/);
});
