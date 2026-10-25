import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, Moon, Repeat2, Ship, Undo2 } from "lucide-react";
import type { RoundTrip } from "@/lib/ferry/roundTrips";
import type { Sailing } from "@/lib/ferry/trips";
import { capitalizeFirst, formatDuration } from "@/lib/ferry/format";
import { CompanyBadge } from "./CompanyBadge";
import { SailingDetail } from "./SailingCard";
import { bookingSite, bookingUrl } from "@/lib/ferry/booking";
import { estimateFare, formatEuro, useFareProfile } from "@/lib/ferry/pricing";
import { vesselPositionsQuery } from "@/lib/ferry/useLiveShips";
import { wallTimeInZone } from "@/lib/ferry/time";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDay = (key: string) =>
  capitalizeFirst(dayFormatter.format(new Date(`${key}T00:00:00Z`)));

/** Identité visuelle par sens : aller = bleu pétrole, retour = orange (lisible d'un coup d'œil). */
const LEG_TONES = {
  out: {
    bar: "#1e5b7a",
    badge: "bg-primary/10 text-primary",
    expandedBg: "bg-primary/[0.04]",
  },
  back: {
    bar: "#c2410c",
    badge: "bg-[#c2410c]/10 text-[#c2410c]",
    expandedBg: "bg-[#c2410c]/[0.05]",
  },
} as const;

function Leg({
  label,
  tone,
  sailing,
  expanded,
  onToggle,
  onHover,
  onOpenVessel,
  onOpenRoute,
  extra,
  atdAt,
}: {
  label: string;
  tone: keyof typeof LEG_TONES;
  sailing: Sailing;
  atdAt: string | null;
  expanded: boolean;
  onToggle: () => void;
  onHover: (hovering: boolean) => void;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
  extra?: ReactNode;
}) {
  const panelId = `rt-${label}-${sailing.departure.id}`;
  const overnight = sailing.depHour >= 20 || sailing.depHour < 5;
  const fare = estimateFare(sailing, useFareProfile());
  const colors = LEG_TONES[tone];
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        className={`group/leg relative block w-full py-2 pl-3.5 pr-3 md:py-3 md:pl-4 md:pr-3.5 text-left transition-colors hover:bg-secondary/40 ${expanded ? colors.expandedBg : ""}`}
      >
        <span
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ background: colors.bar }}
          aria-hidden
        />
        <div className="mb-1 flex items-center justify-between gap-2 text-xs md:mb-2">
          <span className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors.badge}`}
            >
              {tone === "back" ? <Undo2 className="size-3" aria-hidden /> : null}
              {label}
            </span>
            <span className="font-semibold text-foreground">{formatDay(sailing.dayKey)}</span>
          </span>
          {overnight ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              <Moon className="size-3" aria-hidden /> Nuit
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div>
            <div className="font-display text-xl md:text-2xl font-bold leading-none tabular-nums tracking-tight">
              {atdAt ? (
                <>
                  <span className="text-muted-foreground line-through">{sailing.depTime}</span>
                  <span className="ml-1.5 text-sm font-bold text-success">
                    {wallTimeInZone(atdAt, sailing.fromZone)} réel
                  </span>
                </>
              ) : (
                sailing.depTime
              )}
            </div>
            <div className="mt-0.5 max-w-[96px] truncate text-xs font-semibold">
              {sailing.from.name}
            </div>
          </div>
          <div className="relative flex flex-col items-center px-1" aria-hidden>
            <span className="mb-1.5 text-[11px] md:mb-2.5 font-semibold tabular-nums text-muted-foreground">
              {formatDuration(sailing.durationMin)}
            </span>
            <div className="relative h-0.5 w-full rounded-full bg-border">
              <span className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-cta opacity-0 transition-opacity duration-300 group-hover/leg:opacity-100" />
              <span className="absolute -left-0.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
              <span className="absolute -right-0.5 top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-primary bg-card" />
              <span className="absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card text-primary shadow-sm ring-1 ring-border transition-transform duration-500 group-hover/leg:translate-x-3">
                <Ship className="size-3.5" />
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-xl md:text-2xl font-bold leading-none tabular-nums tracking-tight">
              {sailing.arrTime ?? "—"}
              {sailing.arrDayOffset > 0 ? (
                <sup className="ml-0.5 text-[11px] font-semibold text-cta">
                  +{sailing.arrDayOffset}
                </sup>
              ) : null}
            </div>
            <div className="ml-auto mt-0.5 max-w-[96px] truncate text-xs font-semibold">
              {sailing.to.name}
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] md:mt-2.5 md:text-xs text-muted-foreground">
          <CompanyBadge
            name={sailing.company?.name ?? "?"}
            logoUrl={sailing.company?.logo_url ?? null}
            size={18}
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold text-foreground">
              {sailing.company?.name ?? "Compagnie"}
            </span>
            {sailing.vessel ? ` · ${sailing.vessel.name}` : ""}
          </span>
          <span
            className="shrink-0 text-xs font-bold tabular-nums text-success"
            title="Tarif moyen indicatif"
          >
            {formatEuro(fare)}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary">
            {expanded ? "Masquer" : "Détails"}
            <ChevronDown
              className={`size-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </div>
      </button>
      <div
        id={panelId}
        role="region"
        aria-label={`Détail du trajet ${label.toLowerCase()}`}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          {expanded ? (
            <>
              <SailingDetail
                sailing={sailing}
                onOpenVessel={onOpenVessel}
                onOpenRoute={onOpenRoute}
                showBooking
              />
              {extra}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Carte Duo aller + retour sur deux étages, synthèse (séjour, prix A/R) en pied. */
export function RoundTripCard({
  trip,
  index,
  onOpenVessel,
  onOpenRoute,
  onHoverRoute,
  onFocusRoute,
}: {
  trip: RoundTrip;
  index: number;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
  onHoverRoute: (routeId: string | null) => void;
  onFocusRoute?: (routeId: string | null) => void;
}) {
  const [open, setOpen] = useState<"out" | "back" | null>(null);
  const { data: livePositions = [] } = useQuery(vesselPositionsQuery);
  const actualDeparture = (sailing: Sailing) => {
    const mmsi = sailing.vessel?.mmsi;
    if (!mmsi) return null;
    const position = livePositions.find((item) => item.mmsi === mmsi);
    if (!position?.atdAt) return null;
    const atdTime = Date.parse(position.atdAt);
    const scheduled = Date.parse(sailing.departure.departure_at);
    // Ne pas afficher un ancien ATD d'une traversée précédente.
    return atdTime >= scheduled - 6 * 60 * 60_000 && atdTime <= scheduled + 24 * 60 * 60_000
      ? position.atdAt
      : null;
  };
  const toggle = (leg: "out" | "back") => {
    const next = open === leg ? null : leg;
    setOpen(next);
    // Le trajet ouvert prime sur les filtres : sa ligne est mise en avant et cadrée sur la carte.
    onFocusRoute?.(next ? (next === "out" ? trip.out : trip.back).route.id : null);
  };
  const profile = useFareProfile();
  const total = estimateFare(trip.out, profile) + estimateFare(trip.back, profile);
  const bookHref = bookingUrl(trip.out, profile, trip.back);
  const bookSite = bookingSite(trip.out, trip.back);
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className={`sailing-card overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm transition-all duration-200 hover:shadow-lg ${open ? "border-primary ring-2 ring-primary/20" : ""}`}
    >
      <header className="flex items-center gap-2 border-b border-border/70 bg-muted/30 px-3.5 py-1.5">
        <Repeat2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted-foreground">
          {trip.out.from.name} ⇄ {trip.out.to.name}
          {trip.mirror ? "" : ` · retour depuis ${trip.back.from.name}`}
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
          {trip.stayDays > 0 ? `${trip.stayDays} j sur place` : "Aller-retour"}
        </span>
      </header>
      <Leg
        label="Aller"
        tone="out"
        sailing={trip.out}
        atdAt={actualDeparture(trip.out)}
        expanded={open === "out"}
        onToggle={() => toggle("out")}
        onOpenVessel={onOpenVessel}
        onOpenRoute={onOpenRoute}
        onHover={(h) => onHoverRoute(h ? trip.out.route.id : null)}
      />
      <div className="relative border-t border-dashed border-border" aria-hidden>
        <span className="absolute left-1/2 top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground">
          <Repeat2 className="size-3" />
        </span>
      </div>
      <Leg
        label="Retour"
        tone="back"
        sailing={trip.back}
        atdAt={actualDeparture(trip.back)}
        expanded={open === "back"}
        onToggle={() => toggle("back")}
        onOpenVessel={onOpenVessel}
        onOpenRoute={onOpenRoute}
        onHover={(h) => onHoverRoute(h ? trip.back.route.id : null)}
      />
      <footer className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/40 px-3.5 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Estimation A/R
        </span>
        <a
          href={bookHref}
          target="_blank"
          rel="noopener noreferrer"
          title="Tarif moyen indicatif aller + retour"
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-cta px-3 text-xs font-semibold tabular-nums text-cta-foreground shadow-sm transition hover:brightness-110 active:scale-95"
        >
          ≈ {formatEuro(total)} <ArrowUpRight className="size-3.5" aria-hidden />
          <span className="sr-only">sur {bookSite} (nouvel onglet)</span>
        </a>
      </footer>
    </article>
  );
}
