import { PlaceReactions } from "@/components/panel/PlaceReactions";
import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { seoHead } from "@/lib/seo/site";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, ExternalLink, MapPin, Route as RouteIcon, Ship, Star, Users } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import type { Company, RouteLine, Vessel } from "@/lib/ferry/types";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { formatDuration } from "@/lib/ferry/format";

const title = "Compagnies de ferry Europe ↔ Algérie — BledWay";
const description =
  "Les compagnies maritimes qui relient l'Europe à l'Algérie : lignes desservies, flotte et durées de traversée.";

export const Route = createFileRoute("/compagnies")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(portsQuery),
      context.queryClient.ensureQueryData(routesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
    ]);
  },
  head: () => seoHead(title, description, "/compagnies"),
  component: CompagniesPage,
});

function largest(fleet: Vessel[]) {
  return [...fleet].sort((a, b) => (b.passenger_capacity ?? 0) - (a.passenger_capacity ?? 0))[0];
}

function CompagniesPage() {
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const [from, setFrom] = useState("");
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const linesOf = (company: Company) =>
    routes.filter(
      (route) =>
        route.company_ids.includes(company.id) && (!from || route.departure_port_id === from),
    );
  // Les navires archivés depuis l'espace équipe ne sont plus présentés.
  const fleetOf = (company: Company) =>
    vessels.filter((vessel) => vessel.company_id === company.id && vessel.status === "active");
  const departures = [...new Set(routes.map((route) => route.departure_port_id))]
    .map((id) => ({ id, name: portName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const shown = companies.filter((company) => !from || linesOf(company).length);

  return (
    <SiteLayout>
      <header className="bw-co-head">
        <div>
          <h1>Les compagnies vers l'Algérie</h1>
          <p>Qui part d'où, avec quels navires, et ce qu'en disent les voyageurs.</p>
        </div>
        <label>
          <MapPin size={16} aria-hidden />
          <span className="sr-only">Je pars de</span>
          <select value={from} onChange={(event) => setFrom(event.target.value)}>
            <option value="">Je pars de : tous les ports</option>
            {departures.map((port) => (
              <option key={port.id} value={port.id}>
                Je pars de {port.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="bw-co-grid">
        {shown.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            lines={linesOf(company)}
            fleet={fleetOf(company)}
            portName={portName}
          />
        ))}
      </div>
      {shown.length > 1 ? (
        <section className="bw-co-compare" aria-label="Comparer les compagnies">
          <h2>En un coup d'œil</h2>
          <div>
            <table>
              <thead>
                <tr>
                  <th scope="col">Compagnie</th>
                  <th scope="col">Lignes</th>
                  <th scope="col">Navires</th>
                  <th scope="col">Plus grand navire</th>
                  <th scope="col">Passagers</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((company) => {
                  const fleet = fleetOf(company);
                  const big = largest(fleet);
                  return (
                    <tr key={company.id}>
                      <th scope="row">{company.name}</th>
                      <td>{linesOf(company).length}</td>
                      <td>{fleet.length}</td>
                      <td>{big?.name ?? "—"}</td>
                      <td>{big?.passenger_capacity?.toLocaleString("fr-FR") ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>Capacités générales, pas des places disponibles.</p>
        </section>
      ) : null}
    </SiteLayout>
  );
}

function CompanyCard({
  company,
  lines,
  fleet,
  portName,
}: {
  company: Company;
  lines: RouteLine[];
  fleet: Vessel[];
  portName: (id: string) => string;
}) {
  const big = largest(fleet);
  const photo = useQuery({ ...vesselPhotoQuery(big as Vessel), enabled: Boolean(big) }).data;
  const rating = useQuery(entityReviewsQuery("company", company.id)).data;
  const [failed, setFailed] = useState(false);
  const [allLines, setAllLines] = useState(false);
  const visibleLines = allLines ? lines : lines.slice(0, 6);
  return (
    <article className="bw-co-card">
      <div className="bw-co-card__photo">
        {photo?.url && !failed ? (
          <img
            src={photo.url}
            alt={big?.name ?? ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <Ship size={44} aria-hidden />
        )}
      </div>
      <div className="bw-co-card__body">
        <div className="bw-co-card__id">
          <CompanyBadge name={company.name} logoUrl={company.logo_url} size={52} />
          <div>
            <h2>{company.name}</h2>
            <span className="bw-co-card__rating">
              {rating?.count && rating.average != null ? (
                <>
                  <Star size={14} aria-hidden /> {rating.average.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/5 ·{" "}
                  {rating.count} avis
                </>
              ) : (
                "Pas encore d'avis"
              )}
            </span>
          </div>
        </div>
        <dl className="bw-co-card__stats">
          <div>
            <dt><Ship size={14} aria-hidden /> Navires</dt>
            <dd>{fleet.length}</dd>
          </div>
          <div>
            <dt><RouteIcon size={14} aria-hidden /> Lignes</dt>
            <dd>{lines.length}</dd>
          </div>
          <div>
            <dt><Users size={14} aria-hidden /> Jusqu'à</dt>
            <dd>{big?.passenger_capacity ? big.passenger_capacity.toLocaleString("fr-FR") : "—"}</dd>
          </div>
        </dl>
        {company.description ? <p className="bw-co-card__text">{company.description}</p> : null}
        {lines.length ? (
          <ul className="bw-co-card__lines" aria-label="Lignes">
            {visibleLines.map((route) => (
              <li key={route.id}>
                <Link to="/lignes/$slug" params={{ slug: route.slug }}>
                  {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                  <small>{formatDuration(route.typical_duration_minutes)}</small>
                </Link>
              </li>
            ))}
            {lines.length > 6 ? (
              <li>
                <button type="button" onClick={() => setAllLines((current) => !current)}>
                  {allLines ? "Moins de lignes" : `+ ${lines.length - 6} lignes`}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
        {fleet.length ? (
          <p className="bw-co-card__fleet">
            {fleet.map((vessel, index) => (
              <span key={vessel.id}>
                {index ? " · " : ""}
                <Link to="/" search={{ select: "vessel", id: vessel.id } as never}>
                  {vessel.name}
                </Link>{" "}
                <VesselAlertTag vesselId={vessel.id} />
              </span>
            ))}
          </p>
        ) : null}
        <footer className="bw-co-card__foot">
          <PlaceReactions kind="company" target={company.id} />
          <span>
            {company.website_url ? (
              <a href={company.website_url} target="_blank" rel="noreferrer">
                Site officiel <ExternalLink size={13} aria-hidden />
              </a>
            ) : null}
            <Link
              to="/"
              search={{ select: "company", id: company.id } as never}
              className="bw-co-card__open"
            >
              La fiche <ArrowRight size={14} aria-hidden />
            </Link>
          </span>
        </footer>
      </div>
    </article>
  );
}
