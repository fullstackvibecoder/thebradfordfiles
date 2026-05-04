export function DropCap({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={"font-serif text-[13.5px] leading-[1.65] text-ink drop-cap " + className}>{children}</p>;
}
