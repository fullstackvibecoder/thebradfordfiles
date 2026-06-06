import { test, expect } from "vitest";
import { buildSaidVsDone, councilAgendaUrl } from "@/lib/said-vs-done";
import type { RecordEntry } from "@/lib/agent/data-loader";

function rec(over: Partial<RecordEntry>): RecordEntry {
  return { shortcode: "X", kind: "position", topic: "housing", summary: "s", ...over };
}

test("includes only position/pledge with matching topic and non-empty related_votes", () => {
  const records: RecordEntry[] = [
    rec({ shortcode: "P1", kind: "position", topic: "housing", related_votes: [{ confidence: 0.5 }] }),
    rec({ shortcode: "PL1", kind: "pledge", topic: "housing", related_votes: [{ confidence: 0.4 }] }),
    rec({ shortcode: "A1", kind: "action", topic: "housing", council_verification: { agenda_item: "2024.X.1" } }),
    rec({ shortcode: "P2", kind: "position", topic: "transit", related_votes: [{ confidence: 0.9 }] }),
    rec({ shortcode: "P3", kind: "position", topic: "housing", related_votes: [] }),
    rec({ shortcode: "P4", kind: "position", topic: "housing", summary: "", related_votes: [{ confidence: 0.5 }] }),
  ];
  const out = buildSaidVsDone(records, "housing");
  expect(out.items.map(i => i.shortcode).sort()).toEqual(["P1", "PL1"]);
});

test("ranks positions by pairing strength (max confidence, tiebreak count)", () => {
  const records: RecordEntry[] = [
    rec({ shortcode: "MANY_WEAK", related_votes: [{ confidence: 0.3 }, { confidence: 0.3 }, { confidence: 0.3 }] }),
    rec({ shortcode: "ONE_STRONG", related_votes: [{ confidence: 0.8 }] }),
  ];
  expect(buildSaidVsDone(records, "housing").items[0].shortcode).toBe("ONE_STRONG");
});

test("sorts a position's votes by confidence desc", () => {
  const out = buildSaidVsDone([
    rec({ shortcode: "P1", related_votes: [
      { agenda_item: "a", confidence: 0.3 },
      { agenda_item: "b", confidence: 0.7 },
      { agenda_item: "c", confidence: 0.5 },
    ] }),
  ], "housing");
  expect(out.items[0].votes.map(v => v.agenda_item)).toEqual(["b", "c", "a"]);
});

test("empty when no qualifying records", () => {
  expect(buildSaidVsDone([], "housing")).toEqual({ items: [] });
  expect(buildSaidVsDone([rec({ kind: "action", related_votes: undefined })], "housing")).toEqual({ items: [] });
});

test("councilAgendaUrl builds the toronto.ca url, empty for missing id", () => {
  expect(councilAgendaUrl("2024.CC19.4")).toBe("https://secure.toronto.ca/council/agenda-item.do?item=2024.CC19.4");
  expect(councilAgendaUrl("")).toBe("");
  expect(councilAgendaUrl(undefined)).toBe("");
});
