import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { reliabilityLabel, reliabilityTone } from "@/lib/ferry/format";
import type { Reliability } from "@/lib/ferry/types";

export function PanelHeader({ overline, title, subtitle, actions }: { overline?: string; title: string; subtitle?: ReactNode; actions?: ReactNode; }) {
  return (
    <header className="flex items-start justify-between gap-4 px-4 pt-6 md:px-6 md:pt-8">
      <div>
        {overline ? <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{overline}</div> : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <div>{subtitle}</div> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode; }) {
  return (
    <section className="batogo-section flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ReliabilityNote({ reliability, sourceName, sourceUrl, verifiedAt }: { reliability: Reliability; sourceName?: string | null; sourceUrl?: string | null; verifiedAt?: string | null; }) {
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <span className={`font-medium ${reliabilityTone[reliability]}`}>{reliabilityLabel[reliability]}</span>
      {sourceName ? (
        <>
          {" · Source : "}
          {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">{sourceName}</a> : sourceName}
        </>
      ) : null}
      {verifiedAt ? ` · Vérifié le ${new Date(verifiedAt).toLocaleDateString("fr-FR")}` : null}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

export function DemoBadge() {
  return <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">Démonstration</span>;
}

export function Stars({ value }: { value: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <div className="flex items-center gap-1.5" aria-label={`${value.toFixed(1)} sur 5`} title={`${value.toFixed(1)} / 5`}>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = rounded >= star ? 100 : rounded >= star - 0.5 ? 50 : 0;
          return (
            <div key={star} className="relative size-4">
              <Star className="absolute inset-0 size-4 text-muted" strokeWidth={2} />
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}>
                <Star className="size-4 fill-amber-500 text-amber-500" strokeWidth={2} />
              </div>
            </div>
          );
        })}
      </div>
      <span className="text-xs font-semibold text-foreground">{value.toFixed(1)}</span>
    </div>
  );
}
