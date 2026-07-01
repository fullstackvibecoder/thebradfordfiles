import type { ReceiptCard as ReceiptCardData } from "@/lib/receipt-types";
import { ReceiptClaimBlock } from "./ReceiptClaimBlock";
import { ReceiptExhibit } from "./ReceiptExhibit";
import { ScenarioComparableTabs } from "./ScenarioComparableTabs";

export function ReceiptCard({ card }: { card: ReceiptCardData }) {
  return (
    <article className="max-w-[760px] mx-auto px-4 py-8 bg-bg text-ink">
      <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight mb-1">{card.topic}</h1>
      <p className="font-mono text-xs uppercase tracking-wider text-muted pb-4 mb-6 border-b border-rule">
        Receipt . Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>

      {card.claims.map((claim, i) => (
        <ReceiptClaimBlock key={i} claim={claim} />
      ))}

      <h2 className="font-mono text-xs uppercase tracking-wider text-muted mt-7 mb-2.5 font-semibold">
        The receipt
      </h2>
      <p className="font-serif text-base leading-relaxed text-ink-2 mb-6">{card.receipt.intro}</p>

      {card.receipt.anchors.map((a, i) => (
        <ReceiptExhibit key={a.sub_section_anchor} anchor={a} index={i} />
      ))}

      {card.what_data_cannot_settle ? (
        <div className="asterism">
          <section className="border-l-4 border-accent bg-surface px-6 py-4 mt-8 mb-6">
            <p className="font-mono text-xs uppercase tracking-wider text-accent mb-2">What the data cannot settle</p>
            <p className="font-serif text-sm italic text-ink-2 leading-relaxed">{card.what_data_cannot_settle}</p>
          </section>
        </div>
      ) : null}

      {card.comparables && card.comparables.length > 0 ? (
        <>
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted mt-7 mb-2.5 font-semibold">
            Comparable jurisdictions
          </h2>
          <ScenarioComparableTabs comparables={card.comparables} />
        </>
      ) : null}

      <footer className="mt-10 pt-4 border-t border-rule font-mono text-xs uppercase tracking-wider text-muted">
        <a href="/methodology" className="underline">Methodology</a>
        <span className="mx-2">.</span>
        Next review {card.meta.next_review}
      </footer>
    </article>
  );
}
