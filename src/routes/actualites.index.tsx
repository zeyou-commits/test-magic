import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Newspaper } from "lucide-react";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { newsKinds, type NewsItem } from "@/lib/ferry/flash";
import { newsCompanyIds, newsDay, newsFeedQuery, newsPath, newsSlug } from "@/lib/ferry/newsFeed";
import { companiesQuery, vesselsQuery } from "@/lib/ferry/queries";
import type { Company, Vessel } from "@/lib/ferry/types";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import { absoluteUrl, jsonLdString, seoHead } from "@/lib/seo/site";

const title = "Actualités des ferries Europe ↔ Algérie | BledWay";
const description =
  "Perturbations, navires, ports et compagnies : les informations utiles aux traversées entre l'Europe et l'Algérie, datées et avec leur source.";

export const Route = createFileRoute("/actualites/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(newsFeedQuery),
      context.queryClient.ensureQueryData(companiesQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
    ]);
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
          title: "Actualités BledWay",
          href: absoluteUrl("/actualites.xml"),
        },
      ],
    };
  },
  component: NewsPage,
});

const FILTERS = [
  { id: "all", label: "Tout" },
  ...Object.entries(newsKinds).map(([id, kind]) => ({ id, label: kind.label })),
];

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));

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
        <CompanyBadge key={company.id} name={company.name} logoUrl={company.logo_url} size={34} />
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
      <CompanyBadge name={company.name} logoUrl={company.logo_url} size={88} />
    </span>
  ) : null;
}

function NewsPage() {
  const { data: items } = useSuspenseQuery(newsFeedQuery);
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const [filter, setFilter] = useState("all");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const companiesOf = (item: NewsItem) =>
    newsCompanyIds(item, vessels)
      .map((id) => companies.find((company) => company.id === id))
      .filter((company): company is Company => Boolean(company));
  const present = companies.filter((company) =>
    items.some((item) => newsCompanyIds(item, vessels).includes(company.id)),
  );
  const shown = items.filter(
    (item) =>
      (filter === "all" || item.kind === filter) &&
      (!companyId || newsCompanyIds(item, vessels).includes(companyId)),
  );
  const [lead, ...rest] = shown;
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
      <Breadcrumbs items={[{ name: "Actualités", path: "/actualites" }]} />
      <PageHero
        overline="Actualités"
        title="Ce qui bouge sur la route du bled"
        intro="Navires, ports, compagnies, perturbations : l'essentiel pour vos traversées entre l'Europe et l'Algérie, daté et avec sa source."
      />
      {items.length ? (
        <div className="bw-news-filters" role="group" aria-label="Filtrer les actualités">
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
        <div className="bw-news-companies" role="group" aria-label="Filtrer par compagnie">
          {present.map((company) => (
            <button
              key={company.id}
              type="button"
              aria-pressed={companyId === company.id}
              onClick={() => setCompanyId(companyId === company.id ? null : company.id)}
            >
              <CompanyBadge name={company.name} logoUrl={company.logo_url} size={28} />
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
              {newsDay(lead.starts_at)}
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
            {items.length ? "Rien dans cette sélection" : "Les premières actualités arrivent"}
          </h2>
          <p className="mt-2 text-muted-foreground">
            En attendant, consultez les{" "}
            <Link to="/horaires" className="font-semibold text-primary underline">
              départs et arrivées
            </Link>
            .
          </p>
        </div>
      )}
      {rest.length ? (
        <div className="bw-news-grid">
          {rest.map((item) => (
            <Link
              key={item.id}
              to="/actualites/$slug"
              params={{ slug: newsSlug(item) }}
              className="bw-news-tile"
            >
              <span className="bw-news-tile__top">
                <Logos companies={companiesOf(item)} />
                <span className="bw-news-kind" data-kind={item.kind}>
                  {newsKinds[item.kind].label}
                </span>
                <time dateTime={item.starts_at}>{shortDay(item.starts_at)}</time>
              </span>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <span className="bw-news-tile__foot">
                <span>{item.source_name}</span>
                <span className="bw-news-tile__more">
                  Lire <ArrowRight size={14} aria-hidden />
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </SiteLayout>
  );
}
