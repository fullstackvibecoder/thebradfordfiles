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

import { deriveDivergences, deriveContradictions } from "@/lib/featured";
import type { SynthesisCell, CandidateLanding } from "@/lib/agent/data-loader";

const cands: CandidateLanding[] = [
  { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
  { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
];

test("deriveDivergences pairs two candidates on a shared topic using verbatim quotes", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "transit", summary: null, consistency: null, input_record_count: 40, key_positions: [{ stance: "rail", supporting_records: ["B1"] }] },
    { candidate_handle: "c", candidate_slug: "chow", topic: "transit", summary: null, consistency: null, input_record_count: 20, key_positions: [{ stance: "fares", supporting_records: ["C1"] }] },
  ];
  const recs = new Map([
    ["bradford", [{ shortcode: "B1", kind: "position", topic: "transit", source_quote: "Build the Ontario Line.", post_date: "2024-01-01", council_verification: { agenda_item: "GG12.7", vote_disposition: "YES" } }]],
    ["chow", [{ shortcode: "C1", kind: "position", topic: "transit", source_quote: "Freeze fares.", post_date: "2024-02-01", council_verification: { agenda_item: "GG12.7", vote_disposition: "NO" } }]],
  ]);
  const out = deriveDivergences(cells, recs, cands);
  expect(out).toHaveLength(1);
  expect(out[0].topic).toBe("transit");
  expect(out[0].a.quote).toBe("Build the Ontario Line.");
  expect(out[0].b.quote).toBe("Freeze fares.");
  // opposing votes on the same agenda item boost the score above the base
  expect(out[0].score).toBeGreaterThan(500);
});

test("deriveDivergences drops a topic where a side has no resolvable evidence", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "housing", summary: null, consistency: null, key_positions: [{ stance: "x", supporting_records: ["MISSING"] }] },
    { candidate_handle: "c", candidate_slug: "chow", topic: "housing", summary: null, consistency: null, key_positions: [{ stance: "y", supporting_records: ["C9"] }] },
  ];
  const recs = new Map([["chow", [{ shortcode: "C9", kind: "position", source_quote: "q", post_date: "" }]]]);
  expect(deriveDivergences(cells, recs, cands)).toHaveLength(0);
});

test("deriveContradictions emits nothing when consistency is not evolving/shifted", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "transit", summary: null, consistency: { label: "consistent", changes: [] }, key_positions: [] },
  ];
  expect(deriveContradictions(cells, new Map(), cands)).toHaveLength(0);
});

test("deriveContradictions emits an entry for an evolving cell with two resolvable change anchors", () => {
  const cells: SynthesisCell[] = [
    { candidate_handle: "b", candidate_slug: "bradford", topic: "taxes_fiscal", summary: null,
      consistency: { label: "evolving", changes: [{ date: "2025-01-01", from: { stance: "against", records: ["E1"] }, to: { stance: "for", records: ["E2"] } }] },
      key_positions: [] },
  ];
  const recs = new Map([["bradford", [
    { shortcode: "E1", kind: "quote", source_quote: "No new taxes.", post_date: "2022-03-01", source_account: "cp24" },
    { shortcode: "E2", kind: "quote", source_quote: "Tax is on the table.", post_date: "2025-11-01", source_account: "now" },
  ]]]);
  const out = deriveContradictions(cells, recs, cands);
  expect(out).toHaveLength(1);
  expect(out[0].display_name).toBe("Brad Bradford");
  expect(out[0].earlier.quote).toBe("No new taxes.");
  expect(out[0].later.quote).toBe("Tax is on the table.");
});
