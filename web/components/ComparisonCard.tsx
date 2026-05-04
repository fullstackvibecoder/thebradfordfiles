import type { ComparisonCard as ComparisonCardType } from "@/lib/card-types";
import { StampPill } from "@/components/Stamp";
import { FollowUpChips } from "@/components/FollowUpChips";

const DOT_COLORS: Record<string, string> = {
  green: "bg-[#1a5b1a]",
  yellow: "bg-[#b58a32]",
  red: "bg-[#b50909]",
  gray: "bg-[#999]",
};

export function ComparisonCard({ card, onFollowUp }: { card: ComparisonCardType; onFollowUp: (q: string) => void }) {
  const cols = card.candidates.length;
  const gridCols = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-flow-col auto-cols-[minmax(280px,1fr)] overflow-x-auto";

  return (
    <div className="max-w-[880px] mx-auto bg-white border border-rule rounded-sm">
      <div className="px-5 py-4 border-b border-[#f3f1ed]">
        <div className="label mb-2.5">Comparing</div>
        <div className="flex items-center gap-2 flex-wrap">
          {card.candidates.map(c => (
            <span key={c.slug} className="stamp">{c.display_name}</span>
          ))}
          <span className="ml-auto font-sans text-[12.5px] text-muted">on <span className="font-semibold text-ink border-b border-dashed border-stamp-border">{card.topic}</span></span>
        </div>
      </div>

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="font-sans font-semibold text-[16px] leading-[1.2] text-ink tracking-tight mb-1.5">{c.display_name}</div>
            <div className="flex items-center gap-2 font-sans text-[11.5px] text-muted">
              <span className={`inline-block w-2 h-2 rounded-full ${DOT_COLORS[c.consistency_dot] ?? DOT_COLORS.gray}`} />
              <span>{c.consistency_label}.</span>
              <span className="text-[#999]">{c.record_count.toLocaleString()} records.</span>
            </div>
          </div>
        ))}
      </div>

      {card.divergences.length > 0 && (
        <div className="px-5 py-4 border-b border-[#f3f1ed] bg-[#fcfaf4]">
          <div className="label mb-3">Where they diverge</div>
          <ol className="pl-[22px] list-decimal font-serif text-[13.5px] leading-[1.6] text-[#2a2a28] space-y-2">
            {card.divergences.map((d, i) => (
              <li key={i}><strong>{d.headline}</strong> {d.body}</li>
            ))}
          </ol>
        </div>
      )}

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="label mb-2.5">Summary</div>
            <p className="font-serif text-[13px] leading-[1.65] text-[#2a2a28] drop-cap">{c.summary}</p>
          </div>
        ))}
      </div>

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="label mb-2.5">Key positions</div>
            <ul className="pl-[18px] list-disc font-sans text-[12.5px] leading-[1.6] text-[#3a3a35] space-y-1">
              {c.key_positions.map((p, j) => (
                <li key={j}>{p.stance} {p.citations.length > 0 && <span className="font-mono text-accent text-[10.5px]">[{p.citations[0].slice(0, 6)}]</span>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={`grid ${gridCols} border-b border-[#f3f1ed]`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-[#f3f1ed]" : ""}`}>
            <div className="label mb-2.5">Council votes</div>
            <div className="font-sans text-[12.5px] leading-[1.6] text-[#3a3a35] space-y-1.5">
              {c.council_votes.map((v, j) => (
                <div key={j}><strong>{v.vote}</strong> on {v.agenda_item} {v.title}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-b border-[#f3f1ed]">
        <div className="label mb-2.5">Evidence</div>
        <div className="flex gap-1.5 flex-wrap">
          {card.candidates.flatMap(c => c.evidence).map((s, i) => <StampPill key={i} stamp={s} />)}
        </div>
      </div>

      <div className="px-5 py-3.5">
        <FollowUpChips chips={card.follow_ups} onPick={onFollowUp} />
      </div>
    </div>
  );
}
