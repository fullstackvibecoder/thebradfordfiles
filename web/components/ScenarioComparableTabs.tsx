"use client";

import { useState } from "react";
import type { Comparable } from "@/lib/scenario-types";
import { ScenarioTierBadge } from "./ScenarioTierBadge";

export function ScenarioComparableTabs({ comparables }: { comparables: Comparable[] }) {
  const [active, setActive] = useState(0);
  if (comparables.length === 0) return null;
  const current = comparables[active];

  return (
    <div>
      <div className="flex border-b border-[#1c1c1c33] mb-4">
        {comparables.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setActive(i)}
            className={`font-mono text-xs px-3 py-1.5 border border-b-0 -mb-px ${
              i === active
                ? "bg-[#fbfbf9] text-[#1c1c1c] border-[#a07223] font-semibold"
                : "bg-[#f0eee8] text-[#5a5a55] border-[#1c1c1c33]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div>
        <h5 className="font-serif text-base font-bold mb-1.5">
          {current.name}
          <span className="font-mono text-xs font-normal text-[#5a5a55] ml-2">{current.period}</span>
        </h5>
        <p className="text-sm mb-2">{current.summary}</p>
        <p className="text-sm mb-2"><strong>Outcome.</strong> {current.outcome}</p>
        <p className="text-xs text-[#5a5a55] italic mb-2">Caveats. {current.caveats}</p>
        <p className="text-xs text-[#5a5a55]">
          {current.citations.map((c, i) => (
            <span key={i}><ScenarioTierBadge tier={c.tier} />{c.label}{c.url ? " (" + c.url + ")" : ""}{i < current.citations.length - 1 ? " . " : ""}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
