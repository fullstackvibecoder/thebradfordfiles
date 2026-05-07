import type { Metadata } from "next";
import { listReceipts } from "@/lib/receipt-loader";
import { ReceiptCardTile } from "@/components/ReceiptCardTile";

export const metadata: Metadata = {
  title: "Receipts . The Mayoral Record",
  description: "Toronto Open Data audits of common factual claims circulating in the 2026 mayoral race.",
  openGraph: {
    title: "Receipts . The Mayoral Record",
    description: "Toronto Open Data audits of common factual claims in the 2026 race.",
    images: [{ url: "/api/og?type=receipts-index", width: 1200, height: 630 }],
  },
};

export default function ReceiptsIndexPage() {
  const cards = listReceipts();

  return (
    <main className="max-w-[920px] mx-auto px-4 py-10">
      <header className="mb-8 pb-6 border-b border-[#ffffff15]">
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight mb-3 text-ink">Receipts</h1>
        <p className="text-base leading-relaxed text-[#d4ccb8] max-w-[640px]">
          Verbatim attributed claims from the 2026 race, audited against Toronto Open Data. Each receipt quotes the claim, links to the primary source, and lays out the data with caveats.
        </p>
        <p className="font-mono text-xs uppercase tracking-wider text-muted mt-4">
          <a href="/methodology" className="underline">Methodology and source-tier system</a>
        </p>
      </header>

      {cards.length === 0 ? (
        <p className="text-sm text-muted italic">No receipts published yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {cards.map((c) => (
            <ReceiptCardTile key={c.slug} card={c} />
          ))}
        </div>
      )}
    </main>
  );
}
