"use client";
import { useState } from "react";

export interface ToolCallEvent {
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "complete" | "error";
  result_summary?: string;
  message?: string;
}

const HUMAN_LABEL: Record<string, string> = {
  list_candidates: "Listing candidates",
  search_records: "Searching records",
  lookup_council_vote: "Cross-referencing council votes",
  get_synthesis: "Loading synthesis cell",
  get_record_detail: "Loading record detail",
};

export function VerificationTrail({ events, complete }: { events: ToolCallEvent[]; complete: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (events.length === 0 && !complete) return null;

  if (complete && !expanded && events.length > 0) {
    const totalRefs = events.filter(e => e.status === "complete").length;
    return (
      <div className="max-w-[780px] mx-auto bg-white border border-rule rounded-sm px-4 py-2.5 flex items-center gap-2 my-5">
        <span className="text-success font-mono text-[13px]">✓</span>
        <span className="font-sans text-[12.5px] text-[#3a3a35]">Verified. {totalRefs} {totalRefs === 1 ? "source" : "sources"} cross-referenced.</span>
        <button onClick={() => setExpanded(true)} className="ml-auto font-mono text-[10.5px] tracking-[0.06em] text-accent uppercase cursor-pointer">SHOW TRAIL ↓</button>
      </div>
    );
  }

  return (
    <div className="max-w-[780px] mx-auto my-5">
      <div className="label mb-2.5">Verification trail</div>
      <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto font-sans text-[12.5px] text-muted">
        {events.map((e, i) => {
          const verb = HUMAN_LABEL[e.tool] ?? e.tool;
          const args = Object.entries(e.args).filter(([_, v]) => v != null && v !== "").map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
          if (e.status === "running") {
            return <div key={i} className="flex items-center gap-2"><span className="text-accent font-mono">↳</span><span>{verb} {args && <span className="text-[#999] font-mono text-[10.5px]">{args}</span>}</span></div>;
          }
          if (e.status === "error") {
            return <div key={i} className="flex items-center gap-2"><span className="text-[#b50909] font-mono">!</span><span>{verb} {e.message ?? "error"}</span></div>;
          }
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-accent font-mono">↳</span>
              <span>{verb}</span>
              {e.result_summary && <span className="ml-auto font-mono text-[10.5px] text-[#999]">{e.result_summary}</span>}
            </div>
          );
        })}
        {complete && (
          <div className="flex items-center gap-2"><span className="text-success font-mono">✓</span><span className="text-success">Verified. Drafting answer.</span></div>
        )}
      </div>
      {complete && expanded && events.length > 0 && (
        <button onClick={() => setExpanded(false)} className="mt-2 font-mono text-[10.5px] tracking-[0.06em] text-accent uppercase cursor-pointer">HIDE TRAIL ↑</button>
      )}
    </div>
  );
}
