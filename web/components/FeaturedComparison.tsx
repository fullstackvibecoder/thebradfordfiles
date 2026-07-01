"use client";
import { useEffect, useRef, useState } from "react";
import type { FeaturedEntry, ContradictionEntry, DivergenceEntry } from "@/lib/featured-types";

function Side({ name, quote, source, meta, accent }: { name: string; quote: string; source: string; meta?: string; accent: "a" | "b" }) {
  return (
    <div className={`flex-1 rounded-xl p-4 bg-surface-2 border-l-4 ${accent === "a" ? "border-accent" : "border-success"}`}>
      <div className="font-sans font-bold text-[13px] text-ink flex items-center gap-2">{name}{meta && <span className="font-mono text-[9px] text-muted">{meta}</span>}</div>
      <p className="font-serif italic text-[13px] leading-snug text-ink-2 mt-2">“{quote}”</p>
      <div className="font-mono text-[9px] text-muted mt-2">{source}</div>
    </div>
  );
}

function Slide({ entry }: { entry: FeaturedEntry }) {
  if (entry.kind === "contradiction") {
    const e = entry as ContradictionEntry;
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[9px] font-bold tracking-label uppercase text-signal">Contradiction</span>
        </div>
        <h3 className="font-sans font-extrabold text-[20px] tracking-tight text-ink mb-3">{e.display_name} on {e.topic_label}</h3>
        <div className="flex gap-3 items-stretch">
          <Side name={e.earlier.date?.slice(0, 4) || "Earlier"} quote={e.earlier.quote} source={e.earlier.source} accent="a" />
          <div className="flex items-center font-mono text-[11px] font-bold text-muted">vs</div>
          <Side name={e.later.date?.slice(0, 4) || "Later"} quote={e.later.quote} source={e.later.source} accent="b" />
        </div>
        <div className="text-center font-mono text-[10px] font-bold text-accent mt-3">▸ position {e.consistency}</div>
      </div>
    );
  }
  const e = entry as DivergenceEntry;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[9px] font-bold tracking-label uppercase text-signal">Where they split</span>
      </div>
      <h3 className="font-sans font-extrabold text-[20px] tracking-tight text-ink mb-3">Split on {e.topic_label}</h3>
      <div className="flex gap-3 items-stretch">
        <Side name={e.a.display_name} quote={e.a.quote} source={e.a.source} meta={e.a.vote} accent="a" />
        <div className="flex items-center font-mono text-[11px] font-bold text-muted">vs</div>
        <Side name={e.b.display_name} quote={e.b.quote} source={e.b.source} meta={e.b.vote} accent="b" />
      </div>
    </div>
  );
}

export function FeaturedComparison({ entries }: { entries: FeaturedEntry[] }) {
  const [i, setI] = useState(0);
  const paused = useRef(false);
  useEffect(() => {
    if (entries.length < 2) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => { if (!paused.current) setI(p => (p + 1) % entries.length); }, 7000);
    return () => clearInterval(id);
  }, [entries.length]);
  if (entries.length === 0) return null;
  const entry = entries[Math.min(i, entries.length - 1)];
  return (
    <section className="max-w-[780px] mx-auto my-8" onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}>
      <div className="bg-surface border border-rule rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <div className="bg-masthead text-masthead-ink px-4 py-2.5 font-mono text-[9px] font-bold tracking-label uppercase">Featured · On the record</div>
        <div className="p-4">
          <Slide entry={entry} />
        </div>
        {entries.length > 1 && (
          <div className="flex gap-1.5 justify-center pb-4">
            {entries.map((_, n) => (
              <button key={n} onClick={() => setI(n)} aria-label={`Show featured item ${n + 1}`}
                className={`h-[7px] rounded-full transition-all ${n === i ? "w-5 bg-accent" : "w-[7px] bg-rule"}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
