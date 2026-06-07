import type { SaidVsDoneTopic } from "@/lib/said-vs-done";
import { SaidVsDoneItemCard } from "@/components/SaidVsDoneItemCard";
import { MorePositions } from "@/components/MorePositions";

const MAX_POSITIONS = 3;

export function SaidVsDone({ topic }: { topic: SaidVsDoneTopic }) {
  if (topic.items.length === 0) return null;
  const shown = topic.items.slice(0, MAX_POSITIONS);
  const remaining = topic.items.slice(MAX_POSITIONS);
  return (
    <div className="mt-4">
      <div className="label mb-2">Said vs. Done</div>
      <div className="space-y-4">
        {shown.map((it, i) => <SaidVsDoneItemCard key={`${it.shortcode}-${i}`} item={it} />)}
      </div>
      {remaining.length > 0 && <MorePositions items={remaining} />}
    </div>
  );
}
