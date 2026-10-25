import { matchesTraffic } from "@/lib/ferry/filterSync";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ship, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { MiniFerry } from "./MiniFerry";
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
import { crossingProgress } from "@/lib/ferry/crossingProgress";
import { trackingTimes } from "@/lib/ferry/tracking";
import { formatDateParts } from "@/lib/ferry/format";
import { portTimeZone, dateKeyInZone } from "@/lib/ferry/time";
import { emptyFilters, type Filters, type Selection } from "@/lib/ferry/types";
import { CompanyBadge } from "./CompanyBadge";
import { FollowButton } from "./FollowButton";
import type { MapPreview } from "@/lib/ferry/mapPresentation";

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
  const [expanded, setExpanded] = useState(false);
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
  const sailing = crossings.filter((c) =>
    fleet.some((s) => s.state === "sea" && s.departureId === c.departure.id),
  );
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
      <section aria-label="Traversées en navigation">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
          <Ship size={16} aria-hidden /> En navigation{" "}
          <span className="text-xs font-normal text-muted-foreground">{sailing.length || ""}</span>
        </h2>
        {sailing.length ? (
          sailing.map((c) => {
            const progress = crossingProgress(c.departure, c.from, c.to, c.live);
            const percent = progress.ratio === null ? null : Math.round(progress.ratio * 100);
            const preview = {
              routeId: c.departure.route_id,
              ...(c.vessel ? { vesselId: c.vessel.id } : {}),
            };
            const target: Selection = c.vessel
              ? { type: "vessel", id: c.vessel.id }
              : { type: "departure", id: c.departure.id };
            const time = (iso: string | null, port: typeof c.from) =>
              iso ? formatDateParts(iso, portTimeZone(port)).time : "À confirmer";
            const startDay = c.times.departure.iso
              ? dateKeyInZone(c.times.departure.iso, portTimeZone(c.from))
              : "";
            const endDay = c.times.arrival.iso
              ? dateKeyInZone(c.times.arrival.iso, portTimeZone(c.to))
              : "";
            const dayDelta =
              startDay && endDay
                ? Math.round((Date.parse(endDay) - Date.parse(startDay)) / 86_400_000)
                : 0;
            return (
              <article
                key={c.departure.id}
                className="bw-compact-crossing !py-2"
                {...previewEvents(preview)}
              >
                <button
                  type="button"
                  className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onClick={() => onSelect(target)}
                  aria-label={`Ouvrir la fiche ${c.vessel?.name ?? "de la traversée"}, ${c.from.name} vers ${c.to.name}`}
                />
                <div className="pointer-events-none relative z-[1]">
                  <div className="mb-1 flex min-w-0 items-center gap-2">
                    <CompanyBadge
                      name={c.company?.name ?? "Compagnie à confirmer"}
                      logoUrl={c.company?.logo_url ?? null}
                      size={25}
                    />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-xs">
                        {c.company?.name ?? "Compagnie à confirmer"}
                      </strong>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {c.vessel?.name ?? "Bateau à confirmer"}
                      </span>
                    </div>
                    {c.vessel && (
                      <span className="pointer-events-auto">
                        <FollowButton
                          kind="vessel"
                          targetId={c.vessel.id}
                          label={c.vessel.name}
                          compact
                          demo={c.vessel.is_demo}
                        />
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between gap-3 text-sm font-bold">
                    {[c.from, c.to].map((port) => (
                      <button
                        key={port.id}
                        type="button"
                        onClick={() => onSelect({ type: "port", id: port.id })}
                        onPointerEnter={(e) => {
                          if (e.pointerType === "mouse") onPreview?.({ portId: port.id });
                        }}
                        onPointerLeave={(e) => {
                          if (e.pointerType === "mouse") onPreview?.(preview);
                        }}
                        onFocus={() => onPreview?.({ portId: port.id })}
                        className="pointer-events-auto truncate rounded-md leading-tight underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {port.name}
                      </button>
                    ))}
                  </div>
                  <div
                    className="bw-compact-track"
                    role="progressbar"
                    aria-label="Avancement de la traversée"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    {...(percent === null ? {} : { "aria-valuenow": percent })}
                  >
                    <span style={{ width: `${percent ?? 0}%` }} />
                    <i style={{ left: `${Math.max(8, Math.min(92, percent ?? 0))}%` }}>
                      <MiniFerry size={58} />
                      <b>{percent === null ? "—" : `${percent} %`}</b>
                    </i>
                  </div>
                  <div className="flex justify-between text-[11px] tabular-nums">
                    <span>
                      Départ <b>{time(c.times.departure.iso, c.from)}</b>
                    </span>
                    <span>
                      Arrivée <b>{time(c.times.arrival.iso, c.to)}</b>
                      {dayDelta > 0 && <sup className="ml-0.5 text-primary">+{dayDelta} j</sup>}
                    </span>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="text-xs text-muted-foreground">
            {isPending
              ? "Chargement des traversées…"
              : "Aucune traversée en navigation connue actuellement."}
          </p>
        )}
      </section>
      <section className="mt-4" aria-label="Prochains départs et arrivées">
        <h2 className="mb-2 text-sm font-bold">Départs & arrivées</h2>
        <div className="mb-2 flex rounded-xl bg-secondary p-1" aria-label="Filtrer les mouvements">
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
                setExpanded(false);
              }}
              className={`min-h-9 flex-1 rounded-lg text-xs font-semibold ${filter === value ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {events.slice(0, expanded ? 30 : 5).map((event) => {
          const parts = formatDateParts(event.iso!, portTimeZone(event.port));
          return (
            <div
              key={`${event.departure.id}:${event.kind}`}
              className="relative flex items-center gap-2 border-b py-2.5 text-xs"
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
              <span className="pointer-events-none relative flex w-14 shrink-0 flex-col tabular-nums">
                <b>{parts.time}</b>
                <small className="text-[10px] text-muted-foreground">{parts.shortDate}</small>
              </span>
              {event.kind === "arrival" ? (
                <ArrowDownLeft
                  className="pointer-events-none size-4 shrink-0 text-primary"
                  aria-hidden
                />
              ) : (
                <ArrowUpRight
                  className="pointer-events-none size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              <div className="pointer-events-none relative min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {event.kind === "arrival" ? "Arrivée" : "Départ"} ·{" "}
                  <button
                    type="button"
                    className="pointer-events-auto rounded underline-offset-2 hover:text-primary hover:underline"
                    onClick={() => onSelect({ type: "port", id: event.port.id })}
                    onPointerEnter={(e) => {
                      if (e.pointerType === "mouse") onPreview?.({ portId: event.port.id });
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType === "mouse")
                        onPreview?.({
                          routeId: event.departure.route_id,
                          ...(event.vessel ? { vesselId: event.vessel.id } : {}),
                        });
                    }}
                    onFocus={() => onPreview?.({ portId: event.port.id })}
                  >
                    {event.port.name}
                  </button>
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {event.from.name} → {event.to.name} · {event.vessel?.name ?? event.company?.name}
                </span>
              </div>
            </div>
          );
        })}
        {!events.length && (
          <p className="py-2 text-xs text-muted-foreground">
            {error
              ? "Les horaires sont momentanément indisponibles."
              : "Aucun mouvement publié à venir."}
          </p>
        )}
        {events.length > 5 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 min-h-10 w-full text-xs font-semibold text-primary"
          >
            Voir plus de mouvements
          </button>
        )}
      </section>
    </div>
  );
}
