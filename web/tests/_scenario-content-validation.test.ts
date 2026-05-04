import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateScenarioCard } from "@/lib/scenario-types";

const slugs = [
  "housing-supply-mechanism",
  "transit-operating-funding",
  "property-tax-stance",
  "public-safety-approach",
  "climate-parks-investment",
];

for (const slug of slugs) {
  test("scenario card validates: " + slug, () => {
    const path = join("public", "data", "scenarios", slug + ".json");
    if (!existsSync(path)) {
      // not yet authored; skip (test passes)
      return;
    }
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const result = validateScenarioCard(raw);
    if (!result.ok) {
      throw new Error("Validation failed for " + slug + ": " + JSON.stringify(result.errors));
    }
    expect(result.ok).toBe(true);
  });
}
