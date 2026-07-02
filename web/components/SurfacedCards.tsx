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

// Literal class strings so Tailwind's JIT scanner picks them up.
const GRID_COLS: Record<number, string> = {
  0: "grid-cols-1",
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
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
  const cols = GRID_COLS[Math.min(cards.length, 3)] ?? GRID_COLS[3];
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px bg-rule flex-1" />
        <span className="label">Surfaced from the record</span>
        <div className="h-px bg-rule flex-1" />
      </div>
      <div className={`grid ${cols} gap-3.5`}>
        {cards.map((c, i) => (
          <a
            key={i}
            href={`/candidates/${c.candidate_slug}`}
            className="flex flex-col h-[220px] bg-surface border border-rule rounded-lg p-4 hover:border-accent transition-colors"
          >
            <div className="label mb-2">{cardLabel(c)}</div>
            <div className="font-sans font-semibold text-[15px] leading-snug text-ink mb-2 tracking-tight">{cardTitle(c)}</div>
            <p className="font-serif text-[12.5px] leading-relaxed text-ink-2 flex-1 overflow-hidden line-clamp-4">{c.body}</p>
            <span className="font-mono text-[10px] font-bold text-accent mt-3">Read the record ›</span>
          </a>
        ))}
      </div>
    </div>
  );
}
