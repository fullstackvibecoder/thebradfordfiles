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
      <div className="flex border-b border-[#ffffff2a] mb-4">
        {comparables.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setActive(i)}
            className={`font-mono text-xs px-3 py-1.5 border border-b-0 -mb-px ${
              i === active
                ? "bg-[#15110d] text-[#e8e3d5] border-[#c4923a] font-semibold"
                : "bg-[#1c1813] text-[#8a8275] border-[#ffffff2a]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div>
        <h5 className="font-serif text-base font-bold mb-1.5">
          {current.name}
          <span className="font-mono text-xs font-normal text-[#8a8275] ml-2">{current.period}</span>
        </h5>
        <p className="text-sm mb-2">{current.summary}</p>
        <p className="text-sm mb-2"><strong>Outcome.</strong> {current.outcome}</p>
        <p className="text-xs text-[#8a8275] italic mb-2">Caveats. {current.caveats}</p>
        <p className="text-xs text-[#8a8275]">
          {current.citations.map((c, i) => (
            <span key={i}><ScenarioTierBadge tier={c.tier} />{c.label}{c.url ? " (" + c.url + ")" : ""}{i < current.citations.length - 1 ? " . " : ""}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
