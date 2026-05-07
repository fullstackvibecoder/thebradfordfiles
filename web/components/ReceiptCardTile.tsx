import Link from "next/link";
import type { ReceiptCard } from "@/lib/receipt-types";

export function ReceiptCardTile({ card }: { card: ReceiptCard }) {
  return (
    <Link
      href={"/receipts/" + card.slug}
      className="block bg-[#1c1813] border border-[#2a2520] hover:border-[#c44848] transition-colors p-5"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#c44848] border border-[#c44848] px-1.5 py-0.5 rounded-sm">
          AUDITED
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {card.claims.length} claim{card.claims.length === 1 ? "" : "s"}
        </span>
      </div>
      <h3 className="font-serif text-lg font-bold leading-snug mb-2 text-ink">{card.topic_short}</h3>
      <p className="text-sm text-[#d4ccb8] mb-3 leading-relaxed">{card.pull_quote}</p>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
        Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>
    </Link>
  );
}
