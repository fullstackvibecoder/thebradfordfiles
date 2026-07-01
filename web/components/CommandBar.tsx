"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ensureTurnstileScript, getTurnstileToken } from "@/lib/turnstile-client";

export function CommandBar({ onSubmit, placeholder = "Ask about a candidate, a topic, or a vote." }: { onSubmit: (query: string, token: string) => void; placeholder?: string }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const siteKey = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim() || undefined;

  useEffect(() => { ensureTurnstileScript(); }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const token = await getTurnstileToken(siteKey);
      onSubmit(q, token);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[640px] mx-auto px-8">
      <div className="bg-surface border border-rule rounded-full pl-5 pr-1.5 py-1.5 flex items-center shadow-[0_6px_18px_rgba(0,0,0,0.12)] focus-within:border-accent transition-colors">
        <span className="text-accent mr-3 text-base shrink-0">⌕</span>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          className="flex-1 min-w-0 outline-none bg-transparent text-[14px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="ml-2 shrink-0 font-mono text-[10.5px] tracking-label uppercase bg-accent text-accent-ink rounded-full px-4 py-2 disabled:opacity-50"
        >
          {busy ? "…" : "Ask ▸"}
        </button>
      </div>
    </form>
  );
}
