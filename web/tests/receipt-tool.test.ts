import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setReceiptDataDir } from "@/lib/receipt-loader";
import { getClaimAudit, type RedisLogger } from "@/lib/agent/receipt-tool";
import { validReceipt } from "./fixtures/valid-receipt";

let tmp: string;

const crime = validReceipt({
  slug: "crime-trends",
  topic: "Crime in Toronto, 2018 to present",
  topic_short: "Crime trends",
  pull_quote: "The data shows auto theft surged in 2023 and has retreated. Violent crime indicators are mixed across the same window.",
});
const transit = validReceipt({
  slug: "ttc-performance",
  topic: "TTC ridership, safety, and service",
  topic_short: "TTC performance",
  pull_quote: "TTC ridership recovery has reached 80 percent of pre-pandemic levels. Safety incidents per million boardings are trending down.",
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-receipt-tool-"));
  setReceiptDataDir(tmp);
  const crimeWithAnchor = JSON.parse(JSON.stringify(crime));
  crimeWithAnchor.receipt.anchors[0].sub_section_anchor = "auto-theft-trend";
  crimeWithAnchor.receipt.anchors[0].sub_claim = "Auto theft trend in Toronto";
  crimeWithAnchor.receipt.anchors[0].finding = "Auto thefts surged in 2023 to peak levels and have since retreated.";
  writeFileSync(join(tmp, "crime-trends.json"), JSON.stringify(crimeWithAnchor));
  writeFileSync(join(tmp, "ttc-performance.json"), JSON.stringify(transit));
});

class FakeLogger implements RedisLogger {
  pushed: string[] = [];
  trims: [string, number, number][] = [];
  async lpush(key: string, value: string) { this.pushed.push(key + ":" + value); return 1; }
  async ltrim(key: string, start: number, stop: number) { this.trims.push([key, start, stop]); return "OK"; }
}

test("matches via topic_hint exact", async () => {
  const r = await getClaimAudit(
    { query: "irrelevant text", topic_hint: "crime-trends" },
    null,
    "agent reasoned about a hint"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("crime-trends");
});

test("matches with anchor when sub-claim overlap is strong", async () => {
  const r = await getClaimAudit(
    { query: "Is auto theft really up in Toronto?" },
    null,
    "auto theft keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") {
    expect(r.slug).toBe("crime-trends");
    expect(r.anchor).toBe("auto-theft-trend");
  }
});

test("matches without anchor when query is general", async () => {
  const r = await getClaimAudit(
    { query: "Is Toronto crime exploding?" },
    null,
    "general crime"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") {
    expect(r.slug).toBe("crime-trends");
  }
});

test("matches transit query to TTC card", async () => {
  const r = await getClaimAudit(
    { query: "Has TTC ridership recovered post-pandemic?" },
    null,
    "transit keywords"
  );
  expect(r.status).toBe("matched");
  if (r.status === "matched") expect(r.slug).toBe("ttc-performance");
});

test("returns no_match for clearly off-topic query", async () => {
  const logger = new FakeLogger();
  const r = await getClaimAudit(
    { query: "What is the best pizza topping?" },
    logger,
    "no receipt applies"
  );
  expect(r.status).toBe("no_match");
});

test("logs no_match queries to Redis with timestamp and reasoning", async () => {
  const logger = new FakeLogger();
  await getClaimAudit(
    { query: "Tell me about constellations" },
    logger,
    "scenario corpus does not cover astronomy"
  );
  expect(logger.pushed).toHaveLength(1);
  const entry = logger.pushed[0];
  expect(entry).toContain("receipts:unmatched:");
  expect(entry).toContain("constellations");
  expect(entry).toContain("astronomy");
});

test("trims the Redis list to 1000 entries on each no_match", async () => {
  const logger = new FakeLogger();
  await getClaimAudit({ query: "completely unrelated" }, logger, "no match");
  expect(logger.trims).toEqual([["receipts:unmatched", 0, 999]]);
});

test("returns no_match when no receipts are loaded", async () => {
  const empty = mkdtempSync(join(tmpdir(), "tomr-empty-receipts-"));
  setReceiptDataDir(empty);
  const r = await getClaimAudit({ query: "anything" }, null, "no corpus");
  expect(r.status).toBe("no_match");
});
