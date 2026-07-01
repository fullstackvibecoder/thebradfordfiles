"use client";
import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

function apply(mode: Mode) {
  const e = document.documentElement;
  e.classList.remove("light", "dark");
  if (mode === "light") e.classList.add("light");
  if (mode === "dark") e.classList.add("dark");
  try {
    if (mode === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", mode);
  } catch {}
}

const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "◐ System", light: "☀ Light", dark: "☾ Dark" };

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    let stored: Mode = "system";
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") stored = t;
    } catch {}
    setMode(stored);
  }, []);
  return (
    <button
      type="button"
      onClick={() => { const n = NEXT[mode]; setMode(n); apply(n); }}
      aria-label={`Theme: ${mode}. Click to change.`}
      className="font-mono text-[10.5px] tracking-label uppercase text-masthead-ink/80 border border-white/20 rounded-full px-3 py-1 hover:border-white/50 transition-colors"
    >
      {LABEL[mode]}
    </button>
  );
}
