"use client";
import { useState } from "react";
import type { SaidVsDoneItem } from "@/lib/said-vs-done";
import { SaidVsDoneItemCard } from "@/components/SaidVsDoneItemCard";

export function MorePositions({ items }: { items: SaidVsDoneItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      {open && <div className="space-y-4 mb-3">{items.map((it, i) => <SaidVsDoneItemCard key={`${it.shortcode}-${i}`} item={it} />)}</div>}
      <button onClick={() => setOpen(!open)} className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-accent cursor-pointer">
        {open ? "hide positions ↑" : `show ${items.length} more positions ↓`}
      </button>
    </div>
  );
}
