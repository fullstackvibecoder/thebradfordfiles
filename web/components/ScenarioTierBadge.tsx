import type { Tier } from "@/lib/scenario-types";

const TIER_STYLES: Record<Tier, { border: string; text: string; bg: string }> = {
  T1: { border: "border-accent", text: "text-accent", bg: "bg-bg" },
  T2: { border: "border-rule", text: "text-ink", bg: "bg-bg" },
  T3: { border: "border-rule", text: "text-ink", bg: "bg-bg" },
  T4: { border: "border-muted", text: "text-muted", bg: "bg-surface" },
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
      className={`inline-block font-mono text-[10px] px-1.5 py-0.5 border rounded-sm mr-1 align-baseline caps-small ${styles.border} ${styles.text} ${styles.bg}`}
      title={TIER_TITLES[tier]}
    >
      {tier}
    </span>
  );
}
