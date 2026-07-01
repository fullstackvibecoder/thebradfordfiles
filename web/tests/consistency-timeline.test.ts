import { test, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setDataDir, getSynthesis } from "@/lib/agent/data-loader";
import { tickColor } from "@/components/ConsistencyTimeline";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "tomr-timeline-"));
  setDataDir(tmp);
  mkdirSync(join(tmp, "synthesis", "bradfordgrams"), { recursive: true });
});

function writeCell(handle: string, topic: string, label: string | null) {
  writeFileSync(
    join(tmp, "synthesis", handle, topic + ".json"),
    JSON.stringify({
      candidate_handle: handle,
      candidate_slug: handle === "bradfordgrams" ? "bradford" : "chow",
      topic,
      summary: "summary",
      consistency: label ? { label, changes: [] } : null,
    })
  );
}

test("tickColor returns the correct color for known labels", () => {
  expect(tickColor("consistent")).toBe("bg-success");
  expect(tickColor("evolving")).toBe("bg-signal");
  expect(tickColor("shifted")).toBe("bg-accent");
});

test("tickColor returns placeholder color for null, undefined, or unknown labels", () => {
  expect(tickColor(null)).toBe("bg-stamp-border");
  expect(tickColor(undefined)).toBe("bg-stamp-border");
  expect(tickColor("unknown_label")).toBe("bg-stamp-border");
  expect(tickColor("")).toBe("bg-stamp-border");
});

test("getSynthesis reads consistency labels written to disk", () => {
  writeCell("bradfordgrams", "housing", "consistent");
  writeCell("bradfordgrams", "transit", "evolving");
  writeCell("bradfordgrams", "safety_crime", "shifted");
  expect(getSynthesis("bradford", "housing")?.consistency?.label).toBe("consistent");
  expect(getSynthesis("bradford", "transit")?.consistency?.label).toBe("evolving");
  expect(getSynthesis("bradford", "safety_crime")?.consistency?.label).toBe("shifted");
});

test("getSynthesis returns null when cell is missing", () => {
  expect(getSynthesis("bradford", "housing")).toBeNull();
});
