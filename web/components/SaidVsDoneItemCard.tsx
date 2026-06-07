"use client";
import { useState } from "react";
import type { SaidVsDoneItem, RelatedVote } from "@/lib/said-vs-done";
import { councilAgendaUrl } from "@/lib/said-vs-done";

const MAX_VOTES = 3;

function VoteRow({ v }: { v: RelatedVote }) {
  const url = councilAgendaUrl(v.agenda_item);
  const sub = [v.result, (v.vote_date ?? "").slice(0, 10), v.agenda_item].filter(Boolean).join(" · ");
  return (
    <div className="mb-2.5">
      {v.vote_disposition && (
        <span className="font-mono text-[10px] border border-[#5a5240] text-[#c8c2b0] px-1.5 py-0.5 rounded-sm">
          VOTED {v.vote_disposition.toUpperCase()}
        </span>
      )}
      <span className="font-serif text-[13px] text-[#d4ccb8]"> {v.agenda_item_title ?? "(untitled motion)"}</span>
      <div className="font-mono text-[10.5px] text-muted">
        {url ? <a href={url} target="_blank" rel="noopener" className="hover:text-accent">{sub} ↗</a> : sub}
      </div>
    </div>
  );
}

export function SaidVsDoneItemCard({ item }: { item: SaidVsDoneItem }) {
  const [open, setOpen] = useState(false);
  const votes = open ? item.votes : item.votes.slice(0, MAX_VOTES);
  const remaining = item.votes.length - MAX_VOTES;
  return (
    <div className="bg-[#1c1813] border border-rule rounded-sm p-5">
      <div className="font-mono text-[10px] tracking-label uppercase text-muted mb-1.5">
        Said · {item.kind} · {(item.post_date ?? "").slice(0, 10)}
        {item.post_url && <> · <a href={item.post_url} target="_blank" rel="noopener" className="text-accent">source ↗</a></>}
      </div>
      <div className="font-serif text-[15px] leading-[1.4] text-ink mb-3.5">&ldquo;{item.summary}&rdquo;</div>
      <div className="border-l-2 border-rule pl-3.5 ml-0.5">
        <div className="font-mono text-[10px] tracking-label uppercase text-muted mb-2">Done · council votes</div>
        {votes.map((v, i) => <VoteRow key={`${v.agenda_item ?? "v"}-${i}`} v={v} />)}
        {remaining > 0 && (
          <button onClick={() => setOpen(!open)} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-accent cursor-pointer">
            {open ? "hide votes ↑" : `show ${remaining} more votes ↓`}
          </button>
        )}
      </div>
    </div>
  );
}
