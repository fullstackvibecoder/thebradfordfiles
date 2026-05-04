import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 px-8 py-6 border-t border-rule text-center font-sans text-[11px] text-muted">
      <span>Independent civic-transparency project. No campaign affiliation.</span>
      <span className="mx-3 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/methodology">Methodology</Link>
      <span className="mx-2 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/privacy">Privacy</Link>
      <span className="mx-2 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/terms">Terms</Link>
      <span className="mx-2 text-stamp-border">.</span>
      <Link className="underline underline-offset-[3px] text-muted hover:text-ink" href="/candidates">All candidates</Link>
    </footer>
  );
}
