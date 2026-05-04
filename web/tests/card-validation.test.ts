import { test, expect } from "vitest";
import { validateCard, containsEmDash } from "@/lib/card-types";

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
