/** Logo Batogo : une coque de bateau qui file vers la droite. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-[image:var(--gradient-brand)] text-primary-foreground shadow-[var(--shadow-brand)] ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor">
        <path
          d="M3 14h18l-2.6 5.2a2 2 0 0 1-1.8 1.1H7.4a2 2 0 0 1-1.8-1.1L3 14Z"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 14V3l7 6.5" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
