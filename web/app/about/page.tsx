import { StaticPage } from "@/components/StaticPage";

export const metadata = { title: "About . The Mayoral Record" };

export default function About() {
  return (
    <StaticPage title="About">
      <p>The Mayoral Record is an independent civic-transparency project documenting Toronto's 2026 mayoral race. Not affiliated with any candidate, campaign, or political party. No financial relationship with any candidate.</p>
      <p>Every record on this site is sourced to a specific public Instagram post or council vote. Click any source link to verify against the original.</p>
      <p>Built by <a href="https://bottlenecklabs.ai">BottleneckLabs</a>. Open source at <a href="https://github.com/fullstackvibecoder/thebradfordfiles">GitHub</a> under the MIT license.</p>
    </StaticPage>
  );
}
