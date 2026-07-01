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
      <div className="flex border-b border-rule mb-4">
        {comparables.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setActive(i)}
            className={`font-mono text-xs px-3 py-1.5 border border-b-0 -mb-px ${
              i === active
                ? "bg-bg text-ink border-accent font-semibold"
                : "bg-surface text-muted border-rule"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div>
        <h5 className="font-serif text-base font-bold mb-1.5">
          {current.name}
          <span className="font-mono text-xs font-normal text-muted ml-2">{current.period}</span>
        </h5>
        <p className="text-sm mb-2">{current.summary}</p>
        <p className="text-sm mb-2"><strong>Outcome.</strong> {current.outcome}</p>
        <p className="text-xs text-muted italic mb-2">Caveats. {current.caveats}</p>
        <p className="text-xs text-muted">
          {current.citations.map((c, i) => (
            <span key={i}><ScenarioTierBadge tier={c.tier} />{c.label}{c.url ? " (" + c.url + ")" : ""}{i < current.citations.length - 1 ? " . " : ""}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
