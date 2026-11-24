import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, Anchor, ArrowRight, Archive, ChevronDown, Newspaper } from "lucide-react";
import { incidentHeadline, incidentsQuery } from "@/lib/ferry/incidents";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { newsKinds, type NewsItem } from "@/lib/ferry/flash";
import {
  newsAgo,
  newsCompanyIds,
  newsDay,
  newsDeparturesQuery,
  newsFeedQuery,
  newsIsFresh,
  newsIsOver,
  newsLastDepartures,
  newsPath,
  newsSlug,
} from "@/lib/ferry/newsFeed";
import { companiesQuery, portsQuery, vesselsQuery } from "@/lib/ferry/queries";
import type { Company, Vessel } from "@/lib/ferry/types";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { absoluteUrl, jsonLdString, seoHead } from "@/lib/seo/site";
import { tr } from "@/lib/i18n";

const title = "Actualités des ferries Europe ↔ Algérie | BledWay";
const description =
  "Perturbations, navires, ports et compagnies : les informations utiles aux traversées entre l'Europe et l'Algérie, datées et avec leur source.";

export const Route = createFileRoute("/actualites/")({
  loader: async ({ context }) => {
    const [items] = await Promise.all([
      context.queryClient.ensureQueryData(newsFeedQuery),
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
    ]);
    // Les traversées citées disent quand une annonce est terminée : chargées avant l'affichage.
    const ids = citedDepartureIds(items);
    if (ids.length) await context.queryClient.ensureQueryData(newsDeparturesQuery(ids));
  },
  head: () => {
    const base = seoHead(title, description, "/actualites");
    return {
      ...base,
      links: [
        ...base.links,
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: tr("ui.pageActualitesIndex.actualitesBledway"),
          href: absoluteUrl("/actualites.xml"),
        },
      ],
    };
  },
  component: NewsPage,
});

const FILTERS = [
  { id: "all", get label() { return tr("ui.pageActualitesIndex.tout"); } },
  ...Object.entries(newsKinds).map(([id, kind]) => ({ id, label: kind.label })),
];

const citedDepartureIds = (items: NewsItem[]) =>
  [...new Set(items.flatMap((item) => item.departure_ids))].sort();

/** Les logos des compagnies concernées, ou un pictogramme pour une info générale. */
function Logos({ companies }: { companies: Company[] }) {
  if (!companies.length)
    return (
      <span className="bw-news-logo-empty" aria-hidden>
        <Newspaper size={18} />
      </span>
    );
  return (
    <span className="bw-news-logos">
      {companies.slice(0, 3).map((company) => (
        <CompanyBadge key={company.id} name={company.name} logoUrl={company.logo_url} size={40} />
      ))}
    </span>
  );
}

/** L'aperçu de la une : la photo du navire concerné, si elle existe. */
function LeadPhoto({
  vessel,
  company,
}: {
  vessel?: Vessel | undefined;
  company?: Company | undefined;
}) {
  const photo = useQuery({
    ...vesselPhotoQuery(vessel ?? ({ id: "" } as Vessel)),
    enabled: Boolean(vessel),
  }).data;
  if (photo?.url)
    return <img className="bw-news-lead__photo" src={photo.url} alt="" loading="lazy" />;
  return company ? (
    <span className="bw-news-lead__mark">
      <CompanyBadge name={company.name} logoUrl={company.logo_url} size={88} tone="dark" />
    </span>
  ) : null;
}

/**
 * En tête de page : ce qui est grave et en cours (navires immobilisés, alertes non levées).
 * Les salons concernés affichent la même info épinglée ; la page la réunit pour tout le monde.
 */
function SeriousNow({
  items,
  vessels,
  last,
}: {
  items: NewsItem[];
  vessels: Vessel[];
  last: Map<string, string>;
}) {
  const incidents = useQuery(incidentsQuery).data ?? [];
  const ports = useQuery(portsQuery).data ?? [];
  const now = Date.now();
  const blocked = incidents.filter((incident) => incident.status === "confirmed" || incident.status === "verifying");
  // Une alerte n'est « en cours » que tant que sa traversée n'est pas passée (ou sa fin posée).
  const alerts = items.filter(
    (item) => item.kind === "alerte" && !newsIsOver(item, last.get(item.id), now),
  );
  if (!blocked.length && !alerts.length) return null;
  return (
    <section className="bw-news-serious" aria-label={tr("ui.pageActualitesIndex.naviresImmobilisesEtAnnoncesGraves")}>
      {blocked.length ? (
        <div>
          <h2>
            <Anchor size={18} aria-hidden />{tr("ui.pageActualitesIndex.naviresImmobilises")}
          </h2>
          <ul>
            {blocked.map((incident) => {
              const vessel = vessels.find((item) => item.id === incident.vessel_id);
              const port = ports.find((item) => item.id === incident.location_port_id);
              const text = incidentHeadline(incident, vessel?.name ?? tr("ui.pageActualitesIndex.navire"), port?.name);
              return (
                <li key={incident.id} data-status={incident.status}>
                  {vessel ? (
                    <Link to="/bateaux/$slug" params={{ slug: vessel.slug }}>
                      {text}
                    </Link>
                  ) : (
                    <span>{text}</span>
                  )}
                  {incident.public_note ? <small>{incident.public_note}</small> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {alerts.length ? (
        <div>
          <h2>
            <AlertTriangle size={18} aria-hidden />{tr("ui.pageActualitesIndex.annoncesGravesEnCours")}
          </h2>
          <ul>
            {alerts.map((item) => (
              <li key={item.id}>
                <Link to="/actualites/$slug" params={{ slug: newsSlug(item) }}>
                  {item.title}
                </Link>
                <small>
                  {item.summary} <em>· {newsAgo(item.starts_at, now)}</em>
                </small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Une actualité en tuile : fraîcheur en clair, « Terminé » quand elle ne vaut plus. */
function NewsTile({
  item,
  companies,
  over,
}: {
  item: NewsItem;
  companies: Company[];
  over: boolean;
}) {
  const count = item.departure_ids.length;
  return (
    <Link
      to="/actualites/$slug"
      params={{ slug: newsSlug(item) }}
      className="bw-news-tile"
      data-over={over || undefined}
    >
      <span className="bw-news-tile__top">
        <Logos companies={companies} />
        <span className="bw-news-kind" data-kind={item.kind}>
          {newsKinds[item.kind].label}
        </span>
        {over ? <span className="bw-news-over">{tr("ui.pageActualitesIndex.termine")}</span> : null}
        <time dateTime={item.starts_at} title={newsDay(item.starts_at)}>
          {newsAgo(item.starts_at)}
        </time>
      </span>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <span className="bw-news-tile__foot">
        <span>
          {item.source_name}
          {count ? tr("ui.pageActualitesIndex.traverseeConcernee", { count, v: count > 1 ? "s" : "", v2: count > 1 ? "s" : "" }) : ""}
        </span>
        <span className="bw-news-tile__more">
          {tr("ui.pageActualitesIndex.lire")}
          <ArrowRight size={14} aria-hidden />
        </span>
      </span>
    </Link>
  );
}

function NewsPage() {
  const { data: items } = useSuspenseQuery(newsFeedQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const ids = useMemo(() => citedDepartureIds(items), [items]);
  const departures = useQuery(newsDeparturesQuery(ids)).data ?? [];
  const last = useMemo(() => newsLastDepartures(items, departures), [items, departures]);
  const [filter, setFilter] = useState("all");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const now = Date.now();
  const companiesOf = (item: NewsItem) =>
    newsCompanyIds(item, vessels, companies)
      .map((id) => companies.find((company) => company.id === id))
      .filter((company): company is Company => Boolean(company));
  const present = companies.filter((company) =>
    items.some((item) => newsCompanyIds(item, vessels, companies).includes(company.id)),
  );
  const shown = items.filter(
    (item) =>
      (filter === "all" || item.kind === filter) &&
      (!companyId || newsCompanyIds(item, vessels, companies).includes(companyId)),
  );
  // La une et la grille ne montrent que le récent : une annonce passée ne se lit plus comme d'actualité.
  const fresh = shown.filter((item) => newsIsFresh(item, last.get(item.id), now));
  const older = shown.filter((item) => !newsIsFresh(item, last.get(item.id), now));
  const [lead, ...rest] = fresh;
  const leadCompanies = lead ? companiesOf(lead) : [];
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Actualités des ferries Europe ↔ Algérie",
    description,
    url: absoluteUrl("/actualites"),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.slice(0, 30).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(newsPath(item)),
        name: item.title,
      })),
    },
  };
  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }}
      />
      <Breadcrumbs items={[{ name: tr("ui.pageActualitesIndex.actualites"), path: "/actualites" }]} />
      <PageHero
        compact
        overline={tr("ui.pageActualitesIndex.actualites")}
        title={tr("ui.pageActualitesIndex.ceQuiBougeSurLa")}
        intro={tr("ui.pageActualitesIndex.naviresPortsCompagniesPerturbationsL")}
      />
      <SeriousNow items={items} vessels={vessels} last={last} />
      {items.length ? (
        <div className="bw-news-filters" role="group" aria-label={tr("ui.pageActualitesIndex.filtrerLesActualites")}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {present.length ? (
        <div className="bw-news-companies" role="group" aria-label={tr("ui.pageActualitesIndex.filtrerParCompagnie")}>
          {present.map((company) => (
            <button
              key={company.id}
              type="button"
              aria-pressed={companyId === company.id}
              onClick={() => setCompanyId(companyId === company.id ? null : company.id)}
            >
              <CompanyBadge name={company.name} logoUrl={company.logo_url} size={34} />
              <span>{company.name}</span>
            </button>
          ))}
        </div>
      ) : null}
      {lead ? (
        <Link to="/actualites/$slug" params={{ slug: newsSlug(lead) }} className="bw-news-lead">
          <span className="bw-news-lead__text">
            <span className="bw-news-kind" data-kind={lead.kind}>
              {newsKinds[lead.kind].label}
            </span>
            <h2>{lead.title}</h2>
            <p>{lead.summary}</p>
            <span className="bw-news-meta">
              <b className="bw-news-ago">{newsAgo(lead.starts_at, now)}</b> · {newsDay(lead.starts_at)}
              {lead.source_name ? ` · ${lead.source_name}` : ""}
            </span>
          </span>
          <LeadPhoto
            vessel={vessels.find((vessel) => vessel.id === lead.vessel_id)}
            company={leadCompanies[0]}
          />
        </Link>
      ) : (
        <div className="bw-news-empty">
          <h2 className="text-lg font-bold">
            {older.length
              ? tr("ui.pageActualitesIndex.rienDeNouveauCesTrois")
              : items.length
                ? tr("ui.pageActualitesIndex.rienDansCetteSelection")
                : tr("ui.pageActualitesIndex.lesPremieresActualitesArrivent")}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {tr("ui.pageActualitesIndex.enAttendantConsultezLes")}{" "}
            <Link to="/horaires" className="font-semibold text-primary underline">
              {tr("ui.pageActualitesIndex.departsEtArrivees")}
            </Link>
            .
          </p>
        </div>
      )}
      {rest.length ? (
        <div className="bw-news-grid">
          {rest.map((item) => (
            <NewsTile key={item.id} item={item} companies={companiesOf(item)} over={false} />
          ))}
        </div>
      ) : null}
      {older.length ? (
        // Les plus anciennes restent consultables, repliées et marquées « Terminé » si elles ne valent plus.
        <details className="bw-news-older" open={!fresh.length}>
          <summary>
            <Archive size={18} aria-hidden />
            <span>
              <b>{tr("ui.pageActualitesIndex.plusAnciennes")}</b>
              <small>
                {older.length}{tr("ui.pageActualitesIndex.actualite")}{older.length > 1 ? "s" : ""}{tr("ui.pageActualitesIndex.dePlusDe3Semaines")}
                {older.length > 1 ? "s" : ""}
              </small>
            </span>
            <ChevronDown size={18} aria-hidden className="bw-news-older__chev" />
          </summary>
          <div className="bw-news-grid">
            {older.map((item) => (
              <NewsTile
                key={item.id}
                item={item}
                companies={companiesOf(item)}
                over={newsIsOver(item, last.get(item.id), now)}
              />
            ))}
          </div>
        </details>
      ) : null}
    </SiteLayout>
  );
}
