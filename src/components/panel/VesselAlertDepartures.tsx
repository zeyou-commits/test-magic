import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { DepartureAlternatives } from "./DepartureAlternatives";
import { formatDateTime } from "@/lib/ferry/format";
import { impactOnDeparture, incidentForVessel, incidentsQuery } from "@/lib/ferry/incidents";
import { portsQuery, routesQuery, upcomingDeparturesQuery } from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";
import { useVesselAlert } from "@/lib/ferry/vesselAlerts";

const impactLabel = { confirmed: "Touchée", possible: "Peut être touchée", none: "À vérifier" };

/** Fiche d'un navire en alerte : ses prochaines traversées, à vérifier auprès de la compagnie. */
export function VesselAlertDepartures({
  vesselId,
  onSelect,
}: {
  vesselId: string;
  onSelect: (selection: Selection) => void;
}) {
  const alert = useVesselAlert(vesselId);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: incidents = [] } = useQuery(incidentsQuery);
  if (!alert) return null;
  const incident = incidentForVessel(incidents, vesselId);
  const now = Date.now();
  const list = upcoming
    .filter(
      (d) =>
        d.vessel_id === vesselId && d.status !== "cancelled" && Date.parse(d.departure_at) > now,
    )
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at))
    .slice(0, 5);
  if (!list.length) return null;
  return (
    <section className="bw-vessel-alert-trips" aria-label="Traversées à vérifier">
      <h3>Traversées à vérifier</h3>
      <ul>
        {list.map((d) => {
          const route = routes.find((r) => r.id === d.route_id);
          const from = ports.find((p) => p.id === route?.departure_port_id);
          const to = ports.find((p) => p.id === route?.arrival_port_id);
          return (
            <li key={d.id}>
              <button type="button" onClick={() => onSelect({ type: "departure", id: d.id })}>
                <span>
                  <strong>
                    {from?.name ?? "Départ"} → {to?.name ?? "Arrivée"}
                  </strong>
                  <small>{formatDateTime(d.departure_at, portTimeZone(from))}</small>
                </span>
                <em>{impactLabel[impactOnDeparture(incident, d.id)]}</em>
                <ChevronRight size={15} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
      <DepartureAlternatives departure={list[0]!} onSelect={onSelect} always />
    </section>
  );
}
