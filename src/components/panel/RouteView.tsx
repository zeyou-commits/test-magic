import { useQuery } from "@tanstack/react-query";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  schedulesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  formatDateTime,
  formatDuration,
  weekdayLabels,
} from "@/lib/ferry/format";
import type { Selection } from "@/lib/ferry/types";
import { DemoBadge, EmptyNote, PanelHeader, ReliabilityNote, Section } from "./shared";
import { ReportButton } from "./ReportButton";

export function RouteView({
  routeId,
  onSelect,
}: {
  routeId: string;
  onSelect: (selection: Selection) => void;
}) {
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: schedules = [] } = useQuery(schedulesQuery);
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());

  const route = routes.find((item) => item.id === routeId);
  if (!route) return <EmptyNote>Ligne introuvable.</EmptyNote>;

  const from = ports.find((port) => port.id === route.departure_port_id);
  const to = ports.find((port) => port.id === route.arrival_port_id);
  const operators = companies.filter((company) => route.company_ids.includes(company.id));
  const routeSchedules = schedules.filter((schedule) => schedule.route_id === routeId);
  const routeDepartures = departures.filter((departure) => departure.route_id === routeId).slice(0, 8);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        overline="Ligne maritime"
        title={`${from?.name ?? "—"} → ${to?.name ?? "—"}`}
        subtitle={
          <span className="flex items-center gap-2">
            <span>
              Durée typique : {formatDuration(route.typical_duration_minutes)}
              {route.distance_km ? ` · ${route.distance_km} km` : ""}
            </span>
            {route.is_demo ? <DemoBadge /> : null}
          </span>
        }
        actions={<ReportButton targetType="route" targetId={route.id} />}
      />
      <div className="flex-1 overflow-y-auto">
        <Section title="Ports">
          <div className="grid gap-2">
            {[from, to].map((port, index) =>
              port ? (
                <button
                  key={port.id}
                  type="button"
                  onClick={() => onSelect({ type: "port", id: port.id })}
                  className="rounded-md px-2 py-2 text-left hover:bg-secondary"
                >
                  <p className="text-sm font-medium">
                    {index === 0 ? "Départ" : "Arrivée"} · {port.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{port.country_name}</p>
                </button>
              ) : null,
            )}
          </div>
        </Section>

        <Section title={`Compagnies (${operators.length})`}>
          {operators.length === 0 ? (
            <EmptyNote>Aucune compagnie renseignée.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {operators.map((company) => (
                <li key={company.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "company", id: company.id })}
                    className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-secondary"
                  >
                    {company.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`Calendrier habituel (${routeSchedules.length})`}>
          {routeSchedules.length === 0 ? (
            <EmptyNote>Aucun calendrier connu pour cette ligne.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {routeSchedules.map((schedule) => {
                const company = companies.find((item) => item.id === schedule.company_id);
                const vessel = vessels.find((item) => item.id === schedule.default_vessel_id);
                return (
                  <li key={schedule.id} className="rounded-lg bg-secondary/60 px-3 py-2">
                    <p className="text-sm font-medium">
                      {schedule.departure_time.slice(0, 5)} ·{" "}
                      {formatDuration(schedule.duration_minutes)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {schedule.weekdays
                        .map((day) => weekdayLabels[day - 1] ?? "")
                        .filter(Boolean)
                        .join(", ")}
                      {company ? ` · ${company.name}` : ""}
                      {vessel ? ` · ${vessel.name}` : ""}
                    </p>
                    <div className="mt-1">
                      <ReliabilityNote
                        reliability={schedule.reliability}
                        sourceName={schedule.source_name}
                        sourceUrl={schedule.source_url}
                        verifiedAt={schedule.last_verified_at}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Prochains départs">
          {routeDepartures.length === 0 ? (
            <EmptyNote>Aucun départ connu à venir.</EmptyNote>
          ) : (
            <ul className="space-y-1">
              {routeDepartures.map((departure) => {
                const company = companies.find((item) => item.id === departure.company_id);
                return (
                  <li key={departure.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ type: "departure", id: departure.id })}
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-secondary"
                    >
                      <p className="text-sm font-medium">
                        {formatDateTime(departure.departure_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {company?.name ?? "—"}
                        {departure.duration_minutes
                          ? ` · ${formatDuration(departure.duration_minutes)}`
                          : ""}
                        {departure.status === "cancelled" ? " · Annulé" : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {route.notes ? (
          <Section title="Remarques">
            <p className="text-sm leading-relaxed">{route.notes}</p>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
