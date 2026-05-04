import { StaticPage } from "@/components/StaticPage";

export const metadata = { title: "Methodology . The Mayoral Record" };

export default function Methodology() {
  return (
    <StaticPage title="Methodology">
      <p>This page summarises the extraction methodology. Full version in <a href="https://github.com/fullstackvibecoder/thebradfordfiles/blob/main/METHODOLOGY.md">METHODOLOGY.md</a>.</p>

      <h2>Pipeline</h2>
      <ol className="pl-[22px] list-decimal space-y-1">
        <li><strong>Triage.</strong> Claude Haiku 4.5 reads each post's caption and assigns a bucket (substantive, contextual, or skip) with a stated reason.</li>
        <li><strong>Extraction.</strong> Claude Opus 4.7 reads substantive posts (with audio transcripts via Deepgram) and emits structured records (positions, pledges, actions, endorsements, appearances, quotes).</li>
        <li><strong>Verification.</strong> Action records are cross-referenced against the City of Toronto's public council voting record.</li>
        <li><strong>Synthesis.</strong> Claude Opus 4.7 produces a per-candidate per-topic synthesis paragraph from the extracted records, bound to a tool-use schema that requires every claim be cited.</li>
        <li><strong>Chat.</strong> Claude Sonnet 4.6 answers reader queries by calling read-only tools that return records, council votes, and synthesis cells. Every answer is stamped to its sources.</li>
      </ol>

      <h2>Equal-billing rules</h2>
      <ul>
        <li>Candidates listed alphabetically by surname.</li>
        <li>Identical fields shown for every candidate.</li>
        <li>No ranking, no editorial weighting.</li>
      </ul>

      <h2>Synthesis system prompt</h2>
      <p>The system prompt that generates synthesis paragraphs is reproduced in full so anyone can audit how syntheses are derived. See <a href="https://github.com/fullstackvibecoder/thebradfordfiles/blob/main/scripts/lib/synthesis.py">scripts/lib/synthesis.py</a> for the live prompt.</p>

      <h2>Chat agent system prompt</h2>
      <p>The chat agent's system prompt is reproduced in full at <a href="https://github.com/fullstackvibecoder/thebradfordfiles/blob/main/web/lib/agent/system-prompt.ts">web/lib/agent/system-prompt.ts</a>.</p>

      <h2>Corrections</h2>
      <p><a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">Open an issue on GitHub</a> if you spot an error.</p>
    </StaticPage>
  );
}
