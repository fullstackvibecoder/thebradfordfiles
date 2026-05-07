import type { Metadata } from "next";
import { listScenarios } from "@/lib/scenario-loader";
import { ScenarioCardTile } from "@/components/ScenarioCardTile";

export const metadata: Metadata = {
  title: "Scenarios . The Mayoral Record",
  description: "Curated, evidence-backed analysis of contested policy positions in the Toronto 2026 mayoral race.",
  openGraph: {
    title: "Scenarios . The Mayoral Record",
    description: "Curated policy scenario analysis. Toronto 2026 mayoral race.",
    images: [{ url: "/api/og?type=scenarios-index", width: 1200, height: 630 }],
  },
};

export default function ScenariosIndexPage() {
  const cards = listScenarios();

  return (
    <main className="max-w-[920px] mx-auto px-4 py-10">
      <header className="mb-8 pb-6 border-b border-[#ffffff15]">
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight mb-3">Policy scenarios</h1>
        <p className="text-base leading-relaxed text-[#e8e3d5] max-w-[640px]">
          Curated analysis of contested positions in the Toronto 2026 race. Each card surfaces who each candidate&apos;s mechanism reaches, what Toronto already does, and what comparable cities have shown. Every claim cites its source.
        </p>
        <p className="font-mono text-xs uppercase tracking-wider text-[#8a8275] mt-4">
          <a href="/methodology" className="underline">Methodology and source-tier system</a>
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="text-sm text-[#8a8275] italic">No scenario cards published yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {cards.map((c) => (
            <ScenarioCardTile key={c.slug} card={c} />
          ))}
        </div>
      )}
    </main>
  );
}
