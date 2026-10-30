import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Shuffle } from "lucide-react";
import { findAlternatives, isDisrupted } from "@/lib/ferry/alternatives";
import { newsQuery } from "@/lib/ferry/flash";
import { formatDate, formatTime } from "@/lib/ferry/format";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import type { Departure, Selection } from "@/lib/ferry/types";
import { useVesselAlerts } from "@/lib/ferry/vesselAlerts";

/**
 * Un départ annulé, sur un navire en alerte ou touché par une perturbation : les autres départs
 * publiés dans les 7 jours autour. Les places se vérifient auprès de la compagnie.
 */
export function DepartureAlternatives({
  departure,
  onSelect,
  always = false,
}: {
  departure: Departure;
  onSelect: (selection: Selection) => void;
  /** La fiche du navire les affiche sans repasser par les contrôles : son alerte est connue. */
  always?: boolean;
}) {
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: news } = useQuery(newsQuery);
  const alerts = useVesselAlerts();
  const published = news ?? [];
  const touched =
    always ||
    departure.status === "cancelled" ||
    Boolean(departure.vessel_id && alerts.has(departure.vessel_id)) ||
    isDisrupted(departure, published);
  if (!touched || Date.parse(departure.departure_at) < Date.now() - 86_400_000) return null;
  const { sameLine, nearby } = findAlternatives(
    departure,
    upcoming,
    routes,
    (id) => alerts.has(id),
    published,
  );
  const portName = (id?: string) => ports.find((port) => port.id === id)?.name ?? "?";
  const from = ports.find(
    (port) => port.id === routes.find((r) => r.id === departure.route_id)?.departure_port_id,
  );
  const row = (item: Departure) => {
    const route = routes.find((r) => r.id === item.route_id);
    const zone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
    const gap = Math.round(
      (Date.parse(item.departure_at) - Date.parse(departure.departure_at)) / 86_400_000,
    );
    return (
      <li key={item.id}>
        <button type="button" onClick={() => onSelect({ type: "departure", id: item.id })}>
          <span>
            <strong>
              {formatDate(item.departure_at, zone)} · {formatTime(item.departure_at, zone)}
            </strong>
            <small>
              {portName(route?.departure_port_id)} → {portName(route?.arrival_port_id)} ·{" "}
              {companies.find((company) => company.id === item.company_id)?.name ?? "Compagnie"}
              {item.vessel_id
                ? ` · ${vessels.find((vessel) => vessel.id === item.vessel_id)?.name ?? ""}`
                : ""}
            </small>
          </span>
          <em>{gap === 0 ? "Même jour" : `${gap > 0 ? "+" : ""}${gap} j`}</em>
          <ChevronRight size={15} aria-hidden />
        </button>
      </li>
    );
  };
  return (
    <section className="bw-alternatives" aria-label="Autres départs possibles">
      <h3>
        <Shuffle size={15} aria-hidden /> Autres départs autour du{" "}
        {formatDate(departure.departure_at, portTimeZone(from))}
      </h3>
      {sameLine.length ? (
        <>
          <h4>Sur la même ligne</h4>
          <ul>{sameLine.map(row)}</ul>
        </>
      ) : null}
      {nearby.length ? (
        <>
          <h4>Depuis ou vers les mêmes ports</h4>
          <ul>{nearby.map(row)}</ul>
        </>
      ) : null}
      {sameLine.length + nearby.length ? (
        <p>Selon les horaires publiés. Les places se vérifient auprès de la compagnie.</p>
      ) : (
        <p>Aucun autre départ publié dans les 7 jours autour de cette date.</p>
      )}
    </section>
  );
}
