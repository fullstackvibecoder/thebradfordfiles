import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir } from "@/lib/agent/data-loader";
import * as tools from "@/lib/agent/tools";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-tools-"));
  setDataDir(tmp);
  writeFileSync(join(tmp, "landing.json"), JSON.stringify({
    candidates: [
      { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
      { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
    ],
  }));
  mkdirSync(join(tmp, "candidates"), { recursive: true });
  writeFileSync(join(tmp, "candidates", "bradford.json"), JSON.stringify({
    meta: { handle: "bradfordgrams", slug: "bradford" },
    records: [
      { shortcode: "A1", kind: "position", topic: "transit", summary: "supports TTC", post_date: "2024-01-01" },
      { shortcode: "A2", kind: "action", topic: "housing", summary: "voted yes on multiplex", post_date: "2024-06-01",
        council_verification: { agenda_item: "2024.PH7.4", vote_disposition: "Yes", confidence: 0.97 } },
      { shortcode: "A3", kind: "endorsement", topic: "civic_engagement", summary: "endorsed by X" },
    ],
  }));
});

test("list_candidates returns the manifest from landing.json", () => {
  const result = tools.list_candidates();
  expect(result.candidates).toHaveLength(2);
});

test("search_records filters by handle", () => {
  const result = tools.search_records({ slug: "bradford" });
  expect(result.records).toHaveLength(3);
});

test("search_records filters by topic", () => {
  const result = tools.search_records({ slug: "bradford", topic: "transit" });
  expect(result.records).toHaveLength(1);
  expect(result.records[0].shortcode).toBe("A1");
});

test("search_records filters by kind", () => {
  const result = tools.search_records({ slug: "bradford", kind: "action" });
  expect(result.records).toHaveLength(1);
});

test("search_records query matches summary text", () => {
  const result = tools.search_records({ slug: "bradford", query: "multiplex" });
  expect(result.records).toHaveLength(1);
});

test("lookup_council_vote by agenda item finds the matching record", () => {
  const result = tools.lookup_council_vote({ agenda_item: "2024.PH7.4" });
  expect(result.matches).toHaveLength(1);
  expect(result.matches[0].vote_disposition).toBe("Yes");
});

test("get_record_detail returns full record by shortcode", () => {
  const result = tools.get_record_detail({ shortcode: "A2" });
  expect(result.record?.kind).toBe("action");
});

test("get_record_detail returns null for unknown shortcode", () => {
  const result = tools.get_record_detail({ shortcode: "ZZZ" });
  expect(result.record).toBeNull();
});
