import { useState } from "react";
import { ChevronDown, CalendarDays, Moon, Ship, Shuffle } from "lucide-react";
import type { RoundTrip } from "@/lib/ferry/roundTrips";
import type { Sailing } from "@/lib/ferry/trips";
import { capitalizeFirst, formatDuration } from "@/lib/ferry/format";
import { CompanyBadge, companyColor } from "./CompanyBadge";
import { SailingDetail } from "./SailingCard";

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
  expanded,
  onToggle,
  onHover,
  onOpenVessel,
  onOpenRoute,
}: {
  label: string;
  sailing: Sailing;
  expanded: boolean;
  onToggle: () => void;
  onHover: (hovering: boolean) => void;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
}) {
  const panelId = `rt-${label}-${sailing.departure.id}`;
  const overnight = sailing.depHour >= 20 || sailing.depHour < 5;
  const brand = companyColor(sailing.company?.name);
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
      className={`group/leg relative block w-full py-3 pl-4 pr-3.5 text-left transition-colors hover:bg-secondary/40 ${expanded ? "bg-primary/[0.04]" : ""}`}
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
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary">
          {expanded ? "Masquer" : "Détails"}
          <ChevronDown className={`size-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} aria-hidden />
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
        {expanded ? <SailingDetail sailing={sailing} onOpenVessel={onOpenVessel} onOpenRoute={onOpenRoute} /> : null}
      </div>
    </div>
    </div>
  );
}

/** Carte Duo aller + retour sur deux étages, séparés par la durée du séjour. */
export function RoundTripCard({
  trip,
  index,
  onOpenVessel,
  onOpenRoute,
  onHoverRoute,
}: {
  trip: RoundTrip;
  index: number;
  onOpenVessel: (vesselId: string) => void;
  onOpenRoute: (routeId: string) => void;
  onHoverRoute: (routeId: string | null) => void;
}) {
  const [open, setOpen] = useState<"out" | "back" | null>(null);
  const toggle = (leg: "out" | "back") => setOpen((cur) => (cur === leg ? null : leg));
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
      className={`sailing-card overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:shadow-lg ${open ? "border-primary ring-2 ring-primary/20" : ""}`}
    >
      <Leg
        label="Aller"
        sailing={trip.out}
        expanded={open === "out"}
        onToggle={() => toggle("out")}
        onOpenVessel={onOpenVessel}
        onOpenRoute={onOpenRoute}
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
        expanded={open === "back"}
        onToggle={() => toggle("back")}
        onOpenVessel={onOpenVessel}
        onOpenRoute={onOpenRoute}
        onHover={(h) => onHoverRoute(h ? trip.back.route.id : null)}
      />
    </article>
  );
}
