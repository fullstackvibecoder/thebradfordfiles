import { test, expect } from "vitest";
import { validateCard, containsEmDash, normalizeEmDash } from "@/lib/card-types";

test("validateCard accepts a well-formed single_answer card", () => {
  const result = validateCard({
    type: "single_answer",
    query_restated: "How did Bradford vote?",
    answer: "Bradford voted YES.",
    evidence: [{ label: "COUNCIL . 2024.GG12.7" }],
    follow_ups: ["What about Chow?"],
  });
  expect(result?.type).toBe("single_answer");
});

test("validateCard rejects a missing type", () => {
  const result = validateCard({ query_restated: "x", answer: "y", evidence: [], follow_ups: [] });
  expect(result).toBeNull();
});

test("validateCard rejects a comparison card with fewer than 2 candidates", () => {
  const result = validateCard({
    type: "comparison",
    query_restated: "Compare X and Y",
    candidates: [],
    topic: "housing",
    divergences: [],
    follow_ups: [],
  });
  expect(result).toBeNull();
});

test("validateCard accepts a record_trail card", () => {
  const result = validateCard({
    type: "record_trail",
    query_restated: "How has X evolved?",
    theme: "Bradford on transit, 2018 to present",
    entries: [],
    follow_ups: [],
  });
  expect(result?.type).toBe("record_trail");
});

test("containsEmDash detects em dashes in answer text", () => {
  const card = {
    type: "single_answer" as const,
    query_restated: "x",
    answer: "Bradford supports A — not B.",
    evidence: [],
    follow_ups: [],
  };
  expect(containsEmDash(card)).toBe(true);
});

test("containsEmDash returns false for clean text", () => {
  const card = {
    type: "single_answer" as const,
    query_restated: "x",
    answer: "Bradford supports A. He does not support B.",
    evidence: [],
    follow_ups: [],
  };
  expect(containsEmDash(card)).toBe(false);
});

test("normalizeEmDash strips em dashes from a card while preserving the answer", () => {
  const card = {
    type: "single_answer" as const,
    query_restated: "x",
    answer: "Residents' expectations have not lowered — City Hall's have.",
    evidence: [{ label: "IG . Gloves Up Toronto — Police Week" }],
    follow_ups: ["Compare candidates on a topic."],
  };
  const cleaned = normalizeEmDash(card);
  expect(containsEmDash(cleaned)).toBe(false);
  expect(cleaned.answer).toBe("Residents' expectations have not lowered, City Hall's have.");
  expect(cleaned.evidence[0].label).toBe("IG . Gloves Up Toronto, Police Week");
});

test("validateCard accepts a single_answer card missing evidence and coerces it to []", () => {
  const result = validateCard({
    type: "single_answer",
    query_restated: "Bradford on housing?",
    answer: "Bradford backs more supply.",
    follow_ups: ["Compare with Chow"],
  });
  expect(result?.type).toBe("single_answer");
  expect((result as { evidence: unknown[] }).evidence).toEqual([]);
});

test("validateCard still rejects a single_answer card with no answer", () => {
  const result = validateCard({
    type: "single_answer",
    query_restated: "x",
    follow_ups: ["y"],
  });
  expect(result).toBeNull();
});

test("validateCard accepts comparison candidates keyed 'name' and maps to display_name", () => {
  const result = validateCard({
    type: "comparison",
    query_restated: "Compare on transit",
    candidates: [
      { slug: "bradford", name: "Brad Bradford", summary: "..." },
      { slug: "chow", name: "Olivia Chow", summary: "..." },
    ],
    follow_ups: ["More"],
  });
  expect(result?.type).toBe("comparison");
  const cands = (result as { candidates: { display_name: string }[] }).candidates;
  expect(cands[0].display_name).toBe("Brad Bradford");
  expect(cands[1].display_name).toBe("Olivia Chow");
});

test("validateCard accepts a comparison candidate missing slug and coerces topic/divergences", () => {
  const result = validateCard({
    type: "comparison",
    query_restated: "Compare on transit",
    candidates: [
      { name: "Brad Bradford" },
      { name: "Olivia Chow" },
    ],
    follow_ups: ["More"],
  });
  expect(result?.type).toBe("comparison");
  const r = result as { candidates: { slug: string }[]; topic: string; divergences: unknown[] };
  expect(r.candidates[0].slug).toBe("");
  expect(r.topic).toBe("");
  expect(r.divergences).toEqual([]);
});

test("validateCard rejects a comparison candidate with neither slug/name nor display_name", () => {
  const result = validateCard({
    type: "comparison",
    query_restated: "Compare",
    candidates: [{ summary: "no name here" }, { name: "Olivia Chow" }],
    follow_ups: ["More"],
  });
  expect(result).toBeNull();
});

test("validateCard accepts a record_trail card missing theme/entries and coerces them", () => {
  const result = validateCard({
    type: "record_trail",
    query_restated: "How has X evolved?",
    follow_ups: ["More"],
  });
  expect(result?.type).toBe("record_trail");
  const r = result as { theme: string; entries: unknown[] };
  expect(r.theme).toBe("");
  expect(r.entries).toEqual([]);
});

test("normalizeEmDash leaves a clean card unchanged", () => {
  const card = {
    type: "single_answer" as const,
    query_restated: "How did Bradford vote?",
    answer: "Bradford voted YES.",
    evidence: [{ label: "COUNCIL . 2024.GG12.7" }],
    follow_ups: ["What about Chow?"],
  };
  expect(normalizeEmDash(card)).toEqual(card);
});
