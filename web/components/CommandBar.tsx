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
    const token = await getTurnstileToken(siteKey);
    onSubmit(q, token);
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-[640px] mx-auto px-8">
      <div className="bg-white border border-stamp-border rounded p-3 flex items-center shadow-[0_1px_0_rgba(0,0,0,0.02)] focus-within:border-accent transition-colors">
        <span className="text-accent mr-3 text-base">⌕</span>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          className="flex-1 outline-none bg-transparent text-[14px] placeholder:text-[#9a9a92]"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="ml-auto font-mono text-[9.5px] text-accent border border-stamp-border px-2 py-[2px] tracking-label uppercase disabled:opacity-50"
        >
          ↵ ask
        </button>
      </div>
    </form>
  );
}
