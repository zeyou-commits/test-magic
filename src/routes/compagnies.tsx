import { PlaceReactions } from "@/components/panel/PlaceReactions";
import { VesselAlertTag } from "@/components/panel/VesselAlert";
import { absoluteUrl, breadcrumbSchema, seoHead } from "@/lib/seo/site";
import { StructuredData } from "@/components/editorial/Editorial";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RateStars } from "@/components/panel/RateStars";
import { presetRating } from "@/lib/ferry/reviewCriteria";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleAlert,
  Clock,
  ExternalLink,
  MapPin,
  Repeat,
  Route as RouteIcon,
  Ship,
  Users,
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { FollowButton } from "@/components/panel/FollowButton";
import { entityReviewsQuery } from "@/lib/ferry/entityReviews";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import type { Company, Vessel } from "@/lib/ferry/types";
import {
  companiesQuery,
  portsQuery,
  routesQuery,
  upcomingDeparturesQuery,
  vesselsQuery,
} from "@/lib/ferry/queries";
import {
  companyOverview,
  ROTATION_WEEKS,
  type CompanyLine,
  type CompanyOverview,
} from "@/lib/ferry/companyOverview";
import { useVesselAlerts } from "@/lib/ferry/vesselAlerts";
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

const thisYear = new Date().getFullYear();
const number = (value: number) => value.toLocaleString("fr-FR");
const decimal = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Paris",
  });

function CompagniesPage() {
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: ports } = useSuspenseQuery(portsQuery);
  const { data: routes } = useSuspenseQuery(routesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  // Programmes lus côté client : les rotations s'affichent dès qu'ils arrivent.
  const departures = useQuery(upcomingDeparturesQuery());
  const [from, setFrom] = useState("");
  const portName = (id: string) => ports.find((item) => item.id === id)?.name ?? "—";
  const overviews = new Map(
    companies.map((company) => [
      company.id,
      companyOverview(company, vessels, routes, departures.data ?? []),
    ]),
  );
  const overviewOf = (company: Company) => overviews.get(company.id)!;
  const linesOf = (company: Company) =>
    overviewOf(company).lines.filter((line) => !from || line.route.departure_port_id === from);
  const departurePorts = [...new Set(routes.map((route) => route.departure_port_id))]
    .map((id) => ({ id, name: portName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const shown = companies.filter((company) => !from || linesOf(company).length);
  // Le secteur en chiffres, en tête de page (même esprit que la page Navires).
  const allFleet = companies.flatMap((company) => overviewOf(company).fleet);
  const built = allFleet.filter((vessel) => vessel.build_year);
  const sectorAge = built.length
    ? Math.round(
        built.reduce((total, vessel) => total + (thisYear - (vessel.build_year ?? thisYear)), 0) /
          built.length,
      )
    : null;
  const sector = [
    { icon: Building2, value: number(companies.length), label: "compagnies" },
    { icon: Ship, value: number(allFleet.length), label: "navires en service" },
    { icon: CalendarDays, value: sectorAge ? `${sectorAge} ans` : "—", label: "d'âge moyen" },
    { icon: RouteIcon, value: number(routes.length), label: "liaisons" },
    {
      icon: Repeat,
      value: departures.data
        ? number(Math.round(companies.reduce((t, c) => t + overviewOf(c).perWeek, 0)))
        : "—",
      label: "départs par semaine",
    },
    {
      icon: Users,
      value: number(allFleet.reduce((t, v) => t + (v.passenger_capacity ?? 0), 0)),
      label: "places passagers",
    },
  ];

  return (
    <SiteLayout>
      <StructuredData value={breadcrumbSchema([{ name: "Compagnies", path: "/compagnies" }])} />
      <StructuredData
        value={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Compagnies de ferry Europe ↔ Algérie",
          url: absoluteUrl("/compagnies"),
          inLanguage: "fr",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: companies.map((company, index) => ({
              "@type": "ListItem",
              position: index + 1,
              item: {
                "@type": "Organization",
                name: company.name,
                ...(company.website_url ? { url: company.website_url } : {}),
              },
            })),
          },
        }}
      />
      <header className="bw-co-head">
        <div>
          <h1>Les compagnies de ferry vers l'Algérie</h1>
          <p>Qui part d'où, avec quels navires, à quel rythme, et ce qu'en disent les voyageurs.</p>
        </div>
        <label>
          <MapPin size={16} aria-hidden />
          <span className="sr-only">Je pars de</span>
          <select value={from} onChange={(event) => setFrom(event.target.value)}>
            <option value="">Je pars de : tous les ports</option>
            {departurePorts.map((port) => (
              <option key={port.id} value={port.id}>
                Je pars de {port.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <section className="bw-fleet bw-cos-sector" aria-label="Les compagnies en chiffres">
        <dl className="bw-fleet__tiles">
          {sector.map((tile) => (
            <div key={tile.label}>
              <tile.icon size={20} aria-hidden />
              <dd>{tile.value}</dd>
              <dt>{tile.label}</dt>
            </div>
          ))}
        </dl>
      </section>
      <div className="bw-cos-list">
        {shown.map((company) => (
          <CompanySection
            key={company.id}
            company={company}
            overview={overviewOf(company)}
            lines={linesOf(company)}
            portName={portName}
            programmesReady={Boolean(departures.data)}
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
                  <th scope="col">Départs / semaine</th>
                  <th scope="col">Navires</th>
                  <th scope="col">Âge moyen</th>
                  <th scope="col">Navire phare</th>
                  <th scope="col">Passagers</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((company) => {
                  const overview = overviewOf(company);
                  return (
                    <tr key={company.id}>
                      <th scope="row">{company.name}</th>
                      <td>{linesOf(company).length}</td>
                      <td>{departures.data ? decimal(overview.perWeek) : "—"}</td>
                      <td>{overview.fleet.length}</td>
                      <td>{overview.averageAge != null ? `${overview.averageAge} ans` : "—"}</td>
                      <td>{overview.flagship?.name ?? "—"}</td>
                      <td>{overview.passengersMax?.toLocaleString("fr-FR") ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Capacités générales, pas des places disponibles. Départs par semaine : moyenne des
            programmes publiés sur les {ROTATION_WEEKS} prochaines semaines.
          </p>
        </section>
      ) : null}
    </SiteLayout>
  );
}

function CompanySection({
  company,
  overview,
  lines,
  portName,
  programmesReady,
}: {
  company: Company;
  overview: CompanyOverview;
  lines: CompanyLine[];
  portName: (id: string) => string;
  programmesReady: boolean;
}) {
  const { fleet, flagship } = overview;
  const photos = useQueries({ queries: fleet.map((vessel) => vesselPhotoQuery(vessel)) });
  const photoOf = (vessel: Vessel) => photos[fleet.indexOf(vessel)]?.data?.url ?? null;
  const rating = useQuery(entityReviewsQuery("company", company.id)).data;
  const alerts = useVesselAlerts();
  const inAlert = fleet.filter((vessel) => alerts.has(vessel.id));
  const [allLines, setAllLines] = useState(false);
  const navigate = useNavigate();
  // Étoile cliquée : la fiche de la compagnie s'ouvre sur ses avis, formulaire pré-rempli.
  const openCompany = () =>
    navigate({ to: "/", search: { select: "company", id: company.id } as never });
  const visibleLines = allLines ? lines : lines.slice(0, 6);
  const maxPerWeek = Math.max(1, ...lines.map((line) => line.perWeek));
  const heroPhoto = flagship ? photoOf(flagship) : null;
  const tiles = [
    { icon: Ship, value: number(fleet.length), label: fleet.length > 1 ? "navires" : "navire" },
    {
      icon: CalendarDays,
      value: overview.averageAge != null ? `${overview.averageAge} ans` : "—",
      label: "d'âge moyen",
    },
    { icon: RouteIcon, value: number(lines.length), label: lines.length > 1 ? "lignes" : "ligne" },
    {
      icon: Repeat,
      value: programmesReady ? decimal(overview.perWeek) : "—",
      label: "départs / semaine",
    },
    {
      icon: Users,
      value: overview.passengersMax ? number(overview.passengersMax) : "—",
      label: "passagers max",
    },
    {
      icon: Clock,
      value: overview.next ? shortDate(overview.next.departure_at) : programmesReady ? "—" : "…",
      label: "prochain départ",
    },
  ];
  return (
    <section className="bw-cos" aria-labelledby={`co-${company.id}`}>
      <div className="bw-cos__hero">
        <div className="bw-cos__photo">
          {heroPhoto ? (
            <img
              src={heroPhoto}
              alt={flagship?.name ?? ""}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Ship size={56} aria-hidden />
          )}
          {flagship ? (
            <span className="bw-cos__flagship">Navire phare · {flagship.name}</span>
          ) : null}
        </div>
        <div className="bw-cos__id">
          <CompanyBadge name={company.name} logoUrl={company.logo_url} size={60} />
          <h2 id={`co-${company.id}`}>{company.name}</h2>
          {company.description ? <p>{company.description}</p> : null}
          <RateStars
            average={rating?.average}
            count={rating?.count ?? 0}
            subject={company.name}
            size={17}
            onRate={(score) => {
              presetRating("company", company.id, score);
              openCompany();
            }}
            onOpen={openCompany}
          />
          <div className="bw-cos__actions">
            <FollowButton
              kind="company"
              targetId={company.id}
              label={company.name}
              demo={company.is_demo}
            />
            <Link
              to="/"
              search={{ select: "company", id: company.id } as never}
              className="bw-cos__open"
            >
              La fiche <ArrowRight size={15} aria-hidden />
            </Link>
            {company.website_url ? (
              <a
                href={company.website_url}
                target="_blank"
                rel="noreferrer"
                className="bw-cos__site"
              >
                Site officiel <ExternalLink size={13} aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      </div>
      <dl className="bw-cos__tiles">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <tile.icon size={17} aria-hidden />
            <dd>{tile.value}</dd>
            <dt>{tile.label}</dt>
          </div>
        ))}
      </dl>
      {inAlert.length ? (
        <p className="bw-cos__alert" role="status">
          <CircleAlert size={16} aria-hidden />
          {inAlert.map((vessel) => `${vessel.name} : ${alerts.get(vessel.id)?.label}`).join(" · ")}
          <span> · départs à vérifier auprès de la compagnie</span>
        </p>
      ) : null}
      {fleet.length ? (
        <div className="bw-cos__block">
          <h3>La flotte</h3>
          <ul className="bw-cos__fleet">
            {[...fleet]
              .sort((a, b) => (b.passenger_capacity ?? 0) - (a.passenger_capacity ?? 0))
              .map((vessel) => (
                <li key={vessel.id}>
                  <Link to="/" search={{ select: "vessel", id: vessel.id } as never}>
                    <span className="bw-cos__vphoto">
                      {photoOf(vessel) ? (
                        <img
                          src={photoOf(vessel)!}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Ship size={30} aria-hidden />
                      )}
                    </span>
                    <strong>{vessel.name}</strong>
                    <small>
                      {vessel.build_year
                        ? `${vessel.build_year} · ${thisYear - vessel.build_year} ans`
                        : "Année à compléter"}
                    </small>
                    <small>
                      {[
                        vessel.passenger_capacity
                          ? `${number(vessel.passenger_capacity)} pass.`
                          : null,
                        vessel.car_capacity ? `${number(vessel.car_capacity)} véh.` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Capacités à compléter"}
                    </small>
                  </Link>
                  <VesselAlertTag vesselId={vessel.id} />
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      {lines.length ? (
        <div className="bw-cos__block">
          <h3>Les lignes et leur rythme</h3>
          <ul className="bw-cos__lines">
            {visibleLines.map(({ route, perWeek, next }) => (
              <li key={route.id}>
                <Link to="/lignes/$slug" params={{ slug: route.slug }}>
                  <span className="bw-cos__line">
                    {portName(route.departure_port_id)} → {portName(route.arrival_port_id)}
                    <small>{formatDuration(route.typical_duration_minutes)}</small>
                  </span>
                  <span className="bw-cos__rate" aria-hidden>
                    <i style={{ width: `${Math.max(3, (perWeek / maxPerWeek) * 100)}%` }} />
                  </span>
                  <span className="bw-cos__freq">
                    {!programmesReady
                      ? "…"
                      : perWeek
                        ? `${decimal(perWeek)} / sem.`
                        : "Pas de programme publié"}
                    {next ? <small>prochain {shortDate(next)}</small> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {lines.length > 6 ? (
            <button type="button" className="bw-cos__more" onClick={() => setAllLines((v) => !v)}>
              {allLines ? "Moins de lignes" : `+ ${lines.length - 6} lignes`}
            </button>
          ) : null}
        </div>
      ) : null}
      <footer className="bw-cos__foot">
        <PlaceReactions kind="company" target={company.id} />
      </footer>
    </section>
  );
}
