import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Phone } from "lucide-react";
import { findAlternatives, isDisrupted } from "@/lib/ferry/alternatives";
import { newsQuery } from "@/lib/ferry/flash";
import { formatDate, formatTime } from "@/lib/ferry/format";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import type { Departure, Selection } from "@/lib/ferry/types";
import { useVesselAlerts } from "@/lib/ferry/vesselAlerts";
import { DepartureAlternatives } from "./DepartureAlternatives";

/**
 * Vue personnelle quand MA traversée est touchée (je la suis) : ce qui se passe, ce que je peux
 * faire, et 2 autres départs proches (d'autres compagnies d'abord), « Voir plus » pour le reste.
 * Les traversées estimées sont proposées aussi, et dites estimées : le site les assume.
 */
export function PersonalImpact({
  departure,
  onSelect,
}: {
  departure: Departure;
  onSelect: (selection: Selection) => void;
}) {
  const [more, setMore] = useState(false);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: news = [] } = useQuery(newsQuery);
  const alerts = useVesselAlerts();
  const published = news ?? [];
  const company = companies.find((item) => item.id === departure.company_id);
  const vesselAlert = departure.vessel_id ? alerts.get(departure.vessel_id) : undefined;
  const disruption = published.find(
    (item) =>
      (item.kind === "alerte" || item.kind === "perturbation") &&
      isDisrupted(departure, [item]),
  );
  const reason =
    departure.status === "cancelled"
      ? { title: "Votre traversée est annulée", tone: "critical" as const }
      : vesselAlert
        ? { title: `${vesselAlert.label} : votre traversée est menacée`, tone: "critical" as const }
        : disruption
          ? { title: disruption.title, tone: "warning" as const }
          : departure.status === "modified"
            ? { title: "L’horaire de votre traversée a changé", tone: "warning" as const }
            : null;
  if (!reason || Date.parse(departure.departure_at) < Date.now() - 86_400_000) return null;

  const advice =
    departure.status === "cancelled"
      ? `Contactez ${company?.name ?? "la compagnie"} pour un report ou un remboursement, et gardez votre billet.`
      : vesselAlert
        ? "Attendez la confirmation de la compagnie avant de prendre la route vers le port. Gardez votre billet."
        : disruption
          ? "Vérifiez l’heure auprès de la compagnie avant de prendre la route."
          : "Vérifiez votre nouvelle heure de présentation au port.";

  const { sameLine, nearby } = findAlternatives(
    departure,
    upcoming,
    routes,
    (id) => alerts.has(id),
    published,
  );
  // D'autres compagnies d'abord : la même compagnie est souvent touchée par la même cause.
  const pool = [...sameLine, ...nearby];
  const picks = [
    ...pool.filter((item) => item.company_id !== departure.company_id),
    ...pool.filter((item) => item.company_id === departure.company_id),
  ].slice(0, 2);
  const portName = (id?: string) => ports.find((port) => port.id === id)?.name ?? "?";

  return (
    <section className="bw-impact" data-tone={reason.tone} aria-label="Ma traversée est touchée">
      <p className="bw-impact__title">
        <AlertTriangle size={17} aria-hidden /> {reason.title}
      </p>
      <p className="bw-impact__advice">{advice}</p>
      {company?.phone ? (
        <a className="bw-impact__call" href={`tel:${company.phone.replace(/\s+/g, "")}`}>
          <Phone size={14} aria-hidden /> Appeler {company.name}
        </a>
      ) : null}
      {picks.length ? (
        <>
          <p className="bw-impact__sub">Autres départs proches</p>
          <ul>
            {picks.map((item) => {
              const route = routes.find((r) => r.id === item.route_id);
              const zone = portTimeZone(ports.find((port) => port.id === route?.departure_port_id));
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => onSelect({ type: "departure", id: item.id })}>
                    <span>
                      <strong>
                        {formatDate(item.departure_at, zone)} · {formatTime(item.departure_at, zone)}
                      </strong>
                      <small>
                        {portName(route?.departure_port_id)} → {portName(route?.arrival_port_id)} ·{" "}
                        {companies.find((c) => c.id === item.company_id)?.name ?? "Compagnie"}
                        {item.reliability === "to_verify" ? " · horaire estimé" : ""}
                      </small>
                    </span>
                    <ChevronRight size={15} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="bw-impact__more" onClick={() => setMore(!more)}>
            {more ? "Masquer les autres dates" : "Voir plus de dates"}
          </button>
        </>
      ) : (
        <p className="bw-impact__sub">Aucun autre départ connu dans les 7 jours autour.</p>
      )}
      {more ? <DepartureAlternatives departure={departure} onSelect={onSelect} always /> : null}
    </section>
  );
}
