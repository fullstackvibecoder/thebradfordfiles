import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateReceiptCard } from "@/lib/receipt-types";

const slugs = [
  "crime-trends",
  "tax-burden",
  "housing-supply",
  "ttc-performance",
  "encampment-response",
];

for (const slug of slugs) {
  test("receipt card validates: " + slug, () => {
    const path = join("public", "data", "receipts", slug + ".json");
    if (!existsSync(path)) {
      return;
    }
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const result = validateReceiptCard(raw);
    if (!result.ok) {
      throw new Error("Validation failed for " + slug + ": " + JSON.stringify(result.errors));
    }
    expect(result.ok).toBe(true);
  });
}
