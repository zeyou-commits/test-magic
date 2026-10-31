import { useQuery } from "@tanstack/react-query";
import { CircleAlert, ExternalLink } from "lucide-react";
import type { Departure } from "@/lib/ferry/types";
import {
  alternativeDepartures,
  impactOnDeparture,
  incidentForVessel,
  incidentHeadline,
  incidentsQuery,
  isOpenIncident,
  type IncidentImpact,
  type VesselIncident,
} from "@/lib/ferry/incidents";
import { formatDateTime } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import { CompanyContacts } from "./CompanyContacts";
import { ReportButton } from "./ReportButton";
import { safeExternalUrl } from "./shared";

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

/** Rouge si l'immobilisation est vérifiée, ambre pendant la vérification, vert une fois levée. */
const incidentTone = (incident: VesselIncident) =>
  incident.status === "confirmed"
    ? "border-red-300 bg-red-50 text-red-950"
    : isOpenIncident(incident)
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

function SourceLine({ incident }: { incident: VesselIncident }) {
  const href = safeExternalUrl(incident.source_url);
  return (
    <p className="mt-1 text-xs">
      {incident.verified_at ? `Dernière confirmation le ${day(incident.verified_at)}` : "Pas encore vérifié"}
      {href ? (
        <>
          {" · "}
          <a
            className="font-semibold underline"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            Voir la source
          </a>
        </>
      ) : null}
    </p>
  );
}

const impactText: Record<IncidentImpact, string> = {
  confirmed: "Ce départ est touché selon la source. Attendez la confirmation de la compagnie.",
  possible: "Ce départ pourrait être touché : aucune décision de la compagnie à ce stade.",
  none: "Aucune conséquence connue sur ce départ à ce stade.",
};

/** Fiche du navire : l'information, sans considérer tous ses départs comme touchés. */
export function VesselIncidentNotice({
  vesselId,
  vesselName,
}: {
  vesselId: string;
  vesselName: string;
}) {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const incident = incidentForVessel(incidents, vesselId);
  if (!incident) return null;
  const open = isOpenIncident(incident);
  const port = ports.find((p) => p.id === incident.location_port_id)?.name;
  return (
    <div
      role="status"
      className={`rounded-xl border p-3 text-sm ${incidentTone(incident)}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        <CircleAlert size={16} aria-hidden /> {incidentHeadline(incident, vesselName, port)}
      </p>
      {incident.public_note ? (
        <p className="mt-1 text-xs leading-relaxed">{incident.public_note}</p>
      ) : null}
      <SourceLine incident={incident} />
      {open ? (
        <p className="mt-1 text-xs">
          Ouvrez votre traversée pour savoir si elle est concernée. Seule la compagnie décide du
          sort d'une réservation.
        </p>
      ) : null}
      {open ? (
        <div className="mt-1">
          <ReportButton
            targetType="vessel"
            targetId={vesselId}
            label="Cette information n'est pas bonne ou a changé"
            initialReason="incident_feedback"
            variant="link"
          />
        </div>
      ) : null}
    </div>
  );
}

/** Fiche d'une traversée : effet sur ce départ, contacts, autres départs à vérifier. */
export function DepartureIncidentNotice({ departure }: { departure: Departure }) {
  const { data: incidents = [] } = useQuery(incidentsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: upcoming = [] } = useQuery(upcomingDeparturesQuery());
  const incident = incidentForVessel(incidents, departure.vessel_id);
  if (!incident) return null;
  const vessel = vessels.find((v) => v.id === departure.vessel_id);
  const company = companies.find((c) => c.id === departure.company_id);
  const open = isOpenIncident(incident);
  const impact = open ? impactOnDeparture(incident, departure.id) : "none";
  const alternatives =
    open && impact !== "none"
      ? alternativeDepartures(departure, upcoming as Departure[], routes)
      : [];
  const routeLabel = (id: string) => {
    const route = routes.find((r) => r.id === id);
    const name = (portId?: string) => ports.find((p) => p.id === portId)?.name ?? "?";
    return route ? `${name(route.departure_port_id)} → ${name(route.arrival_port_id)}` : "Liaison";
  };
  const zoneOf = (routeId: string) =>
    portTimeZone(
      ports.find((p) => p.id === routes.find((r) => r.id === routeId)?.departure_port_id),
    );
  return (
    <section className="grid gap-3" aria-label="Information sur le navire">
      <div
        role="status"
        className={`rounded-xl border p-3 text-sm ${incidentTone(incident)}`}
      >
        <p className="flex items-center gap-2 font-semibold">
          <CircleAlert size={16} aria-hidden />{" "}
          {incidentHeadline(
            incident,
            vessel?.name ?? "Le navire",
            ports.find((p) => p.id === incident.location_port_id)?.name,
          )}
        </p>
        <p className="mt-1 text-xs font-medium leading-relaxed">
          {open ? impactText[impact] : "L'information a été levée : suivez les horaires publiés."}
        </p>
        {incident.public_note ? (
          <p className="mt-1 text-xs leading-relaxed">{incident.public_note}</p>
        ) : null}
        <SourceLine incident={incident} />
      </div>

      {open && company ? (
        <div className="grid gap-1">
          <p className="text-xs font-semibold">Votre réservation : voyez-la avec votre compagnie</p>
          <CompanyContacts company={company} />
        </div>
      ) : null}

      {alternatives.length ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <h3 className="text-sm font-semibold">Autres départs à vérifier</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Suggestions BledWay, distinctes de ce que votre compagnie peut proposer. Places, tarifs
            et transfert de billet ne sont pas garantis : à confirmer sur le site de chaque
            compagnie.
          </p>
          <ul className="mt-2 grid gap-2">
            {alternatives.map((item) => {
              const other = companies.find((c) => c.id === item.company_id);
              const href = safeExternalUrl(other?.booking_url ?? other?.website_url);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs"
                >
                  <span className="min-w-40 flex-1">
                    <strong className="block">{routeLabel(item.route_id)}</strong>
                    {formatDateTime(item.departure_at, zoneOf(item.route_id))} ·{" "}
                    {other?.name ?? "Compagnie"}
                  </span>
                  {href ? (
                    <a
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-primary"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Vérifier et réserver <ExternalLink size={13} aria-hidden />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
