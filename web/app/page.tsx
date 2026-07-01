import { SurfacedCards } from "@/components/SurfacedCards";
import { LandingShell } from "@/components/LandingShell";
import { FeaturedComparison } from "@/components/FeaturedComparison";
import { getFeaturedComparisons } from "@/lib/featured";

export default function Home() {
  const featured = getFeaturedComparisons();
  return (
    <LandingShell
      featuredSlot={<FeaturedComparison entries={featured} />}
      surfacedSlot={<SurfacedCards />}
    />
  );
}
