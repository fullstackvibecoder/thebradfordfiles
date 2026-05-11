// Server component. Renders a stat strip across the top of a candidate page.
import type { ReactNode } from "react";
import { listCandidates, getSynthesis, getRecordsForHandle } from "@/lib/agent/data-loader";
import { Sparkline } from "@/components/Sparkline";

const TOPICS = [
  "housing",
  "transit",
  "safety_crime",
  "taxes_fiscal",
  "parks_environment",
  "infrastructure",
  "civic_engagement",
  "governance_ethics",
  "small_business_economy",
  "social_services",
];

const DOT_TO_LABEL: Record<string, string> = {
  green: "Consistent",
  yellow: "Evolving",
  red: "Shifted",
  gray: "n/a",
};

function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return n.toLocaleString();
}

function consistencyLabel(slug: string, dot: string | null | undefined): string {
  if (dot && DOT_TO_LABEL[dot]) return DOT_TO_LABEL[dot];
  // Aggregate from synthesis cells.
  const labels: string[] = [];
  for (const t of TOPICS) {
    const cell = getSynthesis(slug, t);
    const lbl = cell?.consistency?.label;
    if (lbl) labels.push(lbl.toLowerCase());
  }
  if (labels.length === 0) return "n/a";
  const counts: Record<string, number> = {};
  for (const l of labels) counts[l] = (counts[l] ?? 0) + 1;
  let best = "";
  let bestCount = -1;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  if (best.startsWith("consistent")) return "Consistent";
  if (best.startsWith("evolving")) return "Evolving";
  if (best.startsWith("shift")) return "Shifted";
  if (best.length === 0) return "n/a";
  return best.charAt(0).toUpperCase() + best.slice(1);
}

interface Stat {
  label: string;
  value: string;
  extra?: ReactNode;
}

function Cell({ stat }: { stat: Stat }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[11px] text-muted caps-small">{stat.label}</span>
      <span className="font-serif font-bold text-[22px] leading-tight text-ink nums-tabular inline-flex items-center">
        <span>{stat.value}</span>
        {stat.extra}
      </span>
    </div>
  );
}

export function CandidateStatStrip({ slug }: { slug: string }) {
  let cand: ReturnType<typeof listCandidates>[number] | undefined;
  try {
    cand = listCandidates().find((c) => c.slug === slug);
  } catch {
    cand = undefined;
  }

  const records = (() => {
    try {
      return getRecordsForHandle(slug);
    } catch {
      return [];
    }
  })();

  let topicCount = 0;
  for (const t of TOPICS) {
    try {
      const cell = getSynthesis(slug, t);
      if (cell?.summary) topicCount += 1;
    } catch {
      // ignore
    }
  }

  const verifiedVotes = records.filter(
    (r) => r.kind === "action" && r.council_verification?.agenda_item,
  ).length;

  const stats: Stat[] = [
    { label: "Records", value: formatNumber(cand?.record_count), extra: <Sparkline slug={slug} /> },
    { label: "Topics", value: topicCount > 0 ? topicCount.toLocaleString() : "n/a" },
    { label: "Verified votes", value: verifiedVotes >= 0 ? verifiedVotes.toLocaleString() : "n/a" },
    { label: "Window", value: "18 mo." },
    { label: "Consistency", value: consistencyLabel(slug, cand?.consistency_dot) },
  ];

  return (
    <div className="border-t border-b border-[#2a2520] py-5 my-6">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {stats.map((s) => (
          <Cell key={s.label} stat={s} />
        ))}
      </div>
    </div>
  );
}
