import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Ship } from "lucide-react";
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
import { courseLabel, formatAge, formatDelay, physicalStatus } from "@/lib/ferry/tracking";
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
    : undefined;
  const shipRoute = shipDeparture
    ? routes.find((item) => item.id === shipDeparture.route_id)
    : undefined;
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

  let progress: number | null = null;
  if (ship?.state === "sea" && shipDeparture) {
    const start = Date.parse(shipDeparture.departure_at);
    const end = shipDeparture.arrival_at
      ? Date.parse(shipDeparture.arrival_at)
      : start + (shipDeparture.duration_minutes ?? 1440) * 60_000;
    progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  }

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
      {live ? (
        <Section title="Suivi en direct">
          <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${statusTone}`}>
                <span className="size-2 rounded-full bg-current" aria-hidden />
                {physical?.label ?? "Position AIS reçue"}
              </span>
              <span className="text-xs text-muted-foreground">
                Signal {formatAge(live.ageMinutes)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Vitesse</p>
                <p className="mt-1 font-semibold tabular-nums">{live.position.speedKnots != null ? `${live.position.speedKnots.toFixed(1)} nds` : "Indisponible"}</p>
              </div>
              <div className="min-w-0 rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Cap</p>
                <p className="mt-1 flex items-center gap-1.5 font-semibold tabular-nums">
                  {live.position.courseDeg != null ? <><span aria-hidden style={{ transform: `rotate(${live.position.courseDeg}deg)` }} className="inline-block">↑</span>{Math.round(live.position.courseDeg)}° ({courseLabel(live.position.courseDeg)})</> : "Indisponible"}
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              {from ? <p><span className="text-muted-foreground">Départ :</span> {from.name}</p> : null}
              {live.position.atdAt ? <p><span className="text-muted-foreground">Parti de {from?.name ?? "son port"} à :</span> {wallTimeInZone(live.position.atdAt, portTimeZone(from))}</p> : null}
              {to ? <p><span className="text-muted-foreground">Destination prévue :</span> {to.name}</p> : null}
              {live.position.declaredDestination ? <p><span className="text-muted-foreground">Destination AIS déclarée :</span> {live.position.declaredDestination}</p> : null}
              {live.position.declaredEta ? <p><span className="text-muted-foreground">ETA AIS déclarée :</span> {live.position.declaredEta}</p> : null}
              {live.etaIso && to ? <p><span className="text-muted-foreground">ETA calculée (vitesse actuelle) :</span> vers {wallTimeInZone(live.etaIso, portTimeZone(to))}</p> : null}
              {live.etaIso && shipDeparture?.arrival_at ? <p><span className="text-muted-foreground">Comparaison calendrier :</span> {formatDelay(Math.round((Date.parse(live.etaIso) - Date.parse(shipDeparture.arrival_at)) / 60_000)).label}</p> : null}
              {live.position.ataAt && to ? <p><span className="text-muted-foreground">Accostage constaté :</span> {wallTimeInZone(live.position.ataAt, portTimeZone(to))}</p> : null}
              {shipDeparture?.arrival_at && to ? <p className="text-xs text-muted-foreground">Horaire prévu : {wallTimeInZone(shipDeparture.arrival_at, portTimeZone(to))}</p> : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {live.ageMinutes <= 30 ? "Position GPS réelle reçue via AIS." : "Dernière position AIS connue : elle peut ne plus refléter la position actuelle."}
            </p>
          </div>
        </Section>
      ) : null}
      <Section title="Où en est ce navire ?">
        {ship && ship.state === "sea" ? (
          <div className="rounded-2xl bg-success/10 p-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="relative flex size-2.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>
              En mer
            </div>
            <p className="mt-2 font-display text-lg font-bold">
              {from?.name ?? "—"} → {to?.name ?? "—"}
            </p>
            {progress !== null ? (
              <div className="mt-2">
                <div
                  className="h-2 overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Avancement de la traversée"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-cta"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(progress * 100)} % de la traversée
                </p>
              </div>
            ) : null}
            {shipDeparture?.arrival_at && to ? (
              <p className="mt-2 text-sm">
                Arrivée prévue à{" "}
                <strong>{wallTimeInZone(shipDeparture.arrival_at, portTimeZone(to))}</strong>{" "}
                <span className="text-xs text-muted-foreground">
                  ({zoneLabel(portTimeZone(to))})
                </span>
              </p>
            ) : null}
            {live ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {live.position.speedKnots !== null
                  ? `${live.position.speedKnots.toFixed(1)} nœuds`
                  : ""}
                {live.position.courseDeg !== null
                  ? ` · cap ${Math.round(live.position.courseDeg)}° (${courseLabel(live.position.courseDeg)})`
                  : ""}{" "}
                · position {formatAge(live.ageMinutes)}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {live
                ? "Position réelle (suivi AIS)."
                : "Position déduite des horaires, pas une position GPS."}
            </p>
          </div>
        ) : ship && ship.state === "docked" ? (
          <div className="rounded-2xl bg-secondary p-4">
            <p className="text-sm font-bold">Au port de {portName(ship.portId ?? undefined)}</p>
            {shipDeparture && to ? (
              <p className="mt-1 text-sm">
                Prochain départ :{" "}
                <strong>{formatDateTime(shipDeparture.departure_at, portTimeZone(from))}</strong>{" "}
                vers {to.name}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">Position déduite des horaires.</p>
          </div>
        ) : (
          <EmptyNote>
            Aucune traversée prévue prochainement pour ce navire : position inconnue.
          </EmptyNote>
        )}
        {ship && shipDeparture ? (
          <button
            type="button"
            onClick={() => onSelect({ type: "departure", id: shipDeparture.id })}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-secondary"
          >
            Voir la traversée
          </button>
        ) : null}
      </Section>
      {/* Photo du navire : photo du back-office, sinon photo libre de Wikimedia Commons, sinon illustration. */}
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-primary/90 to-primary/60 md:h-40">
        {photoQuery.isLoading ? (
          <div className="size-full animate-pulse bg-muted" aria-hidden />
        ) : photo ? (
          <img
            src={photo.url}
            alt={`Photo du navire ${vessel.name}`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            width={480}
            height={270}
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-primary-foreground/80">
            <div className="text-center">
              <Ship className="mx-auto size-9" aria-hidden />
              <p className="mt-2 text-xs font-medium">Photo non disponible</p>
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-2.5 pt-8 md:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
            {vessel.vessel_type ?? "Navire"}
          </p>
          <h1 className="font-display text-xl font-bold leading-tight text-white drop-shadow">
            {vessel.name}
          </h1>
        </div>
      </div>
      {photo?.source === "commons" ? (
        <p className="border-b px-4 py-2 text-[11px] leading-snug text-muted-foreground md:px-6">
          Photo{photo.credit ? ` : ${photo.credit}` : ""}
          {photo.license ? ` · ${photo.license}` : ""} ·{" "}
          {photo.pageUrl ? (
            <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Wikimedia Commons
            </a>
          ) : (
            "Wikimedia Commons"
          )}
          . Photo indicative, à vérifier.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-sm md:px-6">
        {company ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 font-semibold text-primary hover:bg-secondary"
            onClick={() => onSelect({ type: "company", id: company.id })}
          >
            <CompanyBadge name={company.name} logoUrl={company.logo_url} size={24} />
            {company.name}
          </button>
        ) : null}
        {vessel.imo ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            IMO {vessel.imo}
          </span>
        ) : null}
        {vessel.imo || vessel.mmsi ? (
          <a
            href={
              vessel.imo
                ? `https://www.vesselfinder.com/?imo=${vessel.imo}`
                : `https://www.vesselfinder.com/?mmsi=${vessel.mmsi}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-primary hover:underline"
          >
            Suivre en direct <ExternalLink className="size-3" aria-hidden />
            <span className="sr-only">(VesselFinder, nouvel onglet)</span>
          </a>
        ) : null}
        {vessel.is_demo ? <DemoBadge /> : null}
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
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "departure", id: departure.id })}
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-secondary"
                  >
                    <p className="text-sm font-medium">
                      {formatDateTime(
                        departure.departure_at,
                        portTimeZone(portById.get(route?.departure_port_id ?? "")),
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {route
                        ? `${portName(route.departure_port_id)} → ${portName(route.arrival_port_id)}`
                        : "—"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {vessel.description ? (
        <Section title="À bord">
          <p className="text-sm leading-relaxed">{vessel.description}</p>
        </Section>
      ) : null}
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
