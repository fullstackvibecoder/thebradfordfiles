import { test, expect } from "vitest";
import { deriveMonthlyCadence, lastNMonthsWindow, type MonthlyPoint } from "@/components/Sparkline";

test("deriveMonthlyCadence groups records by post_date month", () => {
  const records = [
    { post_date: "2025-12-15" },
    { post_date: "2025-12-20" },
    { post_date: "2025-11-10" },
    { post_date: "2024-06-01" },
  ];
  const result = deriveMonthlyCadence(records);
  expect(result).toEqual([
    { month: "2024-06", count: 1 },
    { month: "2025-11", count: 1 },
    { month: "2025-12", count: 2 },
  ]);
});

test("deriveMonthlyCadence ignores records without valid post_date", () => {
  const records = [
    { post_date: "2025-12-15" },
    { post_date: undefined },
    { post_date: "bad" },
    {},
  ];
  const result = deriveMonthlyCadence(records as Array<{ post_date?: string }>);
  expect(result).toEqual([{ month: "2025-12", count: 1 }]);
});

test("lastNMonthsWindow fills zero for missing months and trims to N", () => {
  const points: MonthlyPoint[] = [
    { month: "2025-12", count: 5 },
    { month: "2025-10", count: 2 },
  ];
  const today = new Date(Date.UTC(2025, 11, 31));  // 2025-12-31 UTC
  const windowed = lastNMonthsWindow(points, 3, today);
  expect(windowed).toHaveLength(3);
  expect(windowed.map((p) => p.month)).toEqual(["2025-10", "2025-11", "2025-12"]);
  expect(windowed.map((p) => p.count)).toEqual([2, 0, 5]);
});

test("lastNMonthsWindow returns N entries when input is empty", () => {
  const today = new Date(Date.UTC(2025, 5, 15));  // 2025-06-15 UTC
  const windowed = lastNMonthsWindow([], 12, today);
  expect(windowed).toHaveLength(12);
  expect(windowed.every((p) => p.count === 0)).toBe(true);
});
