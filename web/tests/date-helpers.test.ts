import { test, expect } from "vitest";
import { ageOf, ageOfClass } from "@/lib/date-helpers";

test("ageOf returns fresh for dates within 14 days", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("2026-05-10", now)).toBe("fresh");
  expect(ageOf("2026-05-01", now)).toBe("fresh");
  expect(ageOf("2026-04-28", now)).toBe("fresh");
});

test("ageOf returns normal for dates 14 to 60 days old", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("2026-04-15", now)).toBe("normal");
  expect(ageOf("2026-03-20", now)).toBe("normal");
});

test("ageOf returns stale for dates older than 60 days", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("2025-12-15", now)).toBe("stale");
  expect(ageOf("2024-01-01", now)).toBe("stale");
});

test("ageOf returns stale for unparseable input", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOf("not-a-date", now)).toBe("stale");
});

test("ageOfClass returns the right Tailwind class for each bucket", () => {
  const now = new Date("2026-05-11T00:00:00Z");
  expect(ageOfClass("2026-05-10", now)).toBe("text-[#7aa67a]");
  expect(ageOfClass("2026-04-15", now)).toBe("");
  expect(ageOfClass("2024-01-01", now)).toBe("italic text-[#5a5a55]");
});
