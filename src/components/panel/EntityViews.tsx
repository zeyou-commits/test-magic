import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Ship, Star, CalendarDays } from "lucide-react";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  vesselsQuery,
  upcomingDeparturesQuery,
} from "@/lib/ferry/queries";
import { formatDateTime, formatDuration } from "@/lib/ferry/format";
import { portTimeZone } from "@/lib/ferry/time";
import type { Selection } from "@/lib/ferry/types";
import { DemoBadge, EmptyNote, safeExternalUrl } from "./shared";
import { CompanyBadge } from "./CompanyBadge";
import { VesselMiniCard } from "./VesselMiniCard";
import { EntityReviews } from "./EntityReviews";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { reviewNumber } from "@/lib/ferry/reviewCriteria";
export { VesselView, DepartureView } from "./ShipViews";

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
  const departures = useQuery(upcomingDeparturesQuery());
  const rating = useQuery(entityReviewsQuery("company", companyId));
  const [tab, setTab] = useState("programmes");
  const [limit, setLimit] = useState(8);
  const { user } = useAuth();
  useEffect(() => {
    if (user && window.sessionStorage.getItem(`bledway:rating:company:${companyId}`))
      setTab("avis");
  }, [user, companyId]);
  const company = companies.find((c) => c.id === companyId);
  if (!company) return <EmptyNote>Compagnie introuvable.</EmptyNote>;
  const fleet = vessels.filter((v) => v.company_id === companyId);
  const programmes = (departures.data ?? [])
    .filter(
      (d) =>
        d.company_id === companyId &&
        d.status !== "cancelled" &&
        Date.parse(d.departure_at) >= Date.now(),
    )
    .sort((a, b) => a.departure_at.localeCompare(b.departure_at));
  const scheduled = new Set(programmes.map((d) => d.route_id));
  const lines = routes.filter((r) => r.company_ids.includes(companyId) || scheduled.has(r.id));
  const portName = (id: string) => ports.find((p) => p.id === id)?.name ?? "Port à confirmer";
  const site = safeExternalUrl(company.website_url);
  return (
    <article className="bw-company-profile">
      <header className="bw-company-hero">
        <CompanyBadge key={companyId} name={company.name} logoUrl={company.logo_url} size={56} />
        <div>
          <p>COMPAGNIE</p>
          <h2>{company.name}</h2>
          {company.is_demo ? <DemoBadge /> : null}
        </div>
      </header>
      <button className="pv-rating" type="button" onClick={() => setTab("avis")}>
        <Star size={16} aria-hidden />
        <span>
          {rating.data?.average != null
            ? `${reviewNumber(rating.data.average)}/5 · ${rating.data.count} avis`
            : "Avis des voyageurs"}
        </span>
      </button>
      <dl className="bw-company-stats">
        <div>
          <dt>
            <Ship size={15} aria-hidden /> Navires
          </dt>
          <dd>{fleet.length}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={15} aria-hidden /> Départs à venir
          </dt>
          <dd>{departures.isError ? "—" : programmes.length}</dd>
        </div>
      </dl>
      {company.description ? <p className="bw-company-description">{company.description}</p> : null}
      {site ? (
        <a className="bw-company-site" href={site} target="_blank" rel="noopener noreferrer">
          Site officiel <ExternalLink size={15} aria-hidden />
        </a>
      ) : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Fiche de la compagnie">
          <TabsTrigger value="programmes">Programmes</TabsTrigger>
          <TabsTrigger value="flotte">Flotte</TabsTrigger>
          <TabsTrigger value="avis">Avis</TabsTrigger>
        </TabsList>
        <TabsContent value="programmes">
          <h3>Prochains départs</h3>
          {departures.isPending ? (
            <p role="status">Chargement des programmes…</p>
          ) : departures.isError ? (
            <p role="alert">
              Les programmes sont indisponibles.{" "}
              <button type="button" onClick={() => void departures.refetch()}>
                Réessayer
              </button>
            </p>
          ) : programmes.length ? (
            <>
              <ul className="bw-company-programmes">
                {programmes.slice(0, limit).map((d) => {
                  const r = routes.find((r) => r.id === d.route_id);
                  const from = ports.find((p) => p.id === r?.departure_port_id);
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => onSelect({ type: "departure", id: d.id })}
                      >
                        <strong>
                          {r
                            ? `${portName(r.departure_port_id)} → ${portName(r.arrival_port_id)}`
                            : "Liaison à confirmer"}
                        </strong>
                        <span>{formatDateTime(d.departure_at, portTimeZone(from))}</span>
                        <small>
                          {vessels.find((v) => v.id === d.vessel_id)?.name ?? "Navire à confirmer"}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {limit < programmes.length ? (
                <button
                  type="button"
                  className="bw-company-more"
                  onClick={() => setLimit((n) => n + 8)}
                >
                  Voir plus de départs
                </button>
              ) : null}
            </>
          ) : (
            <EmptyNote>Aucun départ publié à venir.</EmptyNote>
          )}
          <details className="bw-rating-detail">
            <summary>Liaisons référencées · {lines.length}</summary>
            <ul className="bw-company-programmes">
              {lines.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onSelect({ type: "route", id: r.id })}>
                    <strong>
                      {portName(r.departure_port_id)} → {portName(r.arrival_port_id)}
                    </strong>
                    <small>
                      {scheduled.has(r.id)
                        ? `${formatDuration(r.typical_duration_minutes)} · programme publié`
                        : "Sans départ publié à venir"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </TabsContent>
        <TabsContent value="flotte">
          {fleet.length ? (
            fleet.map((v) => (
              <VesselMiniCard
                key={v.id}
                vessel={v}
                onOpen={() => onSelect({ type: "vessel", id: v.id })}
              />
            ))
          ) : (
            <EmptyNote>Aucun navire renseigné.</EmptyNote>
          )}
        </TabsContent>
        <TabsContent value="avis" forceMount hidden={tab !== "avis"}>
          <EntityReviews kind="company" target={companyId} />
        </TabsContent>
      </Tabs>
    </article>
  );
}
