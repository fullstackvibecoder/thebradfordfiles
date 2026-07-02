"use client";
import type { SectionCount, CandidateSummary } from "@/lib/sections";

const DOT = ["bg-accent", "bg-success"];

export function SectionRail({
  sections,
  candidates,
  onSectionPick,
}: {
  sections: SectionCount[];
  candidates: CandidateSummary[];
  onSectionPick: (query: string) => void;
}) {
  if (sections.length === 0 && candidates.length === 0) return null;
  return (
    <aside className="lg:border-l lg:border-rule lg:pl-6">
      {sections.length > 0 && (
        <div className="mb-8">
          <div className="label mb-3">Sections</div>
          <div className="flex flex-col gap-1.5">
            {sections.map(s => (
              <button
                key={s.topic}
                type="button"
                onClick={() => onSectionPick(s.query)}
                className="flex items-center justify-between bg-surface border border-rule rounded-md px-3 py-2 text-[13px] text-ink hover:border-accent transition-colors"
              >
                <span>{s.label}</span>
                <span className="font-mono text-[11px] text-muted nums-tabular">{s.count} ›</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {candidates.length > 0 && (
        <div>
          <div className="label mb-3">Candidates</div>
          <div className="flex flex-col">
            {candidates.map((c, i) => (
              <a
                key={c.slug}
                href={`/candidates/${c.slug}`}
                className="flex items-center gap-2.5 py-2 border-b border-rule text-[13px] text-ink hover:text-accent transition-colors"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${DOT[i] ?? "bg-muted"}`} />
                <span>{c.display_name}</span>
                <span className="ml-auto font-mono text-[11px] text-muted nums-tabular">{c.record_count.toLocaleString()}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
