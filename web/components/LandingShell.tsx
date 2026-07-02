"use client";
import { CommandBar } from "@/components/CommandBar";
import { SectionRail } from "@/components/SectionRail";
import { ReceiptStream, useReceiptStream } from "@/components/ReceiptStream";
import { getTurnstileToken } from "@/lib/turnstile-client";
import { RocketMark } from "@/components/RocketMark";
import { TorontoSkyline } from "@/components/TorontoSkyline";
import type { SectionCount, CandidateSummary } from "@/lib/sections";

export function LandingShell({
  featuredSlot,
  surfacedSlot,
  sections,
  candidates,
}: {
  featuredSlot?: React.ReactNode;
  surfacedSlot: React.ReactNode;
  sections: SectionCount[];
  candidates: CandidateSummary[];
}) {
  const { state, submit, reset } = useReceiptStream();
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || undefined;

  async function onSectionPick(query: string) {
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
      <div className="bg-masthead text-masthead-ink relative overflow-hidden pb-10">
        <div className="text-center pt-8 px-8 relative z-10">
          <div className="flex items-center justify-center gap-2 mb-2">
            <RocketMark className="w-6 h-6" />
            <div className="font-sans font-semibold text-[30px] leading-[1.1] tracking-tight">The Mayoral Record</div>
          </div>
          <p className="font-serif italic text-[14px] leading-[1.5] text-muted max-w-[560px] mx-auto">Toronto's 2026 mayoral race, sourced and queryable.</p>
        </div>
        <div className="mt-7 relative z-10">
          <CommandBar onSubmit={onCommandSubmit} />
        </div>
        <TorontoSkyline className="absolute inset-x-0 bottom-0 h-10 text-white/15" />
      </div>

      {!state.query && (
        <div className="max-w-[1100px] mx-auto px-6 py-10 flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0 flex flex-col gap-8">
            {featuredSlot}
            {surfacedSlot}
          </div>
          <div className="lg:w-[280px] shrink-0">
            <SectionRail sections={sections} candidates={candidates} onSectionPick={onSectionPick} />
          </div>
        </div>
      )}
      {state.query && <ReceiptStream state={state} onFollowUp={onFollowUp} />}
    </div>
  );
}
