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
