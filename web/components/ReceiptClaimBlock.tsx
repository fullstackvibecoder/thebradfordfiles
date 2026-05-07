import type { ClaimBlock } from "@/lib/receipt-types";

export function ReceiptClaimBlock({ claim }: { claim: ClaimBlock }) {
  return (
    <section className="bg-[#1a0d0d] border-l-4 border-[#c44848] px-6 py-5 mb-6 relative">
      <span className="absolute top-3 right-4 font-mono text-[10px] uppercase tracking-wider text-[#c44848] border border-[#c44848] px-2 py-0.5 rounded-sm">
        AUDITED
      </span>
      <p className="font-mono text-base leading-relaxed text-ink mb-4 pr-24">
        &ldquo;{claim.headline}&rdquo;
      </p>
      <p className="font-mono text-xs uppercase tracking-wider text-muted">
        {claim.attribution}
        <span className="mx-2">.</span>
        <a href={claim.source.url} target="_blank" rel="noopener" className="underline">
          source
        </a>
        <span className="mx-2">.</span>
        retrieved {claim.source.retrieved}
      </p>
      {claim.response_from_source ? (
        <div className="mt-4 pt-3 border-t border-dotted border-[#4a2828]">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted mb-1.5">Response from source</p>
          <p className="font-serif text-sm text-[#d4ccb8]">{claim.response_from_source}</p>
        </div>
      ) : null}
    </section>
  );
}
