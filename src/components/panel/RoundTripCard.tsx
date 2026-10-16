import { ArrowRight, Moon } from "lucide-react";
import type { RoundTrip } from "@/lib/ferry/roundTrips";
import type { Sailing } from "@/lib/ferry/trips";
import { capitalizeFirst, formatDuration } from "@/lib/ferry/format";
import { CompanyBadge } from "./CompanyBadge";

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
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="min-w-0 flex-1 space-y-1 p-3 text-left transition hover:bg-secondary/60"
    >
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="flex items-center gap-1 truncate text-sm font-bold">
        <span className="truncate">{sailing.from.name}</span>
        <ArrowRight className="size-3 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{sailing.to.name}</span>
      </span>
      <span className="block text-xs font-semibold">{formatDay(sailing.dayKey)}</span>
      <span className="block text-xs tabular-nums text-muted-foreground">
        {sailing.depTime} → {sailing.arrTime ?? "—"}
        {sailing.arrDayOffset > 0 ? <sup className="ml-0.5">+{sailing.arrDayOffset}</sup> : null}
        {sailing.durationMin ? ` · ${formatDuration(sailing.durationMin)}` : ""}
        {overnight ? <Moon className="ml-1 inline size-3" aria-label="Traversée de nuit" /> : null}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
        <CompanyBadge
          name={sailing.company?.name ?? "?"}
          logoUrl={sailing.company?.logo_url ?? null}
          size={16}
        />
        <span className="truncate">
          {sailing.company?.name ?? "Compagnie"}
          {sailing.vessel ? ` · ${sailing.vessel.name}` : ""}
        </span>
      </span>
    </button>
  );
}

/** Couple aller | retour, côte à côte (empilés sur très petit écran). */
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
      className="sailing-card overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
    >
      <div className="flex flex-col divide-y divide-border min-[380px]:flex-row min-[380px]:divide-x min-[380px]:divide-y-0">
        <Leg
          label="Aller"
          sailing={trip.out}
          onOpen={() => onOpenDeparture(trip.out.departure.id)}
          onHover={(h) => onHoverRoute(h ? trip.out.route.id : null)}
        />
        <Leg
          label="Retour"
          sailing={trip.back}
          onOpen={() => onOpenDeparture(trip.back.departure.id)}
          onHover={(h) => onHoverRoute(h ? trip.back.route.id : null)}
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-secondary/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          Séjour de {trip.stayDays} jour{trip.stayDays > 1 ? "s" : ""}
        </span>
        {!trip.mirror ? <span className="font-semibold text-primary">Ports différents</span> : null}
      </div>
    </article>
  );
}
