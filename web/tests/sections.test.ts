import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir } from "@/lib/agent/data-loader";
import { getSectionCounts, getCandidateSummaries } from "@/lib/sections";

let tmp: string;

function writeLanding(candidates: unknown[]) {
  writeFileSync(join(tmp, "landing.json"), JSON.stringify({ candidates }));
}
function writeDossier(slug: string, records: unknown[]) {
  mkdirSync(join(tmp, "candidates"), { recursive: true });
  writeFileSync(join(tmp, "candidates", `${slug}.json`), JSON.stringify({ records }));
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-sections-"));
  setDataDir(tmp);
});

test("getSectionCounts tallies records per topic across candidates, excludes zero, sorts desc", () => {
  writeLanding([
    { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
    { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
  ]);
  writeDossier("bradford", [
    { shortcode: "A", kind: "position", topic: "housing" },
    { shortcode: "B", kind: "position", topic: "housing" },
    { shortcode: "C", kind: "position", topic: "transit" },
    { shortcode: "D", kind: "position" }, // no topic -> ignored
  ]);
  writeDossier("chow", [
    { shortcode: "E", kind: "position", topic: "housing" },
    { shortcode: "F", kind: "position", topic: "transit" },
  ]);
  const s = getSectionCounts();
  expect(s[0]).toMatchObject({ topic: "housing", label: "Housing", count: 3 });
  expect(s[1]).toMatchObject({ topic: "transit", label: "Transit", count: 2 });
  // topics with zero records are absent
  expect(s.find(x => x.topic === "social_services")).toBeUndefined();
  // every section carries a non-empty search query
  expect(s[0].query.length).toBeGreaterThan(0);
});

test("getSectionCounts caps at 6 sections", () => {
  writeLanding([{ slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" }]);
  const topics = ["housing", "transit", "safety_crime", "taxes_fiscal", "parks_environment", "infrastructure", "civic_engagement", "governance_ethics"];
  writeDossier("bradford", topics.map((t, i) => ({ shortcode: `R${i}`, kind: "position", topic: t })));
  expect(getSectionCounts()).toHaveLength(6);
});

test("getCandidateSummaries prefers record_count, falls back to record array length", () => {
  writeLanding([
    { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford", record_count: 5650 },
    { slug: "chow", display_name: "Olivia Chow", surname: "Chow" }, // no record_count
  ]);
  writeDossier("chow", [{ shortcode: "E", kind: "position", topic: "housing" }, { shortcode: "F", kind: "position", topic: "transit" }]);
  const c = getCandidateSummaries();
  expect(c[0]).toEqual({ slug: "bradford", display_name: "Brad Bradford", record_count: 5650 });
  expect(c[1]).toEqual({ slug: "chow", display_name: "Olivia Chow", record_count: 2 });
});

test("getCandidateSummaries returns candidates sorted by record_count descending", () => {
  writeLanding([
    { slug: "mcvie", display_name: "Sarah McVie", surname: "McVie", record_count: 31 },
    { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford", record_count: 5650 },
    { slug: "chow", display_name: "Olivia Chow", surname: "Chow", record_count: 452 },
  ]);
  const c = getCandidateSummaries();
  expect(c.map(x => x.slug)).toEqual(["bradford", "chow", "mcvie"]);
});
