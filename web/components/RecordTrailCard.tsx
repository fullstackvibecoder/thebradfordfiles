import type { RecordTrailCard as RecordTrailCardType } from "@/lib/card-types";
import { StampPill } from "@/components/Stamp";
import { FollowUpChips } from "@/components/FollowUpChips";

export function RecordTrailCard({ card, onFollowUp }: { card: RecordTrailCardType; onFollowUp: (q: string) => void }) {
  return (
    <div className="max-w-[780px] mx-auto bg-white border border-rule rounded-sm p-7">
      <div className="label mb-3">Record trail</div>
      <div className="font-sans font-semibold text-[18px] leading-[1.3] text-ink tracking-tight mb-5">{card.theme}</div>
      <div className="relative pl-6 space-y-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-stamp-border">
        {card.entries.map((e, i) => (
          <div key={i} className="relative">
            <div className="absolute -left-[18px] top-1 w-2 h-2 rounded-full bg-accent" />
            <div className="font-mono text-[10.5px] uppercase tracking-label text-muted mb-1">{e.date.slice(0, 10)} . {e.label}</div>
            <p className="font-serif text-[13px] leading-[1.65] text-[#2a2a28]">{e.body}</p>
            {e.evidence.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {e.evidence.map((s, j) => <StampPill key={j} stamp={s} />)}
              </div>
            )}
          </div>
        ))}
      </div>
      <FollowUpChips chips={card.follow_ups} onPick={onFollowUp} />
    </div>
  );
}
