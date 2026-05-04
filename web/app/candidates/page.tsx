import Link from "next/link";
import { listCandidates } from "@/lib/agent/data-loader";

export const metadata = { title: "All candidates . The Mayoral Record" };

export default function CandidateIndex() {
  const cands = listCandidates();
  return (
    <main className="max-w-[760px] mx-auto px-8 py-10">
      <h1 className="font-serif font-bold text-[28px] leading-[1.2] text-ink mb-2">Candidates</h1>
      <p className="font-sans text-[14px] text-muted mb-6">Listed alphabetically by surname.</p>
      <ul className="space-y-3">
        {cands.map(c => (
          <li key={c.slug}>
            <Link href={`/candidates/${c.slug}`} className="font-sans font-medium text-[16px] text-ink hover:text-accent">{c.display_name}</Link>
            {c.current_role && <span className="font-sans text-[12.5px] text-muted ml-2">{c.current_role}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
