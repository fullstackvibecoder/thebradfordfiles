import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateReceiptCard, type ReceiptCard } from "./receipt-types";

let RECEIPT_DIR = join(process.cwd(), "public", "data", "receipts");

export function setReceiptDataDir(path: string): void {
  RECEIPT_DIR = path;
}

export function listReceipts(): ReceiptCard[] {
  if (!existsSync(RECEIPT_DIR)) return [];
  const files = readdirSync(RECEIPT_DIR).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_")
  );
  const out: ReceiptCard[] = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(RECEIPT_DIR, f), "utf-8"));
    const result = validateReceiptCard(raw);
    if (result.ok && result.card) out.push(result.card);
  }
  return out.sort((a, b) => a.topic_short.localeCompare(b.topic_short));
}

export function getReceipt(slug: string): ReceiptCard | null {
  const path = join(RECEIPT_DIR, slug + ".json");
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const result = validateReceiptCard(raw);
  return result.ok && result.card ? result.card : null;
}

export function listReceiptSlugs(): string[] {
  return listReceipts().map((c) => c.slug);
}
