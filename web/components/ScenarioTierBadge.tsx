import type { Tier } from "@/lib/scenario-types";

const TIER_STYLES: Record<Tier, { border: string; text: string; bg: string }> = {
  T1: { border: "border-[#c4923a]", text: "text-[#c4923a]", bg: "bg-[#15110d]" },
  T2: { border: "border-[#ffffff55]", text: "text-[#e8e3d5]", bg: "bg-[#15110d]" },
  T3: { border: "border-[#ffffff55]", text: "text-[#e8e3d5]", bg: "bg-[#15110d]" },
  T4: { border: "border-[#8a8275]", text: "text-[#8a8275]", bg: "bg-[#1c1813]" },
};

const TIER_TITLES: Record<Tier, string> = {
  T1: "Primary government data",
  T2: "Independent analysis",
  T3: "Peer-reviewed academic",
  T4: "Mayoral Record extrapolation",
};

export function ScenarioTierBadge({ tier }: { tier: Tier }) {
  const styles = TIER_STYLES[tier];
  return (
    <span
      className={`inline-block font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-sm mr-1 align-baseline ${styles.border} ${styles.text} ${styles.bg}`}
      title={TIER_TITLES[tier]}
    >
      {tier}
    </span>
  );
}
