import { SurfacedCards } from "@/components/SurfacedCards";
import { LandingShell } from "@/components/LandingShell";

export default function Home() {
  return <LandingShell surfacedSlot={<SurfacedCards />} />;
}
