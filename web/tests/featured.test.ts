import { test, expect } from "vitest";
import { resolveEvidence } from "@/lib/featured";
import type { RecordEntry } from "@/lib/agent/data-loader";

const records: RecordEntry[] = [
  { shortcode: "AAA", kind: "position", topic: "transit", source_quote: "Build the Ontario Line.", post_date: "2024-03-01", source_account: "bradfordgrams" },
  { shortcode: "BBB", kind: "action", topic: "transit", summary: "voted", post_date: "2024-05-01", council_verification: { agenda_item: "2024.GG12.7", vote_disposition: "YES" } },
  { shortcode: "CCC", kind: "position", topic: "transit", post_date: "2024-04-01" }, // no source_quote
];

test("resolveEvidence returns a verbatim quote with source", () => {
  expect(resolveEvidence(records, "AAA")).toEqual({ shortcode: "AAA", quote: "Build the Ontario Line.", date: "2024-03-01", source: "bradfordgrams" });
});

test("resolveEvidence prefers council agenda item as the source label", () => {
  const r = resolveEvidence([{ ...records[1], source_quote: "Yes." }], "BBB");
  expect(r?.source).toBe("Council 2024.GG12.7");
});

test("resolveEvidence returns null when the record is missing or has no source_quote", () => {
  expect(resolveEvidence(records, "CCC")).toBeNull();
  expect(resolveEvidence(records, "ZZZ")).toBeNull();
});
