import type { ReactNode } from "react";
import { ExternalLink, Star } from "lucide-react";
import { reliabilityLabel, reliabilityTone } from "@/lib/ferry/format";
import type { Company, Reliability } from "@/lib/ferry/types";

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
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 pt-6 md:px-6 md:pt-8">
      <div className="min-w-0 flex-1 basis-56">
        {overline ? (
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {overline}
          </div>
        ) : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`batogo-section flex flex-col gap-4 ${className}`}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Sources internes (imports de fichiers) : jamais affichées au public. */
export function isInternalSource(name?: string | null) {
  return !!name && /import|excel|\.xlsx?|\.csv/i.test(name);
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
  const href = safeExternalUrl(sourceUrl);
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <span className={`font-semibold ${reliabilityTone[reliability]}`}>
        {reliabilityLabel[reliability]}
      </span>
      {sourceName && !isInternalSource(sourceName) ? (
        <>
          {" · Source : "}
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              {sourceName}
            </a>
          ) : (
            sourceName
          )}
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
  return (
    <span
      className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning-foreground"
      title="Données d'exemple, non vérifiées"
    >
      Démonstration
    </span>
  );
}

/** N'accepte que les liens web (http/https), pour ne jamais ouvrir un lien piégé saisi dans l'admin. */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Bouton de sortie vers la compagnie : Batogo informe, la réservation se fait chez l'opérateur. */
export function BookingLink({
  company,
  compact = false,
}: {
  company: Pick<Company, "name" | "website_url"> | undefined;
  compact?: boolean;
}) {
  const href = safeExternalUrl(company?.website_url);
  if (!company || !href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-cta font-semibold text-cta-foreground shadow-sm transition hover:bg-cta/90 ${compact ? "h-9 px-3 text-xs" : "h-11 w-full px-4 text-sm"}`}
    >
      Réserver sur le site de {company.name}
      <ExternalLink className="size-4" aria-hidden />
      <span className="sr-only">(nouvel onglet)</span>
    </a>
  );
}

export function Stars({ value }: { value: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`${value.toFixed(1)} sur 5`}
      title={`${value.toFixed(1)} / 5`}
    >
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
