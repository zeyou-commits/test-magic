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
import { LineFigures, LineHero, VesselThumb, durationRange } from "./LineOverview";
import { lineStats } from "@/lib/ferry/lineStats";
import { CompanyBadge } from "./CompanyBadge";
import { ReportButton } from "./ReportButton";
import { tr, placeName } from "@/lib/i18n";

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
  // Les chiffres de la ligne, tirés des départs publiés : rien d'estimé.
  const stats = lineStats({ departures: lineDepartures, companies, vessels });
  // Sens inverse : indispensable pour préparer le retour (Algérie → Europe ou l'inverse).
  const reverse = routes.find(
    (item) =>
      item.departure_port_id === route.arrival_port_id &&
      item.arrival_port_id === route.departure_port_id,
  );

  return (
    <div className="flex flex-col gap-6 pb-12">
      {from && to ? (
        // En-tête resserré : le titre, puis le trajet en image (durée et distance dans le médaillon).
        <div className="flex flex-col gap-3">
          <header className="px-4 pt-3 md:px-6 md:pt-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {tr("ui.routeView.ligne")}
              {route.is_demo ? <DemoBadge /> : null}
            </div>
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-foreground">
              {placeName(from.name)} → {placeName(to.name)}
            </h1>
          </header>
          <LineHero
            from={from}
            to={to}
            typicalMinutes={route.typical_duration_minutes}
            distanceKm={route.distance_km}
            vessel={stats.vessels[0] ?? null}
            onSelect={onSelect}
          />
        </div>
      ) : (
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
      )}

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
            {tr("ui.routeView.voirLeSensInverse")}{placeName(to?.name)} → {placeName(from?.name)}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {tr("ui.routeView.aucuneLigneConnueDansLe")}{placeName(to?.name)} → {placeName(from?.name)}).
          </p>
        )}
      </div>

      <div className="px-4 md:px-6">
        <LineFigures stats={stats} timeZone={timeZone} />
      </div>

      <Section title={tr("ui.routeView.prochainsDeparts", { zoneLabel: zoneLabel(timeZone) })}>
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
                  className="group flex w-full items-center justify-between rounded-md px-2 py-2 text-start hover:bg-secondary"
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
            {operators.map((company) => {
              // Ce que fait cette compagnie sur la ligne : départs, durée publiée, navires.
              const own = stats.operators.find((item) => item.company.id === company.id);
              const duration = own ? durationRange(own.minMinutes, own.maxMinutes) : null;
              return (
                <div key={company.id} className="bw-line-operator">
                  <button
                    type="button"
                    onClick={() => onSelect({ type: "company", id: company.id })}
                    className="group flex w-full items-center gap-3 text-start"
                  >
                    <CompanyBadge name={company.name} logoUrl={company.logo_url} size={30} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{company.name}</strong>
                      {own ? (
                        <small className="block text-xs text-muted-foreground">
                          {own.count} {own.count > 1 ? tr("ui.routeView.departsAVenir") : tr("ui.routeView.departAVenir")}
                          {duration ? tr("ui.routeView.deTraversee", { duration }) : ""}
                        </small>
                      ) : null}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </button>
                  {own?.vessels.length ? (
                    <div className="bw-line-operator__vessels">
                      {own.vessels.map((vessel) => (
                        <button
                          key={vessel.id}
                          type="button"
                          className="bw-line-vessel"
                          onClick={() => onSelect({ type: "vessel", id: vessel.id })}
                        >
                          <VesselThumb vessel={vessel} width={56} />
                          <span>{vessel.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <BookingLink company={company} compact />
                </div>
              );
            })}
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
                className="group flex items-center justify-between rounded-md px-2 py-2 text-start hover:bg-secondary"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {index === 0 ? tr("ui.routeView.depart") : tr("ui.routeView.arrivee")} · {placeName(port.name)}
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
      {from && to ? (
        <div className="px-4 md:px-6">
          <ReportButton targetType="route" targetId={route.id} variant="link" />
        </div>
      ) : null}
    </div>
  );
}
