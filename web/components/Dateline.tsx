// Server component. Renders the editorial dateline strip.
// Format: Vol I . No N . Thu 7 May 2026 . Morning Edition

const LAUNCH_DATE_UTC = Date.UTC(2026, 4, 3); // May 3, 2026

function getTorontoParts(now: Date): {
  hour: number;
  weekday: string;
  day: number;
  month: string;
  year: number;
  ymd: string;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hourRaw = get("hour");
  // Intl can return "24" for midnight in some runtimes; normalise.
  const hour = (parseInt(hourRaw, 10) || 0) % 24;
  const weekday = get("weekday");
  const day = parseInt(get("day"), 10) || 1;
  const month = get("month");
  const year = parseInt(get("year"), 10) || now.getUTCFullYear();

  // Compute YMD in Toronto timezone for issue-number math.
  const ymdFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymdParts = ymdFmt.formatToParts(now);
  const y = ymdParts.find((p) => p.type === "year")?.value ?? "";
  const m = ymdParts.find((p) => p.type === "month")?.value ?? "";
  const d = ymdParts.find((p) => p.type === "day")?.value ?? "";
  const ymd = `${y}-${m}-${d}`;

  return { hour, weekday, day, month, year, ymd };
}

function issueNumber(ymd: string): number {
  // ymd is YYYY-MM-DD in Toronto local. Compute days since launch.
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return 1;
  const todayUtc = Date.UTC(y, m - 1, d);
  const days = Math.floor((todayUtc - LAUNCH_DATE_UTC) / 86_400_000);
  return Math.max(1, days);
}

function editionLabel(hour: number): string {
  if (hour < 12) return "Morning Edition";
  if (hour < 17) return "Afternoon Edition";
  return "Evening Edition";
}

export function Dateline() {
  const now = new Date();
  const { hour, weekday, day, month, year, ymd } = getTorontoParts(now);
  const no = issueNumber(ymd);
  const edition = editionLabel(hour);

  return (
    <div className="px-8 pt-4 font-mono text-[11px] text-muted caps-small">
      <span className="text-accent">Vol I . No <span className="nums-tabular">{no}</span></span>
      <span> . {weekday} <span className="nums-tabular">{day}</span> {month} <span className="nums-tabular">{year}</span> . {edition}</span>
    </div>
  );
}
