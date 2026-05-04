"use client";
import { CommandBar } from "@/components/CommandBar";
import { Chips } from "@/components/Chips";
import { ReceiptStream, useReceiptStream } from "@/components/ReceiptStream";
import { getTurnstileToken } from "@/lib/turnstile-client";

export function LandingShell({ surfacedSlot }: { surfacedSlot: React.ReactNode }) {
  const { state, submit, reset } = useReceiptStream();
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || undefined;

  async function onChipPick(query: string) {
    const token = await getTurnstileToken(siteKey);
    submit(query, token);
  }

  async function onFollowUp(query: string) {
    if (!query) { reset(); return; }
    const token = await getTurnstileToken(siteKey);
    submit(query, token);
  }

  function onCommandSubmit(query: string, token: string) {
    submit(query, token);
  }

  return (
    <div className="min-h-screen">
      <div className="text-center pt-10 px-8">
        <div className="font-sans font-semibold text-[30px] leading-[1.1] tracking-tight text-ink mb-2.5">The Mayoral Record</div>
        <p className="font-serif italic text-[14px] leading-[1.5] text-[#5a5a55] max-w-[560px] mx-auto">Toronto's 2026 mayoral race, sourced and queryable.</p>
      </div>
      <div className="mt-9">
        <CommandBar onSubmit={onCommandSubmit} />
      </div>
      {!state.query && <Chips onPick={onChipPick} />}
      {!state.query && surfacedSlot}
      {state.query && <ReceiptStream state={state} onFollowUp={onFollowUp} />}
    </div>
  );
}
