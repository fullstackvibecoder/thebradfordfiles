export function Header() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center justify-between px-8 pt-5 font-mono text-[10px] uppercase tracking-label text-accent">
      <span>The Mayoral Record</span>
      <span className="text-muted">RECORD . {today}</span>
    </div>
  );
}
