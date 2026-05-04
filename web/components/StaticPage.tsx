import Link from "next/link";

export function StaticPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="max-w-[760px] mx-auto px-8 py-10 font-sans text-ink leading-[1.65]">
      <Link href="/" className="text-accent text-[13px] no-underline hover:underline">{"←"} Back</Link>
      <h1 className="font-serif font-bold text-[28px] leading-[1.2] text-ink mt-6 mb-2">{title}</h1>
      <div className="space-y-4 [&_h2]:font-serif [&_h2]:font-bold [&_h2]:text-[18px] [&_h2]:leading-[1.3] [&_h2]:text-ink [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:pl-[22px] [&_ul]:space-y-1 [&_p]:mb-3 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-[3px]">
        {children}
      </div>
    </article>
  );
}
