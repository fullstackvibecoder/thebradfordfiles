import Link from "next/link";
import type { ScenarioCard } from "@/lib/scenario-types";

export function ScenarioCardTile({ card }: { card: ScenarioCard }) {
  return (
    <Link
      href={"/scenarios/" + card.slug}
      className="block bg-[#fbfbf9] border border-[#1c1c1c33] hover:border-[#a07223] transition-colors p-5"
    >
      <h3 className="font-serif text-lg font-bold leading-snug mb-2">{card.topic_short}</h3>
      <p className="text-sm text-[#1c1c1c] mb-3 leading-relaxed">{card.pull_quote}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#5a5a55]">
        Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>
    </Link>
  );
}
