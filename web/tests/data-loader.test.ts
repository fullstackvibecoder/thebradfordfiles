import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir, listCandidates, getSynthesis, getRecordsForHandle } from "@/lib/agent/data-loader";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-data-"));
  setDataDir(tmp);
});

test("listCandidates returns landing.json's candidate array", () => {
  writeFileSync(join(tmp, "landing.json"), JSON.stringify({
    candidates: [
      { slug: "bradford", display_name: "Brad Bradford", surname: "Bradford" },
      { slug: "chow", display_name: "Olivia Chow", surname: "Chow" },
    ],
  }));
  const cands = listCandidates();
  expect(cands).toHaveLength(2);
  expect(cands[0].slug).toBe("bradford");
});

test("getSynthesis loads a topic cell", () => {
  mkdirSync(join(tmp, "synthesis", "bradfordgrams"), { recursive: true });
  writeFileSync(join(tmp, "synthesis", "bradfordgrams", "transit.json"), JSON.stringify({
    candidate_handle: "bradfordgrams",
    candidate_slug: "bradford",
    topic: "transit",
    summary: "Bradford has...",
    consistency: { label: "evolving", changes: [] },
  }));
  const cell = getSynthesis("bradford", "transit");
  expect(cell?.summary).toContain("Bradford has");
});

test("getSynthesis returns null when handle has no synthesis", () => {
  expect(getSynthesis("nonexistent", "transit")).toBeNull();
});

test("getRecordsForHandle reads candidate dossier", () => {
  mkdirSync(join(tmp, "candidates"), { recursive: true });
  writeFileSync(join(tmp, "candidates", "bradford.json"), JSON.stringify({
    meta: { handle: "bradfordgrams", slug: "bradford" },
    records: [
      { shortcode: "A1", kind: "position", topic: "transit", summary: "supports TTC" },
      { shortcode: "B1", kind: "action", topic: "housing", summary: "voted yes" },
    ],
  }));
  const records = getRecordsForHandle("bradford");
  expect(records).toHaveLength(2);
});
