"use client";
import { useEffect, useRef, useState } from "react";
import type { FeaturedEntry, ContradictionEntry, DivergenceEntry } from "@/lib/featured-types";

function Half({ name, quote, source, meta, accent }: { name: string; quote: string; source: string; meta?: string; accent: "a" | "b" }) {
  return (
    <div className={`flex-1 min-w-0 p-5 bg-surface-2 border-t-4 ${accent === "a" ? "border-accent" : "border-success"}`}>
      <div className="font-sans font-extrabold text-[16px] text-ink flex items-center gap-2">
        {name}{meta && <span className="font-mono text-[9px] text-muted">{meta}</span>}
      </div>
      <div className="font-mono text-[9px] text-muted mt-0.5">{source}</div>
      <p className="font-serif italic text-[15px] leading-relaxed text-ink-2 mt-3">“{quote}”</p>
    </div>
  );
}

function VsMedallion() {
  return (
    <div className="relative flex items-center justify-center px-1 self-stretch">
      <div className="absolute inset-y-0 w-px bg-rule" />
      <span className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-rule font-mono text-[11px] font-bold text-accent">VS</span>
    </div>
  );
}

function Slide({ entry }: { entry: FeaturedEntry }) {
  if (entry.kind === "contradiction") {
    const e = entry as ContradictionEntry;
    return (
      <div className="p-5">
        <span className="font-mono text-[9px] font-bold tracking-label uppercase text-accent">Lead · Contradiction</span>
        <h3 className="font-sans font-extrabold text-[24px] tracking-tight text-ink mt-1 mb-4">{e.display_name} on {e.topic_label}</h3>
        <div className="flex items-stretch">
          <Half name={e.earlier.date?.slice(0, 4) || "Earlier"} quote={e.earlier.quote} source={e.earlier.source} accent="a" />
          <VsMedallion />
          <Half name={e.later.date?.slice(0, 4) || "Later"} quote={e.later.quote} source={e.later.source} accent="b" />
        </div>
        <div className="font-mono text-[10px] font-bold text-accent mt-3">▸ position {e.consistency}</div>
      </div>
    );
  }
  const e = entry as DivergenceEntry;
  return (
    <div className="p-5">
      <span className="font-mono text-[9px] font-bold tracking-label uppercase text-accent">Lead · Where they split</span>
      <h3 className="font-sans font-extrabold text-[24px] tracking-tight text-ink mt-1 mb-4">Split on {e.topic_label}</h3>
      <div className="flex items-stretch">
        <Half name={e.a.display_name} quote={e.a.quote} source={e.a.source} meta={e.a.vote} accent="a" />
        <VsMedallion />
        <Half name={e.b.display_name} quote={e.b.quote} source={e.b.source} meta={e.b.vote} accent="b" />
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
    <section
      className="w-full"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onFocusCapture={() => { paused.current = true; }}
      onBlurCapture={() => { paused.current = false; }}
    >
      <div className="bg-surface border border-rule rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
        <Slide entry={entry} />
        {entries.length > 1 && (
          <div className="flex gap-1.5 justify-center pb-4">
            {entries.map((_, n) => (
              <button
                key={n}
                onClick={() => setI(n)}
                aria-label={`Show featured item ${n + 1}`}
                aria-current={n === i ? "true" : undefined}
                className={`h-[7px] rounded-full transition-all ${n === i ? "w-5 bg-accent" : "w-[7px] bg-rule"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
