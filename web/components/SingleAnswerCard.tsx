import type { SingleAnswerCard as SingleAnswerCardType } from "@/lib/card-types";
import { StampPill } from "@/components/Stamp";
import { DropCap } from "@/components/DropCap";
import { FollowUpChips } from "@/components/FollowUpChips";

export function SingleAnswerCard({ card, onFollowUp }: { card: SingleAnswerCardType; onFollowUp: (q: string) => void }) {
  return (
    <div className="max-w-[780px] mx-auto bg-surface border border-rule rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.10)] p-7">
      <div className="label mb-3">Answer</div>
      <div className="font-sans font-semibold text-[22px] leading-[1.35] text-ink tracking-tight mb-5">{card.answer}</div>
      {card.evidence.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-5">
          {card.evidence.map((s, i) => <StampPill key={i} stamp={s} />)}
        </div>
      )}
      {card.context && (
        <div className="border-t border-rule pt-4">
          <div className="label mb-2.5">Context</div>
          <DropCap>{card.context.body}</DropCap>
        </div>
      )}
      <FollowUpChips chips={card.follow_ups} onPick={onFollowUp} />
    </div>
  );
}
