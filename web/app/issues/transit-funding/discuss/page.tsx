"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function TransitFundingDeliberation() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://pol.is/embed.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  return (
    <main className="max-w-[980px] mx-auto px-6 py-6">
      <Link href="/" className="text-accent text-[13px]">{"←"} Back</Link>
      <h1 className="font-serif font-bold text-[24px] leading-[1.2] text-ink mt-4 mb-2">Should Toronto raise property tax to fund TTC expansion?</h1>
      <p className="font-sans text-[14px] leading-[1.55] text-muted mb-4">A deliberative conversation on transit funding. Vote agree or disagree on community-submitted statements; the algorithm clusters opinion groups and surfaces statements that bridge across groups. Powered by <a className="text-accent" href="https://pol.is" target="_blank" rel="noopener noreferrer">Pol.is</a>.</p>
      <div className="bg-white border border-rule min-h-[600px]">
        <div
          className="polis"
          data-page_id="tomf-transit-funding-2026"
          data-site_id="polis_site_id_x051uejVaaUdyHJVvA"
        />
      </div>
      <p className="font-sans italic text-[11.5px] text-muted mt-4">Statements are submitted and voted on by Pol.is users. The Mayoral Record seeds initial statements but does not moderate. Conversation results are not a representative poll.</p>
    </main>
  );
}
