import { useQuery } from "@tanstack/react-query";
import {
  companiesQuery,
  fleetDeparturesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration } from "@/lib/ferry/format";
import type { Selection } from "@/lib/ferry/types";
import { BookingLink, DemoBadge, EmptyNote, PanelHeader, ReliabilityNote, Section } from "./shared";
import { portTimeZone, wallTimeInZone, zoneLabel } from "@/lib/ferry/time";
import { useLiveShips } from "@/lib/ferry/useLiveShips";
import { courseLabel, formatAge, formatDelay } from "@/lib/ferry/tracking";
import { ReportButton } from "./ReportButton";

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
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());

  const vessel = vessels.find((item) => item.id === vesselId);
  if (!vessel) return <EmptyNote>Navire introuvable.</EmptyNote>;
  const company = companies.find((item) => item.id === vessel.company_id);
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "—";
  const nextDepartures = departures
    .filter((departure) => departure.vessel_id === vesselId)
    .slice(0, 6);

  return (
    <div>
      <PanelHeader
        overline={vessel.vessel_type ?? "Navire"}
        title={vessel.name}
        subtitle={
          <span className="flex items-center gap-2">
            {company ? (
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => onSelect({ type: "company", id: company.id })}
              >
                {company.name}
              </button>
            ) : null}
            {vessel.is_demo ? <DemoBadge /> : null}
          </span>
        }
      />
      <div>
        {vessel.description ? (
          <Section title="À bord">
            <p className="text-sm leading-relaxed">{vessel.description}</p>
          </Section>
        ) : null}
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
                          portTimeZone(ports.find((port) => port.id === route?.departure_port_id)),
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
      </div>
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
