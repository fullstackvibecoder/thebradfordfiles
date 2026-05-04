import type { ScenarioCard as ScenarioCardData, Citation } from "@/lib/scenario-types";
import { ScenarioTierBadge } from "./ScenarioTierBadge";
import { ScenarioComparableTabs } from "./ScenarioComparableTabs";

function CitationRow({ citations }: { citations: Citation[] }) {
  return (
    <p className="text-xs text-[#5a5a55] mt-2">
      {citations.map((c, i) => (
        <span key={i}>
          <ScenarioTierBadge tier={c.tier} />
          {c.label}
          {c.url ? <> (<a href={c.url} className="underline" target="_blank" rel="noopener">link</a>)</> : null}
          {i < citations.length - 1 ? " . " : ""}
        </span>
      ))}
    </p>
  );
}

export function ScenarioCard({ card }: { card: ScenarioCardData }) {
  return (
    <article className="max-w-[760px] mx-auto px-4 py-8 bg-[#fbfbf9] text-[#1c1c1c]">
      <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight mb-1">{card.topic}</h1>
      <p className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] pb-4 mb-6 border-b border-[#1c1c1c1a]">
        Scenario . Last reviewed {card.meta.last_reviewed} . Next review {card.meta.next_review}
      </p>

      <section className="bg-[#f5f2ea] border-l-4 border-[#a07223] px-6 py-5 mb-7">
        <h2 className="font-serif text-xl font-bold mb-3">Who would each mechanism reach?</h2>
        <p className="mb-4 text-sm">{card.who_benefits.intro}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {card.who_benefits.mechanisms.map((m) => {
            const pos = card.positions.find((p) => p.candidate_handle === m.candidate_handle);
            return (
              <div key={m.candidate_handle}>
                <h3 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mb-1.5">
                  {pos?.candidate_name ?? m.candidate_handle}
                </h3>
                <p className="text-sm">{m.summary}</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-[#5a5a55] mt-4 pt-3 border-t border-dotted border-[#5a5a55]">
          <strong className="text-[#1c1c1c]">Literature.</strong>{" "}
          {card.who_benefits.literature_row.map((c, i) => (
            <span key={i}><ScenarioTierBadge tier={c.tier} />{c.label}{i < card.who_benefits.literature_row.length - 1 ? " . " : ""}</span>
          ))}
        </p>
      </section>

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Candidate positions</h2>
      <div className={`grid gap-6 mb-6 ${card.positions.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
        {card.positions.map((p) => (
          <div key={p.candidate_handle}>
            <h3 className="font-serif text-base font-bold mb-1.5">{p.candidate_name}</h3>
            <p className="text-sm mb-2">{p.summary}</p>
            <CitationRow citations={p.citations} />
          </div>
        ))}
      </div>

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">
        Status quo. What Toronto already does.
      </h2>
      <p className="text-sm mb-2">{card.status_quo.summary}</p>
      <ul className="list-disc pl-5 text-sm mb-2 space-y-1">
        {card.status_quo.existing_policy_stack.map((e, i) => (
          <li key={i}>
            {e.label}
            <span className="text-xs text-[#5a5a55] ml-2">
              {e.citations.map((c, j) => (
                <span key={j}><ScenarioTierBadge tier={c.tier} />{c.label}{j < e.citations.length - 1 ? " . " : ""}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <CitationRow citations={card.status_quo.citations} />

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Comparable jurisdictions</h2>
      <ScenarioComparableTabs comparables={card.comparables} />

      <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Projections</h2>
      {card.projections.kind === "plural" ? (
        <>
          <p className="text-sm mb-2">{card.projections.intro}</p>
          <ul className="list-none pl-0 text-sm mb-2 space-y-2">
            {card.projections.items.map((p, i) => (
              <li key={i} className="border-l-2 border-[#1c1c1c33] pl-3">
                <strong>{p.scenario_label}.</strong> {p.range_or_value}
                {p.notes ? <> ({p.notes})</> : null}
                <span className="block text-xs text-[#5a5a55] mt-1">
                  <ScenarioTierBadge tier={p.citation.tier} />{p.citation.label}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm italic text-[#5a5a55]">{card.projections.rationale}</p>
      )}

      {card.time_horizon ? (
        <>
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Time horizon</h2>
          <p className="text-sm">{card.time_horizon}</p>
        </>
      ) : null}

      {card.meta.methodology_notes ? (
        <>
          <h2 className="font-mono text-xs uppercase tracking-wider text-[#5a5a55] mt-7 mb-2.5 font-semibold">Methodology</h2>
          <p className="text-sm text-[#5a5a55]">{card.meta.methodology_notes}</p>
        </>
      ) : null}

      <footer className="mt-10 pt-4 border-t border-[#1c1c1c1a] font-mono text-xs uppercase tracking-wider text-[#5a5a55]">
        <a href="/methodology" className="underline">Methodology</a>
        <span className="mx-2">.</span>
        Next review {card.meta.next_review}
      </footer>
    </article>
  );
}
