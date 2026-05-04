import { StaticPage } from "@/components/StaticPage";

export const metadata = { title: "Privacy . The Mayoral Record" };

export default function Privacy() {
  return (
    <StaticPage title="Privacy">
      <p>The Mayoral Record is an independent civic-transparency project. We collect as little data as possible.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Anonymous browser fingerprint hash.</strong> When you submit a reader vote, the site generates a random 32-character identifier in your browser's local storage, hashes it with SHA-256, and uses the hash to prevent the same browser from voting twice on the same record. The original fingerprint never leaves your device. The hash is one-way and is not linked to any other data about you.</li>
        <li><strong>Aggregate page-view counts</strong> via Cloudflare Web Analytics. This is cookieless and does not track you across sites.</li>
        <li><strong>Cloudflare Turnstile challenge tokens</strong> when you submit a vote or a chat query. Turnstile is a no-CAPTCHA bot-detection challenge.</li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li>No accounts. You do not sign up.</li>
        <li>No email address. No phone. No name.</li>
        <li>No IP-address logging beyond what Cloudflare and Vercel keep for security and abuse prevention.</li>
        <li>No third-party advertising trackers. No retargeting. No cross-site tracking.</li>
      </ul>

      <h2>Third parties</h2>
      <ul>
        <li><strong>Cloudflare</strong> (analytics, Turnstile bot detection): subject to <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare's privacy policy</a>.</li>
        <li><strong>Upstash</strong> (Redis storage): subject to <a href="https://upstash.com/trust/privacy" target="_blank" rel="noopener noreferrer">Upstash's privacy policy</a>.</li>
        <li><strong>Vercel</strong> (hosting): subject to <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel's privacy policy</a>.</li>
        <li><strong>Pol.is</strong> (deliberation embed): subject to <a href="https://pol.is/privacy" target="_blank" rel="noopener noreferrer">Pol.is's privacy policy</a>. We do not control Pol.is's data practices.</li>
        <li><strong>Anthropic</strong> (Claude API for content extraction, synthesis, and chat answers): we send public Instagram content and reader queries to Anthropic for processing. No reader-identifying data is included.</li>
      </ul>

      <h2>Data retention</h2>
      <ul>
        <li>Aggregate vote counters in Redis are retained indefinitely.</li>
        <li>Per-fingerprint dedup keys auto-expire after 365 days.</li>
        <li>Reader query logs (used to surface anonymized recent-questions) are retained for 30 days. Queries are not linked to fingerprint hashes or IP addresses.</li>
        <li>Server logs (Vercel, Cloudflare) retain per their providers' policies; we do not retain copies.</li>
      </ul>

      <h2>Contact</h2>
      <p>Questions about privacy? <a href="https://github.com/fullstackvibecoder/thebradfordfiles/issues">Open a GitHub issue</a> or email <a href="mailto:hello@bottlenecklabs.ai">hello@bottlenecklabs.ai</a>.</p>

      <p className="mt-6 bg-stamp-bg border-l-[3px] border-stamp-border p-3 text-[13px]">This is a plain-English disclosure. It is not legal advice. If you have a specific privacy concern, please contact us. Last updated: 2026-05-04.</p>
    </StaticPage>
  );
}
