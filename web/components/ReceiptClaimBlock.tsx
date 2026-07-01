import type { ClaimBlock } from "@/lib/receipt-types";

export function ReceiptClaimBlock({ claim }: { claim: ClaimBlock }) {
  return (
    <section className="bg-surface border-l-4 border-accent px-6 py-5 mb-6 relative">
      <span className="absolute top-3 right-4 font-mono text-[10px] text-accent border border-accent px-2 py-0.5 rounded-sm caps-small">
        AUDITED
      </span>
      <p className="font-mono text-base leading-relaxed text-ink mb-4 pr-24">
        &ldquo;{claim.headline}&rdquo;
      </p>
      <p className="font-mono text-xs text-muted caps-small">
        <span className="nums-tabular">{claim.attribution}</span>
        <span className="mx-2">.</span>
        <a href={claim.source.url} target="_blank" rel="noopener" className="underline">
          source
        </a>
        <span className="mx-2">.</span>
        retrieved {claim.source.retrieved}
      </p>
      {claim.response_from_source ? (
        <div className="mt-4 pt-3 border-t border-dotted border-rule">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted mb-1.5">Response from source</p>
          <p className="font-serif text-sm text-ink-2">{claim.response_from_source}</p>
        </div>
      ) : null}
    </section>
  );
}
