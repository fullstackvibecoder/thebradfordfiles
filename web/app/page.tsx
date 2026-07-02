import { SurfacedCards } from "@/components/SurfacedCards";
import { LandingShell } from "@/components/LandingShell";
import { FeaturedComparison } from "@/components/FeaturedComparison";
import { getFeaturedComparisons } from "@/lib/featured";
import { getSectionCounts, getCandidateSummaries } from "@/lib/sections";

export default function Home() {
  const featured = getFeaturedComparisons();
  const sections = getSectionCounts();
  const candidates = getCandidateSummaries();
  return (
    <LandingShell
      featuredSlot={<FeaturedComparison entries={featured} />}
      surfacedSlot={<SurfacedCards />}
      sections={sections}
      candidates={candidates}
    />
  );
}
