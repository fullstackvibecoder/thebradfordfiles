export function RocketMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="var(--accent)" />
      <rect x="12" y="11" width="16" height="18" rx="3" fill="var(--accent-ink)" />
      <rect x="14" y="14" width="12" height="6" fill="var(--accent)" />
    </svg>
  );
}
