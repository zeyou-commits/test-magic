import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, CalendarDays, ChevronRight } from "lucide-react";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  schedulesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration, weekdayLabels } from "@/lib/ferry/format";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import type { RouteLine, Selection } from "@/lib/ferry/types";
import { Button } from "@/components/ui/button";
import { BookingLink, DemoBadge, EmptyNote, PanelHeader, ReliabilityNote, Section } from "./shared";
import { ReportButton } from "./ReportButton";

export function RouteView({
  routeId,
  onSelect,
  onPlanRoute,
}: {
  routeId: string;
  onSelect: (selection: Selection) => void;
  onPlanRoute?: (route: RouteLine) => void;
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
  const timeZone = portTimeZone(from);
  const operators = companies.filter((company) => route.company_ids.includes(company.id));
  const routeSchedules = schedules.filter((schedule) => schedule.route_id === routeId);
  const routeDepartures = departures
    .filter((departure) => departure.route_id === routeId)
    .slice(0, 8);
  // Sens inverse : indispensable pour préparer le retour (Algérie → Europe ou l'inverse).
  const reverse = routes.find(
    (item) =>
      item.departure_port_id === route.arrival_port_id &&
      item.arrival_port_id === route.departure_port_id,
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PanelHeader
        overline="Ligne"
        title={`${from?.name ?? "—"} → ${to?.name ?? "—"}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              Durée typique : {formatDuration(route.typical_duration_minutes)}
              {route.distance_km ? ` · ${route.distance_km} km` : ""}
            </span>
            {route.is_demo ? <DemoBadge /> : null}
          </span>
        }
        actions={<ReportButton targetType="route" targetId={route.id} />}
      />

      <div className="grid gap-2 px-4 md:px-6">
        {onPlanRoute ? (
          <Button
            type="button"
            onClick={() => onPlanRoute(route)}
            className="h-11 w-full rounded-xl text-sm font-semibold"
          >
            <CalendarDays className="size-4" />
            Planifier ce trajet
          </Button>
        ) : null}
        {reverse ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onSelect({ type: "route", id: reverse.id })}
            className="h-11 w-full rounded-xl text-sm font-semibold"
          >
            <ArrowLeftRight className="size-4" />
            Voir le sens inverse : {to?.name} → {from?.name}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aucune ligne connue dans le sens inverse ({to?.name} → {from?.name}).
          </p>
        )}
      </div>

      <Section title={`Prochains départs · ${zoneLabel(timeZone)}`}>
        {routeDepartures.length === 0 ? (
          <EmptyNote>Aucun départ connu à venir.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-1">
            {routeDepartures.map((departure) => {
              const company = companies.find((item) => item.id === departure.company_id);
              return (
                <button
                  key={departure.id}
                  type="button"
                  onClick={() => onSelect({ type: "departure", id: departure.id })}
                  className="group flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-secondary"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">
                      {formatDateTime(departure.departure_at, timeZone)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {company?.name ?? "—"}
                      {departure.duration_minutes
                        ? ` · ${formatDuration(departure.duration_minutes)}`
                        : ""}
                      {departure.status === "cancelled" ? " · Annulé" : ""}
                    </span>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Compagnies et réservation">
        {operators.length === 0 ? (
          <EmptyNote>Aucune compagnie renseignée.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-3">
            {operators.map((company) => (
              <div key={company.id} className="rounded-xl border border-border p-3">
                <button
                  type="button"
                  onClick={() => onSelect({ type: "company", id: company.id })}
                  className="group mb-2 flex w-full items-center justify-between text-left text-sm font-semibold"
                >
                  {company.name}
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </button>
                <BookingLink company={company} compact />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Calendrier habituel connu">
        {routeSchedules.length === 0 ? (
          <EmptyNote>Aucun calendrier connu pour cette ligne.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-3">
            {routeSchedules.map((schedule) => {
              const company = companies.find((item) => item.id === schedule.company_id);
              const vessel = vessels.find((item) => item.id === schedule.default_vessel_id);
              return (
                <div
                  key={schedule.id}
                  className="flex flex-col gap-1 rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>
                      {schedule.departure_time.slice(0, 5)}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({zoneLabel(timeZone)})
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {formatDuration(schedule.duration_minutes)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {schedule.weekdays
                      .map((day) => weekdayLabels[day - 1] ?? "")
                      .filter(Boolean)
                      .join(", ")}
                    {company ? ` · ${company.name}` : ""}
                    {vessel ? ` · ${vessel.name}` : ""}
                  </div>
                  <ReliabilityNote
                    reliability={schedule.reliability}
                    sourceName={schedule.source_name}
                    sourceUrl={schedule.source_url}
                    verifiedAt={schedule.last_verified_at}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Ports reliés">
        <div className="flex flex-col gap-2">
          {[from, to].map((port, index) =>
            port ? (
              <button
                key={port.id}
                type="button"
                onClick={() => onSelect({ type: "port", id: port.id })}
                className="group flex items-center justify-between rounded-md px-2 py-2 text-left hover:bg-secondary"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {index === 0 ? "Départ" : "Arrivée"} · {port.name}
                  </span>
                  <span className="block text-sm text-muted-foreground">{port.country_name}</span>
                </div>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </button>
            ) : null,
          )}
        </div>
      </Section>

      {route.notes ? (
        <Section title="Informations complémentaires">
          <div className="text-sm text-muted-foreground">{route.notes}</div>
        </Section>
      ) : null}
    </div>
  );
}
