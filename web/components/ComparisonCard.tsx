import type { ComparisonCard as ComparisonCardType } from "@/lib/card-types";
import { StampPill } from "@/components/Stamp";
import { FollowUpChips } from "@/components/FollowUpChips";

const DOT_COLORS: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-signal",
  red: "bg-accent",
  gray: "bg-muted",
};

export function ComparisonCard({ card, onFollowUp }: { card: ComparisonCardType; onFollowUp: (q: string) => void }) {
  const cols = card.candidates.length;
  const gridCols = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-flow-col auto-cols-[minmax(280px,1fr)] overflow-x-auto";

  return (
    <div className="max-w-[880px] mx-auto bg-surface border border-rule rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      <div className="px-5 py-4 border-b border-rule">
        <div className="label mb-2.5">Comparing</div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
            {card.candidates.map(c => (
              <span key={c.slug} className="stamp">{c.display_name}</span>
            ))}
          </div>
          <span className="shrink-0 font-sans text-[12.5px] text-muted">on <span className="font-semibold text-ink border-b border-dashed border-stamp-border">{card.topic}</span></span>
        </div>
      </div>

      <div className={`grid ${gridCols} border-b border-rule`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-rule" : ""}`}>
            <div className="font-sans font-semibold text-[16px] leading-[1.2] text-ink tracking-tight mb-1.5">{c.display_name}</div>
            <div className="flex items-center gap-2 font-sans text-[11.5px] text-muted">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[c.consistency_dot] ?? DOT_COLORS.gray}`} />
              <span className="min-w-0 flex-1 truncate">{c.consistency_label ?? "Records noted"}.</span>
              <span className="shrink-0 text-muted">{(c.record_count ?? 0).toLocaleString()} records.</span>
            </div>
          </div>
        ))}
      </div>

      {card.divergences.length > 0 && (
        <div className="px-5 py-4 border-b border-rule bg-surface">
          <div className="label mb-3">Where they diverge</div>
          <ol className="pl-[22px] list-decimal font-serif text-[13.5px] leading-[1.6] text-ink-2 space-y-2">
            {card.divergences.map((d, i) => (
              <li key={i}><strong>{d.headline}</strong> {d.body}</li>
            ))}
          </ol>
        </div>
      )}

      <div className={`grid ${gridCols} border-b border-rule`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-rule" : ""}`}>
            <div className="label mb-2.5">Summary</div>
            <p className="font-serif text-[13px] leading-[1.65] text-ink-2 drop-cap">{c.summary}</p>
          </div>
        ))}
      </div>

      <div className={`grid ${gridCols} border-b border-rule`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-rule" : ""}`}>
            <div className="label mb-2.5">Key positions</div>
            <ul className="pl-[18px] list-disc font-sans text-[12.5px] leading-[1.6] text-ink-2 space-y-1">
              {(c.key_positions ?? []).map((p, j) => (
                <li key={j}>{p.stance} {(p.citations?.length ?? 0) > 0 && <span className="font-mono text-accent text-[10.5px]">[{p.citations[0].slice(0, 6)}]</span>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={`grid ${gridCols} border-b border-rule`}>
        {card.candidates.map((c, i) => (
          <div key={c.slug} className={`px-5 py-4 ${i < cols - 1 ? "border-r border-rule" : ""}`}>
            <div className="label mb-2.5">Council votes</div>
            <div className="font-sans text-[12.5px] leading-[1.6] text-ink-2 space-y-1.5">
              {(c.council_votes ?? []).map((v, j) => (
                <div key={j}><strong>{v.vote}</strong> on {v.agenda_item} {v.title}</div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-b border-rule">
        <div className="label mb-2.5">Evidence</div>
        <div className="flex gap-1.5 flex-wrap">
          {card.candidates.flatMap(c => c.evidence ?? []).map((s, i) => <StampPill key={i} stamp={s} />)}
        </div>
      </div>

      <div className="px-5 py-3.5">
        <FollowUpChips chips={card.follow_ups} onPick={onFollowUp} />
      </div>
    </div>
  );
}
