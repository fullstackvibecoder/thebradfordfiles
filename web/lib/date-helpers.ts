export type Age = "fresh" | "normal" | "stale";

export function ageOf(asOf: string, now: Date = new Date()): Age {
  const parsed = Date.parse(asOf);
  if (!Number.isFinite(parsed)) return "stale";
  const days = Math.floor((now.getTime() - parsed) / 86400000);
  if (days < 14) return "fresh";
  if (days < 60) return "normal";
  return "stale";
}

export function ageOfClass(asOf: string, now: Date = new Date()): string {
  const a = ageOf(asOf, now);
  if (a === "fresh") return "text-success";
  if (a === "stale") return "italic text-muted";
  return "";
}
