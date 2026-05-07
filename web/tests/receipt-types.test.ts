import { test, expect } from "vitest";
import { validateReceiptCard } from "@/lib/receipt-types";
import { validReceipt } from "./fixtures/valid-receipt";

test("validateReceiptCard accepts a fully-formed card", () => {
  const result = validateReceiptCard(validReceipt());
  expect(result.ok).toBe(true);
  expect(result.card?.slug).toBe("test-receipt");
});

test("validateReceiptCard rejects a card missing claim source url", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  delete broken.claims[0].source.url;
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("url"))).toBe(true);
});

test("validateReceiptCard rejects claim retrieved date before 2024-01-01", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.claims[0].source.retrieved = "2023-12-31";
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("2024-01-01"))).toBe(true);
});

test("validateReceiptCard rejects duplicate sub_section_anchor", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.receipt.anchors[1].sub_section_anchor = broken.receipt.anchors[0].sub_section_anchor;
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
  expect(result.errors?.some((e) => e.includes("Duplicate"))).toBe(true);
});

test("validateReceiptCard rejects content with an em dash", () => {
  const card = validReceipt({ pull_quote: "Research \u2014 finds the verbatim claim is partly true. Data shows different patterns across categories." });
  const result = validateReceiptCard(card);
  expect(result.ok).toBe(false);
  expect(result.errors?.[0]).toContain("em dash");
});

test("validateReceiptCard rejects fewer than 3 anchors", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  broken.receipt.anchors = broken.receipt.anchors.slice(0, 2);
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
});

test("validateReceiptCard rejects more than 6 anchors", () => {
  const card = validReceipt();
  const broken = JSON.parse(JSON.stringify(card));
  const extra = { ...broken.receipt.anchors[0], sub_section_anchor: "extra-anchor" };
  broken.receipt.anchors = [...broken.receipt.anchors, broken.receipt.anchors[0], broken.receipt.anchors[0], broken.receipt.anchors[0], extra];
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
});

test("validateReceiptCard rejects pull_quote shorter than 40 chars", () => {
  const card = validReceipt({ pull_quote: "too short" });
  const result = validateReceiptCard(card);
  expect(result.ok).toBe(false);
});

test("validateReceiptCard rejects more than 3 claims", () => {
  const card = validReceipt();
  const c = card.claims[0];
  const broken = JSON.parse(JSON.stringify(card));
  broken.claims = [c, c, c, c];
  const result = validateReceiptCard(broken);
  expect(result.ok).toBe(false);
});
