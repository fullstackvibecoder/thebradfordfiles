import { Dateline } from "@/components/Dateline";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Dateline />
      <div className="flex items-center justify-between px-8 pt-2 font-mono text-[10px] uppercase tracking-label text-accent">
        <span>The Mayoral Record</span>
        <div className="flex items-center gap-3">
          <span className="text-muted">RECORD . {today}</span>
          <ThemeToggle />
        </div>
      </div>
    </>
  );
}
