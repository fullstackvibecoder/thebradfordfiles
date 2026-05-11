import type { DataAnchor } from "@/lib/receipt-types";
import { ScenarioTierBadge } from "./ScenarioTierBadge";

export function ReceiptExhibit({ anchor, index }: { anchor: DataAnchor; index: number }) {
  return (
    <section id={anchor.sub_section_anchor} className="mb-8 scroll-mt-20">
      <h3 className="mb-2">
        <span className="font-mono text-xs text-accent mr-2 caps-small">
          Exhibit {index + 1}.
        </span>
        <span className="font-serif text-lg font-bold text-ink">{anchor.sub_claim}</span>
      </h3>
      <p className="font-serif text-base leading-relaxed text-[#d4ccb8] mb-3">{anchor.finding}</p>
      <div className="bg-[#1c1813] border border-[#2a2520] px-5 py-4 mb-3">
        <p className="font-serif text-xl font-bold text-ink leading-snug nums-tabular">
          {anchor.metric}
        </p>
        <p className="text-xs text-muted mt-2">
          <ScenarioTierBadge tier={anchor.source.tier} />
          {anchor.source.label}
          {anchor.source.url ? (
            <> (<a href={anchor.source.url} target="_blank" rel="noopener" className="underline">link</a>)</>
          ) : null}
        </p>
      </div>
      {anchor.caveats ? (
        <p className="text-sm italic text-muted mb-2">
          <strong className="font-mono not-italic text-[11px] mr-1 caps-small">Caveat.</strong>
          {anchor.caveats}
        </p>
      ) : null}
      <p className="font-mono text-[10px] text-muted caps-small">
        As of <span className="nums-tabular">{anchor.as_of}</span>
      </p>
    </section>
  );
}
