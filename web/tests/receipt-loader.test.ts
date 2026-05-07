import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setReceiptDataDir, listReceipts, getReceipt, listReceiptSlugs } from "@/lib/receipt-loader";
import { validReceipt } from "./fixtures/valid-receipt";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-receipts-"));
  setReceiptDataDir(tmp);
});

test("listReceipts returns empty when directory is empty", () => {
  expect(listReceipts()).toEqual([]);
});

test("listReceipts loads valid JSON files", () => {
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validReceipt({ slug: "a", topic_short: "A topic" })));
  writeFileSync(join(tmp, "b.json"), JSON.stringify(validReceipt({ slug: "b", topic_short: "B topic" })));
  const cards = listReceipts();
  expect(cards).toHaveLength(2);
  expect(cards.map((c) => c.slug)).toEqual(["a", "b"]);
});

test("listReceipts skips invalid JSON", () => {
  writeFileSync(join(tmp, "valid.json"), JSON.stringify(validReceipt({ slug: "valid" })));
  writeFileSync(join(tmp, "broken.json"), JSON.stringify({ slug: "broken" }));
  const cards = listReceipts();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("valid");
});

test("listReceipts skips files starting with underscore", () => {
  writeFileSync(join(tmp, "_fixture.json"), JSON.stringify(validReceipt({ slug: "fixture" })));
  writeFileSync(join(tmp, "real.json"), JSON.stringify(validReceipt({ slug: "real" })));
  const cards = listReceipts();
  expect(cards).toHaveLength(1);
  expect(cards[0].slug).toBe("real");
});

test("getReceipt returns the card by slug", () => {
  writeFileSync(join(tmp, "crime.json"), JSON.stringify(validReceipt({ slug: "crime", topic_short: "Crime" })));
  const card = getReceipt("crime");
  expect(card?.slug).toBe("crime");
});

test("getReceipt returns null for unknown slug", () => {
  expect(getReceipt("nonexistent")).toBeNull();
});

test("listReceiptSlugs returns all valid slugs sorted by topic_short", () => {
  writeFileSync(join(tmp, "z.json"), JSON.stringify(validReceipt({ slug: "z", topic_short: "Z" })));
  writeFileSync(join(tmp, "a.json"), JSON.stringify(validReceipt({ slug: "a", topic_short: "A" })));
  expect(listReceiptSlugs()).toEqual(["a", "z"]);
});
