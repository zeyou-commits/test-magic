import { useQuery } from "@tanstack/react-query";
import { CarFront, ExternalLink, Ship, Users } from "lucide-react";
import { TrackingTimes } from "./TrackingTimes";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "./CountryFlag";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration } from "@/lib/ferry/format";
import type { Selection, Vessel } from "@/lib/ferry/types";
import { BookingLink, DemoBadge, EmptyNote, PanelHeader, ReliabilityNote, Section } from "./shared";
import { portTimeZone, wallTimeInZone, zoneLabel } from "@/lib/ferry/time";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import { useFleet } from "@/lib/ferry/useFleet";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { courseLabel, detectRotationDelay, formatAge, formatDelay, physicalStatus, haversineKm } from "@/lib/ferry/tracking";
import { getBoardingMilestones } from "@/lib/ferry/boarding";
import { ReportButton } from "./ReportButton";
import { CompanyBadge } from "./CompanyBadge";

export function CompanyView({
  companyId,
  onSelect,
}: {
  companyId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);

  const company = companies.find((item) => item.id === companyId);
  if (!company) return <EmptyNote>Compagnie introuvable.</EmptyNote>;

  const fleet = vessels.filter((vessel) => vessel.company_id === companyId);
  const lines = routes.filter((route) => route.company_ids.includes(companyId));
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";

  return (
    <div>
      <PanelHeader
        overline="Compagnie"
        title={company.name}
        subtitle={company.is_demo ? <DemoBadge /> : undefined}
      />
      <div className="px-4 pt-4 md:px-6">
        <BookingLink company={company} />
      </div>
      <div>
        {company.description ? (
          <Section title="Présentation">
            <p className="text-sm leading-relaxed">{company.description}</p>
          </Section>
        ) : null}
        <Section title={`Lignes desservies (${lines.length})`}>
          {lines.length === 0 ? (
            <EmptyNote>Aucune ligne enregistrée.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {lines.map((route) => (
                <li key={route.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "route", id: route.id })}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-secondary"
                  >
                    <span className="text-sm">
                      {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {formatDuration(route.typical_duration_minutes)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={`Flotte (${fleet.length})`}>
          {fleet.length === 0 ? (
            <EmptyNote>Aucun navire enregistré.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {fleet.map((vessel) => (
                <li key={vessel.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "vessel", id: vessel.id })}
                    className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
                  >
                    {vessel.name}
                    {vessel.vessel_type ? (
                      <span className="text-muted-foreground"> · {vessel.vessel_type}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

export function VesselView({
  vesselId,
  onSelect,
}: {
  vesselId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: fleetDepartures = [] } = useQuery(fleetDeparturesQuery);
  const fleet = useFleet();
  const liveShips = useLiveShips();

  const vessel = vessels.find((item) => item.id === vesselId);
  const photoQuery = useQuery({
    ...vesselPhotoQuery(vessel ?? { id: "", name: "", photo_url: null }),
    enabled: Boolean(vessel),
  });
  if (!vessel) return <EmptyNote>Navire introuvable.</EmptyNote>;

  const company = companies.find((item) => item.id === vessel.company_id);
  const portById = new Map(ports.map((port) => [port.id, port]));
  const portName = (id: string | undefined) => (id ? (portById.get(id)?.name ?? "—") : "—");
  const allDepartures = [
    ...new Map([...fleetDepartures, ...upcoming].map((item) => [item.id, item])).values(),
  ];
  const now = Date.now();
  const nextDepartures = allDepartures
    .filter((departure) => departure.vessel_id === vesselId && departure.status !== "cancelled")
    .filter((departure) => Date.parse(departure.departure_at) >= now - 3600_000)
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at))
    .slice(0, 6);
  const ship = fleet.find((item) => item.vesselId === vesselId);
  const live = liveShips.find((item) => item.vessel.id === vesselId);
  const shipDeparture = live?.departure ?? (ship
    ? allDepartures.find((item) => item.id === ship.departureId)
    : nextDepartures[0]);
  const shipRoute = shipDeparture ? routes.find((item) => item.id === shipDeparture.route_id) : undefined;
  const from = shipRoute ? portById.get(shipRoute.departure_port_id) : undefined;
  const to = shipRoute ? portById.get(shipRoute.arrival_port_id) : undefined;
  const photo = photoQuery.data;
  const physical = live && from && to
    ? physicalStatus(live.position, from, to, shipDeparture?.departure_at ?? null, now, ports)
    : null;
  const statusTone = physical?.tone === "success"
    ? "bg-success/10 text-success"
    : physical?.tone === "warning"
      ? "bg-warning/10 text-warning"
      : physical?.tone === "info"
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground";
  const liveIsRecent = Boolean(live && live.ageMinutes <= 30);
  const isAtSea = Boolean((liveIsRecent && (live?.position.speedKnots ?? 0) > 3) || ship?.state === "sea");
  const departureZone = portTimeZone(from);
  const arrivalZone = portTimeZone(to);
  const departureIso = shipDeparture?.departure_at;
  const milestones = departureIso && from
    ? getBoardingMilestones(departureIso, from, { hasVehicle: true })
    : null;
  const minutesToDeparture = departureIso ? (Date.parse(departureIso) - now) / 60_000 : Infinity;
  const minutesToHle = milestones ? (milestones.lastBoardingTime.getTime() - now) / 60_000 : Infinity;
  const isPreparing = Boolean(!isAtSea && milestones && minutesToDeparture >= 0 && minutesToDeparture <= 4 * 60);
  const isBoarding = isPreparing && minutesToHle > 0 && minutesToDeparture <= 3 * 60;
  const isBoardingClosed = isPreparing && minutesToHle <= 0;
  const totalKm = from && to
    ? haversineKm([from.longitude, from.latitude], [to.longitude, to.latitude]) : null;
  const remainingKm = live?.remainingKm != null ? Math.round(live.remainingKm) : null;
  const scheduleProgress = shipDeparture ? (() => {
    const start = Date.parse(shipDeparture.departure_at);
    const end = shipDeparture.arrival_at ? Date.parse(shipDeparture.arrival_at) : start + (shipDeparture.duration_minutes ?? 1440) * 60_000;
    return Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  })() : 0;
  const progress = totalKm && live?.remainingKm != null
    ? Math.min(1, Math.max(0, 1 - live.remainingKm / totalKm)) : scheduleProgress;
  const elapsedKm = totalKm && live?.remainingKm != null ? Math.round(Math.max(0, totalKm - live.remainingKm)) : null;
  const previousDeparture = shipDeparture && from
    ? allDepartures
        .filter((item) => item.vessel_id === vesselId && item.id !== shipDeparture.id && item.status !== "cancelled")
        .filter((item) => {
          const previousRoute = routes.find((route) => route.id === item.route_id);
          return previousRoute?.arrival_port_id === from.id &&
            item.arrival_at !== null &&
            Date.parse(item.arrival_at) <= Date.parse(shipDeparture.departure_at);
        })
        .sort((a, b) => Date.parse(b.arrival_at ?? b.departure_at) - Date.parse(a.arrival_at ?? a.departure_at))[0]
    : undefined;
  const rotationAlert = shipDeparture && from && live && liveIsRecent
    ? detectRotationDelay({
        departureIso: shipDeparture.departure_at,
        previousArrivalIso: previousDeparture?.arrival_at ?? null,
        position: live.position,
        departurePort: from,
        now,
        timeZone: departureZone,
      })
    : null;
  const currentPort = ship?.portId ? portById.get(ship.portId) : from;

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-2 md:px-6">
        <div className="group relative grid size-13 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted shadow-sm sm:size-14">
          {photo ? (
            <>
              <img src={photo.url} alt={`Photo du navire ${vessel.name}`} loading="lazy" decoding="async" width={144} height={144} referrerPolicy="no-referrer" className="size-full object-cover" />
              {photo.source === "commons" ? (
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-black/60 p-1 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <p className="line-clamp-2 text-center text-[9px] leading-tight text-white">
                    {photo.credit ? `${photo.credit} · ` : ""}{photo.license || "CC"}
                    {photo.pageUrl ? (
                      <> · <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer" className="pointer-events-auto underline hover:text-primary-foreground">Wikimedia</a></>
                    ) : null}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <Ship className="size-8 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate font-display text-base font-bold leading-tight text-foreground">{vessel.name}</h1>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone}`}>
              {isAtSea ? "🟢 En mer" : isBoardingClosed ? "🟠 Accès fermé" : isBoarding ? "🔵 Embarquement" : "⚓ À quai"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {company ? (
              <button type="button" onClick={() => onSelect({ type: "company", id: company.id })} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline">
                <CompanyBadge name={company.name} logoUrl={company.logo_url} size={18} />
                <span className="max-w-[120px] truncate">{company.name}</span>
              </button>
            ) : null}
            {vessel.passenger_capacity ? (
              <span className="inline-flex items-center gap-1" title="Capacité passagers">
                <Users className="size-3.5" aria-label="Passagers" />
                {vessel.passenger_capacity.toLocaleString("fr-FR")}
              </span>
            ) : null}
            {vessel.car_capacity != null ? (
              <span className="inline-flex items-center gap-1" title="Capacité véhicules légers">
                <CarFront className="size-3.5" aria-label="Véhicules légers" />
                {vessel.car_capacity.toLocaleString("fr-FR")}
              </span>
            ) : null}
            {vessel.is_demo ? <DemoBadge /> : null}
          </div>
        </div>
      </div>
      <div className="px-4 pt-3 md:px-6">
        <section className="rounded-2xl border border-border bg-card p-3.5 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${statusTone}`}>
              {isAtSea ? (
                <><span className="relative flex size-2" aria-hidden><span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" /><span className="relative size-2 rounded-full bg-success" /></span>{physical?.code === "approaching" ? "En approche finale" : "En mer (croisière)"}</>
              ) : isBoardingClosed ? "🟠 Moteurs allumés · accès fermé" : isBoarding ? "🔵 Embarquement en cours" : currentPort ? `⚓ À quai · ${currentPort.name}` : "État du navire à confirmer"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {liveIsRecent ? `📡 GPS direct · ${formatAge(live?.ageMinutes ?? 0)}` : live ? `AIS ancien · ${formatAge(live.ageMinutes)}` : "Selon programme · non confirmé"}
            </span>
          </div>

          {isAtSea && from && to ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-full bg-success" aria-hidden /><span className="truncate">{from.name}</span><CountryFlag code={from.country_code} /></div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="flex items-center justify-end gap-1.5"><span className="truncate">{to.name}</span><CountryFlag code={to.country_code} /><span className="size-2 shrink-0 rounded-full border border-border" aria-hidden /></div>
                </div>
              </div>
              <div className="relative mt-3 mb-2 pt-8 px-1">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-success via-primary/80 to-primary transition-all duration-500" style={{ width: `${Math.min(100, Math.max(3, Math.round(progress * 100)))}%` }} />
                </div>
                <div className="absolute top-7 left-0 size-4 rounded-full border-2 border-background bg-success shadow-xs" title={live?.position.atdAt ? "Départ constaté AIS" : "Départ selon programme · non confirmé"} />
                <div className="absolute top-1 -translate-x-1/2 motion-safe:transition-all motion-safe:duration-500" style={{ left: `calc(50px + (100% - 100px) * ${progress})` }}>
                  <div className="flex flex-col items-center">
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/20 bg-card px-1.5 py-0.5 text-[9px] font-bold text-primary shadow-xs">{live?.position.speedKnots != null ? `${live.position.speedKnots.toFixed(1)} nds · ` : ""}{Math.round(progress * 100)} %</span>
                    <div className="grid size-5.5 place-items-center rounded-full bg-primary text-primary-foreground shadow"><Ship className="size-3 text-primary-foreground" aria-hidden /></div>
                  </div>
                </div>
                <div className="absolute top-7 right-0 size-4 rounded-full border-2 border-background bg-border" title="Arrivée prévue" />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] font-medium text-muted-foreground">
                  <span className="shrink-0">{elapsedKm != null ? `≈ ${elapsedKm} km progressés` : "En mer"}</span>
                  {live?.position.courseDeg != null ? <span className="truncate text-center">Cap {Math.round(live.position.courseDeg)}° {courseLabel(live.position.courseDeg)}</span> : null}
                  <span className="shrink-0 text-right">{remainingKm != null ? `≈ ${remainingKm} km restants` : "—"}</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">{live ? "Progression géographique · distances en ligne droite" : "Progression selon programme · non confirmée"}</p>
              {shipDeparture ? <TrackingTimes departure={shipDeparture} live={live} fromZone={departureZone} toZone={arrivalZone} /> : null}
            </>
          ) : isPreparing && milestones ? (
            <>
              <p className="mt-2 text-sm font-semibold">{currentPort?.name ?? from?.name ?? "Port de départ"}</p>
              <div className="mt-3 rounded-xl bg-muted/50 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Horaires d’embarquement · {zoneLabel(departureZone)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Convocation véhicule · H−4</p><p className="text-sm font-bold tabular-nums">{getBoardingMilestones(departureIso ?? "", from, { hasVehicle: true })?.callLabel ?? "—"}</p></div>
                  <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Convocation piéton · H−3</p><p className="text-sm font-bold tabular-nums">{getBoardingMilestones(departureIso ?? "", from, { hasVehicle: false })?.callLabel ?? "—"}</p></div>
                  <div className="rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Début embarquement · H−3</p><p className="text-sm font-bold tabular-nums">{milestones.boardingLabel}</p></div>
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-2"><p className="text-[10px] text-muted-foreground">Heure limite (HLE) · H−1</p><p className="text-sm font-bold tabular-nums">{milestones.lastBoardingLabel}</p></div>
                  <div className="col-span-2 rounded-lg border border-border bg-card p-2"><p className="text-[10px] text-muted-foreground">Départ programmé · H</p><p className="text-sm font-bold tabular-nums">{milestones.departureLabel}</p></div>
                </div>
              </div>
              <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ${isBoardingClosed ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
                {isBoardingClosed ? "Portes fermées — présentez-vous au personnel portuaire." : `Accès quai fermé dans ${Math.max(0, Math.round(minutesToHle))} min`}
              </p>
              {rotationAlert ? <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"><p className="font-semibold text-warning">{rotationAlert.message}</p><p className="mt-1 text-foreground">{rotationAlert.legalWarning}</p></div> : null}
              <p className="mt-2 text-[10px] text-muted-foreground">Convocation recommandée : {milestones.callLabel} ({portTimeZone(from)}) · conservez l'heure officielle de votre billet.</p>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm font-semibold">⚓ À quai au port de {currentPort?.name ?? from?.name ?? "—"}</p>
              {shipDeparture && milestones ? <div className="mt-2 rounded-xl bg-muted/50 p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prochain départ · {zoneLabel(departureZone)}</p><div className="grid grid-cols-2 gap-2 text-xs"><p>Convocation véhicule H−4<strong className="block text-sm">{getBoardingMilestones(departureIso ?? "", from, { hasVehicle: true })?.callLabel}</strong></p><p>Convocation piéton H−3<strong className="block text-sm">{getBoardingMilestones(departureIso ?? "", from, { hasVehicle: false })?.callLabel}</strong></p><p>Début embarquement H−3<strong className="block text-sm">{milestones.boardingLabel}</strong></p><p>HLE H−1<strong className="block text-sm">{milestones.lastBoardingLabel}</strong></p><p className="col-span-2">Départ H<strong className="text-sm">{milestones.departureLabel}</strong></p></div><p className="mt-2 text-[10px] text-muted-foreground">Horaires indicatifs : l’heure de convocation figurant sur votre billet prévaut.</p></div> : <p className="mt-1 text-xs text-muted-foreground">Aucun départ identifié pour ce navire.</p>}
              {rotationAlert ? <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"><p className="font-semibold text-warning">{rotationAlert.message}</p><p className="mt-1 text-foreground">{rotationAlert.legalWarning}</p></div> : null}
            </>
          )}
          {!isAtSea && shipDeparture ? <TrackingTimes departure={shipDeparture} live={live} fromZone={departureZone} toZone={arrivalZone} /> : null}
          {live && !liveIsRecent ? <p className="mt-2 text-[10px] text-muted-foreground">Dernier signal AIS {formatAge(live.ageMinutes)} : il peut ne plus représenter la position actuelle.</p> : null}
          <VesselSpecs vessel={vessel} />
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("batogo:focus-vessel", { detail: { vesselId } }))} className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15">🎯 Voir sur la carte</button>
          <div className="mt-3 flex items-center justify-between gap-2">
            {shipDeparture ? (
              <button type="button" onClick={() => onSelect({ type: "departure", id: shipDeparture.id })} className="inline-flex h-8 items-center justify-center rounded-xl border border-border px-3 text-xs font-semibold transition-colors hover:bg-secondary">Voir la traversée complète</button>
            ) : <div />}
            {vessel.imo || vessel.mmsi ? (
              <a href={vessel.imo ? `https://www.vesselfinder.com/?imo=${vessel.imo}` : `https://www.vesselfinder.com/?mmsi=${vessel.mmsi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary">
                IMO/VesselFinder <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
        </section>
      </div>

      <Section title="Prochains départs">
        {nextDepartures.length === 0 ? (
          <EmptyNote>Aucun départ connu à venir pour ce navire.</EmptyNote>
        ) : (
          <ul className="space-y-1">
            {nextDepartures.map((departure) => {
              const route = routes.find((item) => item.id === departure.route_id);
              return (
                <li key={departure.id}>
                  <button type="button" onClick={() => onSelect({ type: "departure", id: departure.id })} className="w-full rounded-md px-2 py-2 text-left hover:bg-secondary">
                    <p className="text-sm font-medium">{formatDateTime(departure.departure_at, portTimeZone(portById.get(route?.departure_port_id ?? "")))}</p>
                    <p className="text-xs text-muted-foreground">{route ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}` : "—"}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {vessel.description ? <Section title="À bord"><p className="text-sm leading-relaxed">{vessel.description}</p></Section> : null}
    </div>
  );
}

export function DepartureView({
  departureId,
  onSelect,
}: {
  departureId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);

  const liveShips = useLiveShips();
  const { data: fleetDepartures = [] } = useQuery(fleetDeparturesQuery);
  const departure = [...departures, ...fleetDepartures].find((item) => item.id === departureId);
  if (!departure) return <EmptyNote>Départ introuvable.</EmptyNote>;
  const live = liveShips.find((ship) => ship.departure.id === departureId);
  const route = routes.find((item) => item.id === departure.route_id);
  const company = companies.find((item) => item.id === departure.company_id);
  const vessel = vessels.find((item) => item.id === departure.vessel_id);
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const fromZone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
  const toZone = portTimeZone(ports.find((port) => port.id === route?.arrival_port_id));

  return (
    <div>
      <PanelHeader
        overline="Départ"
        title={
          route
            ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
            : "Traversée"
        }
        subtitle={`${formatDateTime(departure.departure_at, fromZone)} (${zoneLabel(fromZone)})`}
        actions={<ReportButton targetType="departure" targetId={departure.id} />}
      />
      {departure.status !== "cancelled" ? (
        <div className="px-4 pt-4 md:px-6">
          <BookingLink company={company} />
        </div>
      ) : null}
      <div>
        {live ? (
          <Section title="Où est mon bateau ?">
            <div
              className={`rounded-2xl p-4 ${live.phase === "sea" ? "bg-success/10" : "bg-secondary"}`}
            >
              <div className="flex items-center gap-2 text-sm font-bold">
                <span className="relative flex size-2.5" aria-hidden>
                  {live.phase === "sea" ? (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
                  ) : null}
                  <span
                    className={`relative inline-flex size-2.5 rounded-full ${live.phase === "sea" ? "bg-success" : "bg-muted-foreground"}`}
                  />
                </span>
                {live.phase === "sea" ? "En mer" : "Au port, départ proche"}
              </div>
              <TrackingTimes departure={departure} live={live} fromZone={fromZone} toZone={toZone} />
              <dl className="mt-3 grid gap-1.5 text-sm">
                <Row
                  label="Vitesse"
                  value={
                    live.position.speedKnots !== null
                      ? `${live.position.speedKnots.toFixed(1)} nœuds`
                      : "—"
                  }
                />
                <Row
                  label="Cap"
                  value={
                    live.position.courseDeg !== null
                      ? `${Math.round(live.position.courseDeg)}° (${courseLabel(live.position.courseDeg)})`
                      : "—"
                  }
                />
                {live.phase === "sea" && live.remainingKm !== null ? (
                  <Row
                    label="Distance restante"
                    value={`environ ${Math.round(live.remainingKm)} km`}
                  />
                ) : null}
                <Row label="Dernière position" value={formatAge(live.ageMinutes)} />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Les tentatives de réception AIS ont lieu toutes les 5 minutes ; l’heure d’arrivée est une
                estimation en ligne droite, à vérifier auprès de la compagnie.
                {live.demo ? " (Données de démonstration.)" : ""}
              </p>
            </div>
          </Section>
        ) : null}
        <Section title="Détails">
          <dl className="grid gap-2 text-sm">
            <Row
              label="Départ programmé"
              value={`${formatDateTime(departure.departure_at, fromZone)} · ${zoneLabel(fromZone)}`}
            />
            <Row
              label="Arrivée prévue"
              value={
                departure.arrival_at
                  ? `${formatDateTime(departure.arrival_at, toZone)} · ${zoneLabel(toZone)}`
                  : "—"
              }
            />
            <Row label="Durée" value={formatDuration(departure.duration_minutes)} />
            <Row
              label="État"
              value={
                departure.status === "cancelled"
                  ? "Annulé"
                  : departure.status === "modified"
                    ? "Modifié"
                    : "Prévu"
              }
            />
          </dl>
          <div className="mt-3">
            <ReliabilityNote
              reliability={departure.reliability}
              sourceName={departure.source_name}
              sourceUrl={departure.source_url}
              verifiedAt={departure.last_verified_at}
            />
          </div>
        </Section>
        <Section title="Opérateur">
          <div className="grid gap-1">
            {company ? (
              <button
                type="button"
                onClick={() => onSelect({ type: "company", id: company.id })}
                className="rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
              >
                Compagnie · {company.name}
              </button>
            ) : null}
            {vessel ? (
              <button
                type="button"
                onClick={() => onSelect({ type: "vessel", id: vessel.id })}
                className="rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
              >
                Navire · {vessel.name}
              </button>
            ) : null}
            {route ? (
              <button
                type="button"
                onClick={() => onSelect({ type: "route", id: route.id })}
                className="rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
              >
                Voir la ligne
              </button>
            ) : null}
          </div>
        </Section>
        {departure.notes ? (
          <Section title="Remarques">
            <p className="text-sm leading-relaxed">{departure.notes}</p>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function VesselSpecs({ vessel }: { vessel: Vessel }) {
  const n = (v: number | null | undefined) => (v == null ? null : Number(v).toLocaleString("fr-FR"));
  const age = vessel.build_year ? new Date().getFullYear() - vessel.build_year : null;
  const items = [
    { icon: "⚓", label: "Mise en service", value: vessel.build_year ? `${vessel.build_year} · ${age} ans` : null },
    { icon: "📐", label: "Longueur", value: vessel.length_meters ? `${n(vessel.length_meters)} m` : null },
    { icon: "👥", label: "Passagers", value: n(vessel.passenger_capacity) },
    { icon: "🚗", label: "Voitures", value: n(vessel.car_capacity) },
    { icon: "🚛", label: "Fret", value: vessel.freight_lane_meters ? `${n(vessel.freight_lane_meters)} ml` : null },
    { icon: "💨", label: "Vitesse", value: vessel.speed_knots ? `${n(vessel.speed_knots)} nœuds` : null },
  ].filter((i) => i.value);
  if (!items.length) return null;
  return (
    <section className="px-4 pt-4 md:px-6" aria-label="Caractéristiques techniques">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Caractéristiques
      </h2>
      <dl className="grid grid-cols-3 gap-2">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border bg-card px-2.5 py-2">
            <dt className="text-[10px] text-muted-foreground">
              <span aria-hidden>{i.icon}</span> {i.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold">{i.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
