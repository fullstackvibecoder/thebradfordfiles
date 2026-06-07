import { notFound } from "next/navigation";
import { listCandidates, getSynthesis, getRecordsForHandle } from "@/lib/agent/data-loader";
import { buildSaidVsDone } from "@/lib/said-vs-done";
import { SaidVsDone } from "@/components/SaidVsDone";
import { DropCap } from "@/components/DropCap";
import { CandidateStatStrip } from "@/components/CandidateStatStrip";
import { ConsistencyTimeline } from "@/components/ConsistencyTimeline";

const TOPIC_LABELS: Record<string, string> = {
  housing: "Housing",
  transit: "Transit",
  safety_crime: "Public safety",
  taxes_fiscal: "Tax & fiscal",
  parks_environment: "Parks & environment",
  infrastructure: "Infrastructure",
  civic_engagement: "Civic engagement",
  governance_ethics: "Governance & ethics",
  small_business_economy: "Small business",
  social_services: "Social services",
};

const TOPICS = Object.keys(TOPIC_LABELS);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cand = listCandidates().find(c => c.slug === slug);
  return {
    title: cand ? `${cand.display_name} . The Mayoral Record` : "Not found",
    openGraph: cand ? {
      images: [{ url: `/api/og?type=candidate&name=${encodeURIComponent(cand.display_name)}&records=${cand.record_count ?? 0}&dot=${cand.consistency_dot ?? "gray"}&files_label=${encodeURIComponent("The " + cand.surname + " Files")}`, width: 1200, height: 630 }],
    } : undefined,
  };
}

export default async function CandidatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cands = listCandidates();
  const cand = cands.find(c => c.slug === slug);
  if (!cand) notFound();

  const records = getRecordsForHandle(slug);

  return (
    <main className="max-w-[840px] mx-auto px-8 py-10">
      <h1 className="font-serif font-bold text-[28px] leading-[1.2] text-ink mb-1.5">{cand.display_name}</h1>
      {cand.current_role && <p className="font-sans text-[13px] text-muted mb-2">{cand.current_role}</p>}

      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-xs text-muted caps-small">Consistency</span>
        <ConsistencyTimeline slug={slug} />
      </div>

      <CandidateStatStrip slug={slug} />

      <div className="space-y-8">
        {TOPICS.map(topic => {
          const cell = getSynthesis(slug, topic);
          if (!cell?.summary) return null;
          return (
            <section key={topic} className="border-l-[3px] border-accent pl-4">
              <div className="label mb-2">{TOPIC_LABELS[topic]}</div>
              <DropCap>{cell.summary}</DropCap>
              {cell.consistency?.label && (
                <div className="font-mono text-[10.5px] uppercase tracking-label text-muted mt-2">
                  {cell.consistency.label}{cell.consistency.stable_since ? ` since ${cell.consistency.stable_since}` : ""}
                </div>
              )}
              <SaidVsDone topic={buildSaidVsDone(records, topic)} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
