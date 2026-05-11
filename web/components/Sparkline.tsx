import { getRecordsForHandle } from "@/lib/agent/data-loader";

export interface MonthlyPoint {
  month: string;  // YYYY-MM
  count: number;
}

export function deriveMonthlyCadence(records: Array<{ post_date?: string }>): MonthlyPoint[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (typeof r.post_date !== "string" || r.post_date.length < 7) continue;
    const month = r.post_date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function lastNMonthsWindow(points: MonthlyPoint[], n: number, today: Date): MonthlyPoint[] {
  const out: MonthlyPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getUTCFullYear(), today.getUTCMonth() - i, 1);
    const month = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
    const existing = points.find((p) => p.month === month);
    out.push({ month, count: existing?.count ?? 0 });
  }
  return out;
}

function buildPath(points: MonthlyPoint[], width: number, height: number): string {
  if (points.length === 0) return "";
  const max = Math.max(1, ...points.map((p) => p.count));
  const xStep = points.length > 1 ? width / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = (i * xStep).toFixed(2);
      const y = (height - (p.count / max) * height).toFixed(2);
      return (i === 0 ? "M" : "L") + x + " " + y;
    })
    .join(" ");
}

export function Sparkline({ slug }: { slug: string }) {
  const records = getRecordsForHandle(slug);
  if (records.length === 0) return null;
  const cadence = deriveMonthlyCadence(records);
  const windowed = lastNMonthsWindow(cadence, 12, new Date());
  const totalCount = windowed.reduce((acc, p) => acc + p.count, 0);
  if (totalCount === 0) return null;

  const path = buildPath(windowed, 60, 16);
  const recentSummary = windowed
    .slice(-3)
    .map((p) => p.month + ": " + p.count)
    .join(", ");

  return (
    <svg
      width={60}
      height={16}
      viewBox="0 0 60 16"
      role="img"
      aria-label="Record posting cadence, last 12 months"
      className="inline-block align-middle ml-2"
    >
      <title>{recentSummary}</title>
      <path d={path} fill="none" stroke="#c4923a" strokeWidth={1} />
    </svg>
  );
}
