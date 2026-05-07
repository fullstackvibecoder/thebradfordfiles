import Link from "next/link";
import type { ScenarioCard } from "@/lib/scenario-types";

export function ScenarioCardTile({ card }: { card: ScenarioCard }) {
  return (
    <Link
      href={"/scenarios/" + card.slug}
      className="block bg-[#15110d] border border-[#ffffff2a] hover:border-[#c4923a] transition-colors p-5"
    >
      <h3 className="font-serif text-lg font-bold leading-snug mb-2">{card.topic_short}</h3>
      <p className="text-sm text-[#e8e3d5] mb-3 leading-relaxed">{card.pull_quote}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#8a8275]">
        Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>
    </Link>
  );
}
