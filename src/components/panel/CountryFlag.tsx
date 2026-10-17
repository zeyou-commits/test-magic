/** Petits drapeaux vectoriels : les émojis drapeaux ne s'affichent pas sur Windows. */
export function CountryFlag({ code, className = "" }: { code: string; className?: string }) {
  const cls = `inline-block h-3 w-[18px] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-foreground/15 align-[-1px] ${className}`;
  switch (code) {
    case "FR":
    case "IT": {
      const [a, c] = code === "FR" ? ["#0055A4", "#EF4135"] : ["#009246", "#CE2B37"];
      return (
        <svg viewBox="0 0 3 2" className={cls} aria-hidden>
          <rect width="1" height="2" fill={a} />
          <rect x="1" width="1" height="2" fill="#fff" />
          <rect x="2" width="1" height="2" fill={c} />
        </svg>
      );
    }
    case "ES":
      return (
        <svg viewBox="0 0 3 2" className={cls} aria-hidden>
          <rect width="3" height="2" fill="#AA151B" />
          <rect y="0.5" width="3" height="1" fill="#F1BF00" />
        </svg>
      );
    case "DZ":
      return (
        <svg viewBox="0 0 30 20" className={cls} aria-hidden>
          <rect width="15" height="20" fill="#006233" />
          <rect x="15" width="15" height="20" fill="#fff" />
          <circle cx="15" cy="10" r="5" fill="#D21034" />
          <circle cx="16.3" cy="10" r="4" fill="#fff" />
          <path d="M17.2 10l3.2-1.1-2 2.7V8.4l2 2.7z" fill="#D21034" />
        </svg>
      );
    case "TN":
      return (
        <svg viewBox="0 0 30 20" className={cls} aria-hidden>
          <rect width="30" height="20" fill="#E70013" />
          <circle cx="15" cy="10" r="5" fill="#fff" />
          <circle cx="15.5" cy="10" r="3.5" fill="#E70013" />
          <circle cx="16.4" cy="10" r="2.8" fill="#fff" />
        </svg>
      );
    case "MA":
      return (
        <svg viewBox="0 0 30 20" className={cls} aria-hidden>
          <rect width="30" height="20" fill="#C1272D" />
          <path d="M15 6l1.2 3.6h3.8l-3 2.3 1.1 3.6-3.1-2.2-3.1 2.2 1.1-3.6-3-2.3h3.8z" fill="none" stroke="#006233" strokeWidth="0.8" />
        </svg>
      );
    default:
      return <span className="text-[10px] font-bold text-muted-foreground">{code}</span>;
  }
}
