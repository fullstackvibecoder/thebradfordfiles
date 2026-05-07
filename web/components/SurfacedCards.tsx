import { pickSurfacedCards, type SurfacedCard } from "@/lib/surfaced";

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

function cardLabel(c: SurfacedCard): string {
  if (c.type === "stance_evolved") return "Stance evolved";
  if (c.type === "verified_vote") return "Verified vote";
  return "From the synthesis";
}

function cardTitle(c: SurfacedCard): string {
  if (c.type === "stance_evolved") return `${c.candidate_name} on ${TOPIC_LABELS[c.topic] ?? c.topic}`;
  if (c.type === "verified_vote") return `${c.candidate_name} voted ${c.vote_disposition} on ${c.agenda_item}`;
  return `${c.candidate_name} on ${TOPIC_LABELS[c.topic] ?? c.topic}`;
}

export function SurfacedCards() {
  const cards = pickSurfacedCards();
  if (cards.length === 0) return null;
  return (
    <div className="max-w-[840px] mx-auto px-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px bg-stamp-border flex-1" />
        <span className="label">Surfaced from the record</span>
        <div className="h-px bg-stamp-border flex-1" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {cards.map((c, i) => (
          <div key={i} className="bg-[#1c1813] border border-rule rounded-sm p-4">
            <div className="label mb-2">{cardLabel(c)}</div>
            <div className="font-sans font-semibold text-[14.5px] leading-[1.3] text-ink mb-2 tracking-tight">{cardTitle(c)}</div>
            {c.type === "synthesis" ? (
              <p className="font-serif text-[12.5px] leading-[1.6] text-ink drop-cap">{c.body}</p>
            ) : (
              <p className="font-serif text-[12.5px] leading-[1.55] text-[#c8c2b0]">{c.body}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
