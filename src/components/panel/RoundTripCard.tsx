import { ArrowUpRight, CalendarDays, Moon, Ship, Shuffle } from "lucide-react";
import type { RoundTrip } from "@/lib/ferry/roundTrips";
import type { Sailing } from "@/lib/ferry/trips";
import { capitalizeFirst, formatDuration } from "@/lib/ferry/format";
import { CompanyBadge, companyColor } from "./CompanyBadge";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDay = (key: string) => capitalizeFirst(dayFormatter.format(new Date(`${key}T00:00:00Z`)));

function Leg({
  label,
  sailing,
  onOpen,
  onHover,
}: {
  label: string;
  sailing: Sailing;
  onOpen: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const overnight = sailing.depHour >= 20 || sailing.depHour < 5;
  const brand = companyColor(sailing.company?.name);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="group/leg relative block w-full py-3 pl-4 pr-3.5 text-left transition-colors hover:bg-secondary/40"
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: brand.solid }} aria-hidden />
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
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
          <div className="font-display text-2xl font-bold leading-none tabular-nums tracking-tight">
            {sailing.depTime}
          </div>
          <div className="mt-0.5 max-w-[96px] truncate text-xs font-semibold">{sailing.from.name}</div>
        </div>
        <div className="relative flex flex-col items-center px-1" aria-hidden>
          <span className="mb-2.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
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
          <div className="font-display text-2xl font-bold leading-none tabular-nums tracking-tight">
            {sailing.arrTime ?? "—"}
            {sailing.arrDayOffset > 0 ? (
              <sup className="ml-0.5 text-[11px] font-semibold text-cta">+{sailing.arrDayOffset}</sup>
            ) : null}
          </div>
          <div className="ml-auto mt-0.5 max-w-[96px] truncate text-xs font-semibold">{sailing.to.name}</div>
        </div>
      </div>

      <div className="mt-2.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <CompanyBadge
          name={sailing.company?.name ?? "?"}
          logoUrl={sailing.company?.logo_url ?? null}
          size={20}
        />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-foreground">{sailing.company?.name ?? "Compagnie"}</span>
          {sailing.vessel ? ` · ${sailing.vessel.name}` : ""}
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover/leg:text-cta" aria-hidden />
      </div>
    </button>
  );
}

/** Carte Duo aller + retour sur deux étages, séparés par la durée du séjour. */
export function RoundTripCard({
  trip,
  index,
  onOpenDeparture,
  onHoverRoute,
}: {
  trip: RoundTrip;
  index: number;
  onOpenDeparture: (departureId: string) => void;
  onHoverRoute: (routeId: string | null) => void;
}) {
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className="sailing-card overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <Leg
        label="Aller"
        sailing={trip.out}
        onOpen={() => onOpenDeparture(trip.out.departure.id)}
        onHover={(h) => onHoverRoute(h ? trip.out.route.id : null)}
      />
      <div className="relative flex items-center justify-center py-1" aria-hidden={false}>
        <span className="absolute inset-x-4 top-1/2 border-t border-dashed border-border" aria-hidden />
        <span className="relative flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm">
          <CalendarDays className="size-3 text-primary" aria-hidden />
          {trip.stayDays} jour{trip.stayDays > 1 ? "s" : ""} sur place
          {!trip.mirror ? (
            <span className="ml-1 inline-flex items-center gap-1 text-cta">
              <Shuffle className="size-3" aria-hidden /> autre port
            </span>
          ) : null}
        </span>
      </div>
      <Leg
        label="Retour"
        sailing={trip.back}
        onOpen={() => onOpenDeparture(trip.back.departure.id)}
        onHover={(h) => onHoverRoute(h ? trip.back.route.id : null)}
      />
    </article>
  );
}
