"use client";

export function FollowUpChips({ chips, onPick }: { chips: string[]; onPick: (query: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap pt-3.5 mt-4 border-t border-[#2a2520]">
      <span className="font-mono text-[11px] text-[#8a8275] tracking-[0.06em] uppercase mr-1.5">Follow up</span>
      {chips.map(c => (
        <button key={c} onClick={() => onPick(c)} type="button" className="bg-[#1c1813] border border-stamp-border px-2.5 py-1 rounded-full font-sans font-medium text-[11.5px] text-ink hover:border-accent transition-colors">
          {c}
        </button>
      ))}
    </div>
  );
}
