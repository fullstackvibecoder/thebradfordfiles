"use client";
import { INTENT_CHIPS } from "@/lib/intent-chips";

export function Chips({ onPick }: { onPick: (query: string) => void }) {
  return (
    <div className="mx-auto max-w-[680px] px-8 mt-4 mb-10 flex flex-wrap gap-1.5 justify-center">
      {INTENT_CHIPS.map(c => (
        <button
          key={c.label}
          onClick={() => onPick(c.query)}
          className="chip"
          type="button"
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
