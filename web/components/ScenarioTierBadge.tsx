import type { Tier } from "@/lib/scenario-types";

const TIER_STYLES: Record<Tier, { border: string; text: string; bg: string }> = {
  T1: { border: "border-[#a07223]", text: "text-[#a07223]", bg: "bg-[#fbfbf9]" },
  T2: { border: "border-[#1c1c1c66]", text: "text-[#1c1c1c]", bg: "bg-[#fbfbf9]" },
  T3: { border: "border-[#1c1c1c66]", text: "text-[#1c1c1c]", bg: "bg-[#fbfbf9]" },
  T4: { border: "border-[#5a5a55]", text: "text-[#5a5a55]", bg: "bg-[#f0eee8]" },
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
