import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Ship } from "lucide-react";
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
  const shipDeparture = ship
    ? allDepartures.find((item) => item.id === ship.departureId)
    : nextDepartures[0];
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
  const progress = shipDeparture
    ? (() => {
        const start = Date.parse(shipDeparture.departure_at);
        const end = shipDeparture.arrival_at
          ? Date.parse(shipDeparture.arrival_at)
          : start + (shipDeparture.duration_minutes ?? 1440) * 60_000;
        return Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
      })()
    : 0;
  const totalDistanceKm = from && to
    ? haversineKm([from.longitude, from.latitude], [to.longitude, to.latitude])
    : shipRoute?.distance_km ?? null;
  const remainingKm = live?.remainingKm ?? (live && to
    ? haversineKm([live.position.longitude, live.position.latitude], [to.longitude, to.latitude])
    : null);
  const travelledKm = totalDistanceKm != null && remainingKm != null
    ? Math.max(0, totalDistanceKm - remainingKm)
    : totalDistanceKm != null ? totalDistanceKm * progress : null;
  const formatKm = (km: number | null) => km == null || !Number.isFinite(km) ? "—" : Math.round(km).toLocaleString("fr-FR");
  const actualDepartureIso = live?.position.atdAt ?? null;
  const scheduledArrivalIso = shipDeparture?.arrival_at ?? null;
  const actualEtaIso = liveIsRecent && live?.etaIso ? live.etaIso : null;
  const departureDeltaMinutes = actualDepartureIso && departureIso
    ? Math.round((Date.parse(actualDepartureIso) - Date.parse(departureIso)) / 60_000)
    : null;
  const arrivalDeltaMinutes = actualEtaIso && scheduledArrivalIso
    ? Math.round((Date.parse(actualEtaIso) - Date.parse(scheduledArrivalIso)) / 60_000)
    : null;
  const formatOffset = (minutes: number) => {
    const abs = Math.abs(minutes);
    if (abs < 1) return "0 min";
    if (abs >= 60) return `${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, "0")}`;
    return `${abs} min`;
  };
  const previousDeparture = shipDeparture && from
    ? allDepartures
        .filter((item) => item.vessel_id === vesselId && item.id !== shipDeparture.id && item.status !== "cancelled")
        .filter((item) => {
          const previousRoute = routes.find((route) => route.id === item.route_id);
          return previousRoute?.arrival_port_id === from.id &&
            Boolean(item.arrival_at) &&
            Date.parse(item.arrival_at!) <= Date.parse(shipDeparture.departure_at);
        })
        .sort((a, b) => Date.parse(b.arrival_at ?? b.departure_at) - Date.parse(a.arrival_at ?? a.departure_at))[0]
    : undefined;
  const rotationAlert = shipDeparture && from && live
    ? detectRotationDelay({
        departureIso: shipDeparture.departure_at,
        previousArrivalIso: previousDeparture?.arrival_at ?? null,
        position: live.position,
        departurePort: from,
        now,
        timeZone: departureZone,
      })
    : null;
    const relative = (iso?: string | null) => {
    if (!iso) return "";
    const minutes = Math.round((now - Date.parse(iso)) / 60_000);
    if (minutes < 0) return "à venir";
    if (minutes < 60) return `il y a ${minutes} min`;
    return `il y a ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
  };
  const etaIso = liveIsRecent && live?.etaIso ? live.etaIso : shipDeparture?.arrival_at;
  const timeUntil = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
    if (mins < 60) return `dans ${mins} min`;
    return `dans ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
  };
  const arrivalDateLabel = (iso: string, timeZone: string) => {
    const date = new Date(iso);
    const today = new Date(now).toLocaleDateString("fr-FR", { timeZone });
    const tomorrow = new Date(now + 86_400_000).toLocaleDateString("fr-FR", { timeZone });
    const arrivalDay = date.toLocaleDateString("fr-FR", { timeZone });
    const dayLabel = arrivalDay === today ? "Aujourd’hui" : arrivalDay === tomorrow ? "Demain" : date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone });
    return `${dayLabel} à ${wallTimeInZone(iso, timeZone)}`;
  };
  const currentPort = ship?.portId ? portById.get(ship.portId) : from;

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-2 md:px-6">
        <div className="relative grid size-13 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted shadow-sm sm:size-14">
          {photo ? (
            <img src={photo.url} alt={`Photo du navire ${vessel.name}`} loading="lazy" decoding="async" width={144} height={144} referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <Ship className="size-8 text-muted-foreground" aria-hidden />
          )}
          {photo?.source === "commons" ? (
            <details className="group absolute bottom-0.5 right-0.5">
              <summary aria-label="Crédit et licence de la photo" title="Crédit photo" className="grid size-5 cursor-pointer list-none place-items-center rounded-full bg-black/60 text-[11px] font-bold text-white shadow-sm [&::-webkit-details-marker]:hidden">ⓘ</summary>
              <div className="absolute bottom-6 right-0 z-30 hidden w-52 rounded-lg border border-border bg-popover p-2.5 text-left text-[11px] font-normal leading-snug text-popover-foreground shadow-xl group-hover:block group-open:block">
                <p className="font-semibold">Photo indicative</p>
                {photo.credit ? <p className="mt-1">{photo.credit}</p> : null}
                {photo.license ? <p className="mt-0.5">{photo.license}</p> : null}
                {photo.pageUrl ? <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline">Wikimedia Commons <ExternalLink className="size-3" aria-hidden /></a> : <span>Wikimedia Commons</span>}
              </div>
            </details>
          ) : null}
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
            {vessel.length_meters ? <span>{vessel.length_meters} m</span> : null}
            {vessel.passenger_capacity ? <span>{vessel.passenger_capacity.toLocaleString("fr-FR")} passagers</span> : null}
            {vessel.imo || vessel.mmsi ? (
              <a href={vessel.imo ? `https://www.vesselfinder.com/?imo=${vessel.imo}` : `https://www.vesselfinder.com/?mmsi=${vessel.mmsi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary hover:underline">
                IMO/VesselFinder <ExternalLink className="size-3" aria-hidden />
              </a>
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
              {liveIsRecent ? `📡 GPS direct · ${formatAge(live!.ageMinutes)}` : "⏱️ Estimé (programme)"}
            </span>
          </div>

          {isAtSea && from && to ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-full bg-success" aria-hidden /><span className="truncate">{from.name}</span><CountryFlag code={from.country_code} /></div>
                  <p className="mt-1 pl-3.5 text-[10px] font-medium text-muted-foreground">{formatKm(travelledKm)} km parcourus</p>
                </div>
                <div className="min-w-0 text-right">
                  <div className="flex items-center justify-end gap-1.5"><span className="truncate">{to.name}</span><CountryFlag code={to.country_code} /><span className="size-2 shrink-0 rounded-full border border-border" aria-hidden /></div>
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">{formatKm(remainingKm)} km restants</p>
                </div>
              </div>
              <div className="relative mx-2 mt-7 h-3" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement estimé de la traversée">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-success to-primary transition-[width]" style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
                </div>
                <div className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-[left]" style={{ left: `${Math.max(2, Math.min(98, progress * 100))}%` }}>
                  <div className="absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-1.5 py-0.5 text-[9px] font-semibold text-foreground shadow-sm">
                    {live?.position.speedKnots != null ? `${live.position.speedKnots.toFixed(1)} nds · ` : ""}{Math.round(progress * 100)} %
                  </div>
                  <Ship className="size-5 -rotate-0 fill-primary/15 text-primary drop-shadow-sm" aria-label="Position du navire" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="min-w-0 rounded-lg bg-success/10 px-2 py-1.5">
                  <p className="text-[10px] font-medium text-success">✓ Départ · {actualDepartureIso ? relative(actualDepartureIso) : "horaire prévu"}</p>
                  <p className="truncate text-sm font-bold text-foreground">{actualDepartureIso ? wallTimeInZone(actualDepartureIso, departureZone) : departureIso ? wallTimeInZone(departureIso, departureZone) : "—"}</p>
                  {actualDepartureIso && departureIso && departureDeltaMinutes !== 0 ? <p className="truncate text-[10px] text-muted-foreground"><span className="line-through">Prévu {wallTimeInZone(departureIso, departureZone)}</span></p> : null}
                  <p className="text-[10px] font-semibold text-success">{actualDepartureIso && departureDeltaMinutes != null && departureDeltaMinutes !== 0 ? `Parti avec ${formatOffset(departureDeltaMinutes)} ${departureDeltaMinutes > 0 ? "de retard" : "d’avance"}` : "Selon programme"}</p>
                </div>
                <div className="min-w-0 rounded-lg bg-primary/10 px-2 py-1.5 text-right">
                  <p className="text-[10px] font-medium text-primary">⚑ Arrivée {etaIso ? timeUntil(etaIso) : "à confirmer"}</p>
                  <p className="truncate text-sm font-bold text-foreground">{etaIso ? arrivalDateLabel(etaIso, arrivalZone) : "À confirmer"}</p>
                  {actualEtaIso && scheduledArrivalIso && arrivalDeltaMinutes !== 0 ? <p className="truncate text-[10px] text-muted-foreground"><span className="line-through">Prévu {wallTimeInZone(scheduledArrivalIso, arrivalZone)}</span></p> : null}
                  <p className={`truncate text-[10px] font-semibold ${arrivalDeltaMinutes != null && arrivalDeltaMinutes > 0 ? "text-warning" : arrivalDeltaMinutes != null && arrivalDeltaMinutes < 0 ? "text-success" : "text-muted-foreground"}`}>
                    {arrivalDeltaMinutes != null && Math.abs(arrivalDeltaMinutes) >= 1
                      ? arrivalDeltaMinutes > 0 ? `🟠 Retard estimé de ${formatOffset(arrivalDeltaMinutes)}` : `🟢 En avance de ${formatOffset(arrivalDeltaMinutes)}`
                      : "Selon programme"}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                {live?.position.courseDeg != null ? <span className="rounded-full border border-border px-2 py-1">Cap {Math.round(live.position.courseDeg)}° {courseLabel(live.position.courseDeg)}</span> : null}
              </div>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("batogo:focus-vessel", { detail: { vesselId } }))} className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15">🎯 Voir sur la carte</button>
            </>
          ) : isPreparing && milestones ? (
            <>
              <p className="mt-2 text-sm font-semibold">{currentPort?.name ?? from?.name ?? "Port de départ"}</p>
              <div className="mt-3 grid grid-cols-3 items-start gap-1 text-center">
                <div><p className="text-[10px] text-muted-foreground">H−3h</p><p className="text-xs font-semibold">{milestones.boardingLabel}</p><p className="text-[10px] text-muted-foreground">Début</p></div>
                <div className="border-x border-border px-1"><p className="text-[10px] text-muted-foreground">H−1h · HLE</p><p className="text-xs font-semibold">{milestones.lastBoardingLabel}</p><p className="text-[10px] text-muted-foreground">Clôture</p></div>
                <div><p className="text-[10px] text-muted-foreground">H · Départ</p><p className="text-xs font-semibold">{milestones.departureLabel}</p><p className="text-[10px] text-muted-foreground">Appareillage</p></div>
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
              {shipDeparture && milestones ? <p className="mt-1 text-xs text-muted-foreground">Prochain voyage : {milestones.departureLabel} · convocation recommandée {milestones.callLabel} ({departureZone})</p> : <p className="mt-1 text-xs text-muted-foreground">Aucun départ imminent identifié pour ce navire.</p>}
              {rotationAlert ? <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"><p className="font-semibold text-warning">{rotationAlert.message}</p><p className="mt-1 text-foreground">{rotationAlert.legalWarning}</p></div> : null}
            </>
          )}
          {live && !liveIsRecent ? <p className="mt-2 text-[10px] text-muted-foreground">Dernier signal AIS {formatAge(live.ageMinutes)} : il peut ne plus représenter la position actuelle.</p> : null}
          {shipDeparture ? <button type="button" onClick={() => onSelect({ type: "departure", id: shipDeparture.id })} className="mt-3 inline-flex h-9 items-center justify-center rounded-xl border border-border px-3 text-xs font-semibold hover:bg-secondary">Voir la traversée complète</button> : null}
        </section>
      </div>

      <VesselSpecs vessel={vessel} />

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
              {live.phase === "sea" && live.etaIso ? (
                <>
                  <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                    Arrivée vers {wallTimeInZone(live.etaIso, toZone)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {zoneLabel(toZone)}
                    </span>
                  </p>
                  <p
                    className={`text-sm font-semibold ${formatDelay(live.delayMinutes).tone === "late" ? "text-destructive" : "text-success"}`}
                  >
                    {formatDelay(live.delayMinutes).label}
                  </p>
                </>
              ) : null}
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
                Position AIS actualisée toutes les 20 minutes environ ; l’heure d’arrivée est une
                estimation en ligne droite, à vérifier auprès de la compagnie.
                {live.demo ? " (Données de démonstration.)" : ""}
              </p>
            </div>
          </Section>
        ) : null}
        <Section title="Détails">
          <dl className="grid gap-2 text-sm">
            <Row
              label="Départ"
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
