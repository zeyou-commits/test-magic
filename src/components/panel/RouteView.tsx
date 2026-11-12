import { useState } from "react";
import { LineAlertNotice, VesselAlertTag } from "@/components/panel/VesselAlert";
import { LineCalendar } from "./LineCalendar";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, CalendarDays, ChevronRight } from "lucide-react";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration } from "@/lib/ferry/format";
import { portTimeZone, zoneLabel } from "@/lib/ferry/time";
import type { RouteLine, Selection } from "@/lib/ferry/types";
import { Button } from "@/components/ui/button";
import { BookingLink, DemoBadge, EmptyNote, PanelHeader, Section } from "./shared";
import { QuestionHelp } from "@/components/questions/QuestionHelp";
import { RoomPicker } from "./RoomPicker";
import { ReportButton } from "./ReportButton";
import { tr } from "@/lib/i18n";

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
  const { data: departures = [] } = useQuery(upcomingDeparturesQuery());
  const [salons, setSalons] = useState(false);

  const route = routes.find((item) => item.id === routeId);
  if (!route) return <EmptyNote>{tr("ui.routeView.ligneIntrouvable")}</EmptyNote>;

  const from = ports.find((port) => port.id === route.departure_port_id);
  const to = ports.find((port) => port.id === route.arrival_port_id);
  const timeZone = portTimeZone(from);
  const lineDepartures = departures.filter((departure) => departure.route_id === routeId);
  const operators = companies.filter(
    (company) =>
      route.company_ids.includes(company.id) ||
      lineDepartures.some((departure) => departure.company_id === company.id),
  );
  const routeDepartures = lineDepartures.slice(0, 8);
  // Sens inverse : indispensable pour préparer le retour (Algérie → Europe ou l'inverse).
  const reverse = routes.find(
    (item) =>
      item.departure_port_id === route.arrival_port_id &&
      item.arrival_port_id === route.departure_port_id,
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      <PanelHeader
        overline={tr("ui.routeView.ligne")}
        title={`${from?.name ?? "—"} → ${to?.name ?? "—"}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {tr("ui.routeView.dureeTypique")}{formatDuration(route.typical_duration_minutes)}
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
            {tr("ui.routeView.planifierCeTrajet")}
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
            {tr("ui.routeView.voirLeSensInverse")}{to?.name} → {from?.name}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {tr("ui.routeView.aucuneLigneConnueDansLe")}{to?.name} → {from?.name}).
          </p>
        )}
      </div>

      <Section title={`Prochains départs · ${zoneLabel(timeZone)}`}>
        {routeDepartures.length === 0 ? (
          <EmptyNote>{tr("ui.routeView.aucunDepartProgrammePourLe")}</EmptyNote>
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
                      {departure.status === "cancelled" ? tr("ui.routeView.annule") : ""}{" "}
                      <VesselAlertTag vesselId={departure.vessel_id} />
                    </span>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <div className="px-4 md:px-6">
        <QuestionHelp
          routeId={route.id}
          {...(lineDepartures.length ? { onAskTravellers: () => setSalons(true) } : {})}
          travellersHint="Choisissez une traversée de la ligne : ses voyageurs répondent dans le salon."
        />
        <RoomPicker
          departures={lineDepartures}
          onSelect={onSelect}
          open={salons}
          onOpenChange={setSalons}
        />
      </div>

      <Section title={tr("ui.routeView.compagniesEtReservation")}>
        {operators.length === 0 ? (
          <EmptyNote>{tr("ui.routeView.aucuneCompagnieRenseignee")}</EmptyNote>
        ) : (
          <div className="flex flex-col gap-3">
            <LineAlertNotice departures={lineDepartures} vessels={vessels} />
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

      <Section title={tr("ui.routeView.joursEtHeuresDeDepart")}>
        <LineCalendar departures={lineDepartures} companies={companies} timeZone={timeZone} />
      </Section>

      <Section title={tr("ui.routeView.portsRelies")}>
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
                    {index === 0 ? tr("ui.routeView.depart") : tr("ui.routeView.arrivee")} · {port.name}
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
        <Section title={tr("ui.routeView.informationsComplementaires")}>
          <div className="text-sm text-muted-foreground">{route.notes}</div>
        </Section>
      ) : null}
    </div>
  );
}
