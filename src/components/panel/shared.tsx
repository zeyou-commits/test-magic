import type { ReactNode } from "react";
import { reliabilityLabel, reliabilityTone } from "@/lib/ferry/format";
import type { Reliability } from "@/lib/ferry/types";

export function PanelHeader({
  overline,
  title,
  subtitle,
  actions,
}: {
  overline?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="px-5 pb-3 pt-5">
      {overline ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {overline}
        </p>
      ) : null}
      <h2 className="mt-1 text-xl leading-tight font-semibold">{title}</h2>
      {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="batogo-section">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ReliabilityNote({
  reliability,
  sourceName,
  sourceUrl,
  verifiedAt,
}: {
  reliability: Reliability;
  sourceName?: string | null;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
}) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className={`font-semibold ${reliabilityTone[reliability]}`}>
        {reliabilityLabel[reliability]}
      </span>
      {sourceName ? (
        <>
          {" · Source : "}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {sourceName}
            </a>
          ) : (
            sourceName
          )}
        </>
      ) : null}
      {verifiedAt
        ? ` · Vérifié le ${new Date(verifiedAt).toLocaleDateString("fr-FR")}`
        : null}
    </p>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function DemoBadge() {
  return (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground">
      Démonstration
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="text-accent" aria-hidden>
        {"★".repeat(Math.floor(rounded))}
        {rounded % 1 ? "⯨" : ""}
        {"☆".repeat(Math.max(0, 5 - Math.ceil(rounded)))}
      </span>
      <span className="font-semibold">{value.toFixed(1)}</span>
    </span>
  );
}
