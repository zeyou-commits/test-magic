import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { matchesTraffic } from "@/lib/ferry/filterSync";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ship, ArrowDownLeft, ArrowUpRight, MapPin } from "lucide-react";
import { TrafficCard } from "./TrafficCard";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { useFleet } from "@/lib/ferry/useFleet";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import { SeaChip } from "./SeaForecast";
import { trackingTimes } from "@/lib/ferry/tracking";
import { formatDateParts } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import { emptyFilters, type Filters, type Selection } from "@/lib/ferry/types";
import { CompanyBadge } from "./CompanyBadge";
import { MyTripsShortcut } from "./MyTrip";
import { MyTripHero } from "./MyTripHero";
import { useMyTrip } from "@/lib/ferry/myTrip";
import type { MapPreview } from "@/lib/ferry/mapPresentation";
import { tr } from "@/lib/i18n";

export function HomeTraffic({
  onSelect,
  onPreview,
  filters = emptyFilters,
}: {
  onSelect: (selection: Selection) => void;
  onPreview?: (preview: MapPreview | null) => void;
  filters?: Filters;
}) {
  const previewEvents = (preview: MapPreview) => ({
    onPointerEnter: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") onPreview?.(preview);
    },
    onPointerLeave: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") onPreview?.(null);
    },
    onFocusCapture: () => onPreview?.(preview),
    onBlurCapture: (event: React.FocusEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onPreview?.(null);
    },
  });
  const { data: recent = [] } = useQuery(fleetDeparturesQuery);
  const { data: upcoming = [], isPending, error } = useQuery(upcomingDeparturesQuery());
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const fleet = useFleet();
  const signals = useLiveShips();
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<"all" | "departure" | "arrival">("all");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const departures = [...new Map([...recent, ...upcoming].map((d) => [d.id, d])).values()].filter(
    (d) => matchesTraffic(d, routes, ports, filters),
  );
  const crossings = departures.flatMap((departure) => {
    const route = routes.find((r) => r.id === departure.route_id);
    const from = ports.find((p) => p.id === route?.departure_port_id);
    const to = ports.find((p) => p.id === route?.arrival_port_id);
    if (!from || !to) return [];
    const live = signals.find((s) => s.departure.id === departure.id);
    const times = trackingTimes(departure, live);
    return [
      {
        departure,
        from,
        to,
        live,
        times,
        company: companies.find((c) => c.id === departure.company_id),
        vessel: vessels.find((v) => v.id === departure.vessel_id),
      },
    ];
  });
  const { trip } = useMyTrip();
  const allSailing = crossings.filter((c) =>
    fleet.some((s) => s.state === "sea" && s.departureId === c.departure.id),
  );
  // Ma traversée est déjà suivie dans son bloc, en tête : pas de doublon dans la liste.
  const sailing = allSailing.filter((c) => c.departure.id !== trip?.departure.id);
  const mineSailing = sailing.length !== allSailing.length;
  const events = crossings
    .flatMap((c) => [
      { ...c, kind: "departure" as const, iso: c.times.departure.iso, port: c.from },
      { ...c, kind: "arrival" as const, iso: c.times.arrival.iso, port: c.to },
    ])
    .filter(
      (event) =>
        event.iso && Date.parse(event.iso) >= now && (filter === "all" || event.kind === filter),
    )
    .sort((a, b) => Date.parse(a.iso!) - Date.parse(b.iso!));
  return (
    <div className="bw-home-traffic">
      <MyTripHero onSelect={onSelect} />
      <MyTripsShortcut onSelect={onSelect} />
      {mineSailing && !sailing.length ? null : (
      <section aria-label={tr("ui.homeTraffic.traverseesEnNavigation")}>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Ship size={16} aria-hidden /> {mineSailing ? tr("ui.homeTraffic.autresNaviresEnRoute") : tr("ui.homeTraffic.enNavigation")}{" "}
          <span className="text-xs font-normal text-muted-foreground">{sailing.length || ""}</span>
        </h2>
        {sailing.length ? (
          sailing.map((c) => (
            <TrafficCard
              key={c.departure.id}
              crossing={c}
              onSelect={onSelect}
              {...(onPreview ? { onPreview } : {})}
            />
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            {isPending
              ? tr("ui.homeTraffic.chargementDesTraversees")
              : tr("ui.homeTraffic.aucuneTraverseeEnNavigationConnue")}
          </p>
        )}
      </section>
      )}
      <section className="mt-4" aria-label={tr("ui.homeTraffic.prochainsDepartsEtArrivees")}>
        <h2 className="mb-2 text-sm font-bold">Départs & arrivées</h2>
        <div className="mb-2 flex rounded-xl bg-secondary p-1" aria-label={tr("ui.homeTraffic.filtrerLesMouvements")}>
          {(
            [
              ["all", "Tous"],
              ["departure", "Départs"],
              ["arrival", "Arrivées"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
              }}
              className={`min-h-9 flex-1 rounded-lg text-xs font-semibold ${filter === value ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {(() => {
          // Mouvements regroupés par port, dans l'ordre du premier mouvement de chaque port.
          const groups = new Map<string, typeof events>();
          events.slice(0, 6).forEach((e) => {
            groups.set(e.port.id, [...(groups.get(e.port.id) ?? []), e]);
          });
          return [...groups.values()].map((list) => (
            <div
              key={list[0]!.port.id}
              className="mb-3 overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => onSelect({ type: "port", id: list[0]!.port.id })}
                className="flex w-full items-center gap-1.5 border-b border-border/70 bg-secondary/70 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-foreground hover:text-primary"
              >
                <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
                {list[0]!.port.name}
              </button>
              {list.map((event) => {
                const parts = formatDateParts(event.iso!, portTimeZone(event.port));
                return (
                  <div
                    key={`${event.departure.id}:${event.kind}`}
                    className="relative flex items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0"
                    {...previewEvents({
                      routeId: event.departure.route_id,
                      ...(event.vessel ? { vesselId: event.vessel.id } : {}),
                    })}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onSelect(
                          event.vessel
                            ? { type: "vessel", id: event.vessel.id }
                            : { type: "departure", id: event.departure.id },
                        )
                      }
                      aria-label={`${event.kind === "arrival" ? "Arrivée" : "Départ"} ${event.vessel?.name ?? "traversée"}, ${event.from.name} vers ${event.to.name}`}
                      className="absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-primary"
                    />
                    <span className="pointer-events-none relative flex w-12 shrink-0 flex-col tabular-nums">
                      <b>{parts.time}</b>
                      <small className="text-[10px] text-muted-foreground">{parts.shortDate}</small>
                    </span>
                    <span className="pointer-events-none relative shrink-0">
                      <CompanyBadge
                        name={event.company?.name ?? "Compagnie à confirmer"}
                        logoUrl={event.company?.logo_url ?? null}
                        size={28}
                      />
                    </span>
                    <div className="pointer-events-none relative min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate font-semibold">
                        {event.kind === "arrival" ? (
                          <ArrowDownLeft className="size-3.5 shrink-0 text-primary" aria-hidden />
                        ) : (
                          <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                        {event.kind === "arrival"
                          ? `Arrivée de ${event.from.name}`
                          : `Départ vers ${event.to.name}`}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {[event.vessel?.name, event.company?.name].filter(Boolean).join(" · ")}{" "}
                        <VesselAlertTag vesselId={event.vessel?.id} />
                      </span>
                      <SeaChip
                        departureId={event.departure.id}
                        from={event.from}
                        to={event.to}
                        departureAt={event.departure.departure_at}
                        arrivalAt={event.times.arrival.iso}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ));
        })()}
        {!events.length && (
          <p className="py-2 text-xs text-muted-foreground">
            {error
              ? tr("ui.homeTraffic.lesHorairesSontMomentanementIndisponibles")
              : tr("ui.homeTraffic.aucunMouvementPublieAVenir")}
          </p>
        )}
        {events.length > 6 && (
          <a
            href="/horaires"
            className="mt-2 flex min-h-10 w-full items-center justify-center text-xs font-semibold text-primary"
          >
            {tr("ui.homeTraffic.voirTousLesDepartsEt")}
          </a>
        )}
      </section>
    </div>
  );
}
