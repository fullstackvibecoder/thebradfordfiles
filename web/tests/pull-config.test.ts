import { test, expect } from "vitest";
import { validateReceiptCard } from "@/lib/receipt-types";
import { validReceipt } from "./fixtures/valid-receipt";

test("anchor without pull_config still validates (backward compat)", () => {
  const card = validReceipt();
  const result = validateReceiptCard(card);
  expect(result.ok).toBe(true);
});

test("anchor with valid pull_config validates", () => {
  const card = validReceipt();
  const enriched = JSON.parse(JSON.stringify(card));
  enriched.receipt.anchors[0].pull_config = {
    source: "tps_auto_theft_annual",
    params: { year: 2024 },
    format: "{value} reported in 2024",
  };
  const result = validateReceiptCard(enriched);
  expect(result.ok).toBe(true);
});

test("anchor pull_config rejects empty source", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.receipt.anchors[0].pull_config = {
    source: "",
    format: "{value}",
  };
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("source"))).toBe(true);
});

test("anchor pull_config rejects empty format", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.receipt.anchors[0].pull_config = {
    source: "tps_auto_theft_annual",
    format: "",
  };
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
});

test("anchor pull_config accepts numeric and string params", () => {
  const card = validReceipt();
  const enriched = JSON.parse(JSON.stringify(card));
  enriched.receipt.anchors[0].pull_config = {
    source: "tps_auto_theft_annual",
    params: { year: 2024, scope: "annual" },
    format: "{value}",
  };
  const result = validateReceiptCard(enriched);
  expect(result.ok).toBe(true);
});
