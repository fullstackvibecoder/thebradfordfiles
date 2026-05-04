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

      <h2>Policy scenario cards</h2>
      <p>
        Some pages on this site analyse contested positions through a Policy Scenario card. Cards live at <a href="/scenarios">/scenarios</a>. Each one surfaces who each candidate&apos;s mechanism reaches, what Toronto already does, and what comparable cities have shown. Every claim cites its source.
      </p>
      <h2>Source-tier system</h2>
      <p>Every citation on a scenario card carries a tier badge. The four tiers track the actual evidentiary gradient:</p>
      <ul>
        <li><strong>T1. Primary government data.</strong> City of Toronto budget, Auditor General reports, Statistics Canada releases, CMHC, planning department published data, federal and provincial budget documents.</li>
        <li><strong>T2. Independent analysis.</strong> Wellesley Institute, IMFG, OECD, CHRA, Toronto Region Board of Trade, Conference Board, BIA-commissioned studies, investigative journalism with traceable primary sources.</li>
        <li><strong>T3. Peer-reviewed academic.</strong> DOI-bearing journal articles only.</li>
        <li><strong>T4. Mayoral Record extrapolation.</strong> In-house arithmetic or projection. Used rarely. When a card includes a T4 claim, the card carries a methodology paragraph describing assumptions, inputs, and limits.</li>
      </ul>
      <h2>Editorial discipline</h2>
      <p>
        The chat agent retrieves curated cards. It does not generate modeling content at query time. When a question does not match any curated card, the agent says so and the question logs to an editorial backlog. New cards are reviewed before publish, not auto-generated. When the underlying literature does not support a confident singular projection, the card says so explicitly rather than fabricating one.
      </p>
    </StaticPage>
  );
}
