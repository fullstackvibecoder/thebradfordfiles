import { getSynthesis } from "@/lib/agent/data-loader";

const TOPIC_GROUPS = ["housing", "transit", "safety_crime", "taxes_fiscal", "social_services"] as const;
type TopicGroup = typeof TOPIC_GROUPS[number];

const LABEL_COLOR: Record<string, string> = {
  consistent: "bg-[#3a8a3a]",
  evolving: "bg-[#d4a548]",
  shifted: "bg-[#d44848]",
};

const PLACEHOLDER_COLOR = "bg-[#4a4234]";

const TOPIC_DISPLAY: Record<TopicGroup, string> = {
  housing: "Housing",
  transit: "Transit",
  safety_crime: "Safety",
  taxes_fiscal: "Tax",
  social_services: "Social services",
};

export function tickColor(label: string | undefined | null): string {
  if (!label) return PLACEHOLDER_COLOR;
  return LABEL_COLOR[label] ?? PLACEHOLDER_COLOR;
}

export function ConsistencyTimeline({ slug }: { slug: string }) {
  const ticks = TOPIC_GROUPS.map((topic) => {
    const cell = getSynthesis(slug, topic);
    const label = cell?.consistency?.label ?? null;
    return { topic, label, color: tickColor(label) };
  });

  return (
    <div
      className="inline-flex items-center gap-[2px] align-middle"
      role="img"
      aria-label="Consistency profile across major topics"
    >
      {ticks.map((t) => (
        <span
          key={t.topic}
          className={`inline-block w-2 h-2 rounded-[1px] ${t.color}`}
          title={`${TOPIC_DISPLAY[t.topic]}: ${t.label ?? "no data"}`}
        />
      ))}
    </div>
  );
}
