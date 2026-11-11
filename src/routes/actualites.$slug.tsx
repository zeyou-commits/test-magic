import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, Newspaper, Ship } from "lucide-react";
import { CompanyBadge } from "@/components/panel/CompanyBadge";
import { ShareButtons } from "@/components/panel/ShareButtons";
import { vesselPhotoQuery } from "@/lib/ferry/vesselPhoto";
import type { Company, Vessel } from "@/lib/ferry/types";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { newsKinds, type NewsItem } from "@/lib/ferry/flash";
import { formatDateParts } from "@/lib/ferry/format";
import {
  newsDay,
  newsDeparturesQuery,
  newsFeedQuery,
  newsCompanyIds,
  newsIdFromSlug,
  newsPath,
  newsSlug,
} from "@/lib/ferry/newsFeed";
import { companiesQuery, portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import { absoluteUrl, jsonLdString, seoHead } from "@/lib/seo/site";

export const Route = createFileRoute("/actualites/$slug")({
  loader: async ({ context, params }) => {
    const [items] = await Promise.all([
      context.queryClient.ensureQueryData(newsFeedQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
      context.queryClient.ensureQueryData(companiesQuery),
    ]);
    const id = newsIdFromSlug(params.slug);
    const item = items.find((entry) => entry.id === id);
    if (!item) throw notFound();
    return { title: item.title, summary: item.summary, path: newsPath(item) };
  },
  head: ({ loaderData }) =>
    loaderData
      ? seoHead(`${loaderData.title} | BledWay`, loaderData.summary, loaderData.path, true)
      : {},
  component: NewsArticlePage,
});

function NewsArticlePage() {
  const { slug } = Route.useParams();
  const { data: items } = useSuspenseQuery(newsFeedQuery);
  const { data: vessels } = useSuspenseQuery(vesselsQuery);
  const { data: companies = [] } = useQuery(companiesQuery);
  const id = newsIdFromSlug(slug);
  const item = items.find((entry) => entry.id === id);
  if (!item) return null;
  const path = newsPath(item);
  const vessel = vessels.find((entry) => entry.id === item.vessel_id);
  const companiesOf = (entry: NewsItem) =>
    newsCompanyIds(entry, vessels, companies)
      .map((cid) => companies.find((company) => company.id === cid))
      .filter((company): company is Company => Boolean(company));
  const ownCompanies = companiesOf(item);
  const others = items.filter((entry) => entry.id !== item.id);
  // « À lire aussi » : même navire ou même compagnie d'abord, puis les plus récentes.
  const ownIds = new Set(ownCompanies.map((company) => company.id));
  const related = [
    ...others.filter(
      (entry) =>
        (item.vessel_id && entry.vessel_id === item.vessel_id) ||
        companiesOf(entry).some((company) => ownIds.has(company.id)),
    ),
    ...others,
  ].filter((entry, index, list) => list.findIndex((x) => x.id === entry.id) === index).slice(0, 3);
  const latest = others.slice(0, 5);
  const minutes = Math.max(1, Math.round(`${item.title} ${item.summary} ${item.source_excerpt ?? ""}`.split(/\s+/).length / 200));
  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title.slice(0, 110),
    description: item.summary,
    datePublished: item.starts_at,
    mainEntityOfPage: absoluteUrl(path),
    image: absoluteUrl("/bledway-brand.png"),
    author: { "@type": "Organization", name: "BledWay", url: absoluteUrl("/") },
    publisher: { "@type": "Organization", name: "BledWay", url: absoluteUrl("/") },
    ...(item.source_url ? { isBasedOn: item.source_url } : {}),
  };
  return (
    <SiteLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }}
      />
      <Breadcrumbs
        items={[
          { name: "Actualités", path: "/actualites" },
          { name: item.title, path },
        ]}
      />
      <header className="bw-article__hero" data-kind={item.kind}>
        <div className="bw-article__hero-text">
          <span className="bw-news-kind" data-kind={item.kind}>
            {newsKinds[item.kind].label}
          </span>
          <h1>{item.title}</h1>
          <p className="bw-article__meta">
            {ownCompanies.length ? (
              <span className="bw-article__brands">
                {ownCompanies.slice(0, 2).map((company) => (
                  <CompanyBadge key={company.id} name={company.name} logoUrl={company.logo_url} size={28} />
                ))}
                <b>{ownCompanies.map((company) => company.name).join(", ")}</b>
              </span>
            ) : null}
            <time dateTime={item.starts_at}>{newsDay(item.starts_at)}</time>
            <span>{minutes} min de lecture</span>
          </p>
        </div>
        <HeroVisual vessel={vessel} company={ownCompanies[0]} />
      </header>

      <div className="bw-article__layout">
        <article className="bw-article__body">
          <p className="bw-article__lead">{item.summary}</p>
          <NewsImpact ids={item.departure_ids} />
          {item.source_url ? (
            // Aperçu de l'article d'origine : son titre, quelques mots, et le lien pour le lire en entier.
            <aside className="bw-news-source" aria-label="Article d’origine">
              <span className="bw-news-source__meta">
                Source · {item.source_name || new URL(item.source_url).hostname}
                {item.source_published_at ? ` · ${newsDay(item.source_published_at)}` : ""}
              </span>
              {item.source_title ? <strong>{item.source_title}</strong> : null}
              {/* Garde-fou : jamais de balise HTML brute à l'écran (la base nettoie déjà). */}
              {item.source_excerpt && !/<[a-z/]/i.test(item.source_excerpt) ? (
                <blockquote>« {item.source_excerpt} »</blockquote>
              ) : null}
              <a href={item.source_url} target="_blank" rel="noopener noreferrer nofollow">
                Lire l’article{item.source_name ? ` sur ${item.source_name}` : ""}
                <ExternalLink size={15} aria-hidden />
              </a>
              {item.extra_sources.length ? (
                // Le même sujet relayé ailleurs : une seule actu, toutes ses sources.
                <p className="bw-news-source__more">
                  Aussi relayé par{" "}
                  {item.extra_sources.map((source, index) => (
                    <span key={source.url}>
                      {index ? ", " : ""}
                      <a href={source.url} target="_blank" rel="noopener noreferrer nofollow">
                        {source.name || new URL(source.url).hostname}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}
            </aside>
          ) : null}
          <div className="bw-article__share">
            <span>Utile pour un proche qui voyage ?</span>
            <ShareButtons title={item.title} text={item.summary} getUrl={() => absoluteUrl(path)} />
          </div>
          <div className="bw-article__cta">
            <Ship size={22} aria-hidden />
            <div>
              <h2>Vous voyagez bientôt ?</h2>
              <p>Seule la compagnie confirme un départ. Suivez votre traversée sur BledWay : changements, navire en direct et salon des passagers.</p>
              <p className="bw-article__cta-links">
                <Link to="/horaires">Départs et arrivées</Link>
                {vessel?.slug ? (
                  <Link to="/bateaux/$slug" params={{ slug: vessel.slug }}>
                    Le navire {vessel.name}
                  </Link>
                ) : null}
              </p>
            </div>
          </div>
        </article>

        {latest.length ? (
          <aside className="bw-article__side" aria-label="Dernières actualités">
            <h2>Dernières actualités</h2>
            <ol>
              {latest.map((entry) => (
                <li key={entry.id}>
                  <Link to="/actualites/$slug" params={{ slug: newsSlug(entry) }}>
                    <i data-kind={entry.kind} aria-hidden />
                    <span>
                      <strong>{entry.title}</strong>
                      <small>{newsDay(entry.starts_at)}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <Link to="/actualites" className="bw-article__all">
              Toutes les actualités <ArrowRight size={14} aria-hidden />
            </Link>
          </aside>
        ) : null}
      </div>

      {related.length ? (
        <section className="bw-article__related" aria-label="À lire aussi">
          <h2>À lire aussi</h2>
          <div className="bw-news-grid">
            {related.map((entry) => (
              <Link key={entry.id} to="/actualites/$slug" params={{ slug: newsSlug(entry) }} className="bw-news-tile">
                <span className="bw-news-tile__top">
                  <span className="bw-news-kind" data-kind={entry.kind}>
                    {newsKinds[entry.kind].label}
                  </span>
                  <time dateTime={entry.starts_at}>{newsDay(entry.starts_at)}</time>
                </span>
                <h3>{entry.title}</h3>
                <p>{entry.summary}</p>
                <span className="bw-news-tile__foot">
                  <span>{entry.source_name}</span>
                  <span className="bw-news-tile__more">
                    Lire <ArrowRight size={14} aria-hidden />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </SiteLayout>
  );
}

/** Le visuel d'en-tête : la photo du navire concerné, sinon le logo de la compagnie, sinon le ferry BledWay. */
function HeroVisual({ vessel, company }: { vessel?: Vessel | undefined; company?: Company | undefined }) {
  const photo = useQuery({
    ...vesselPhotoQuery(vessel ?? ({ id: "" } as Vessel)),
    enabled: Boolean(vessel),
  }).data;
  if (photo?.url) return <img className="bw-article__photo" src={photo.url} alt={vessel?.name ?? ""} />;
  return (
    <span className="bw-article__mark" aria-hidden>
      {company ? (
        <CompanyBadge name={company.name} logoUrl={company.logo_url} size={72} tone="dark" />
      ) : (
        <Newspaper size={56} />
      )}
    </span>
  );
}

const STATUS: Record<string, string> = {
  scheduled: "Prévue",
  modified: "Modifiée",
  cancelled: "Annulée",
};

/** Les traversées concernées, chacune ouverte sur BledWay (suivi, horaires à jour, salon). */
function NewsImpact({ ids }: { ids: string[] }) {
  const departures = useQuery(newsDeparturesQuery(ids)).data ?? [];
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  if (!ids.length || !departures.length) return null;
  return (
    <section className="bw-news-impact" aria-label="Traversées concernées">
      <h2>
        {departures.length > 1
          ? `${departures.length} traversées concernées`
          : "La traversée concernée"}
      </h2>
      <p>Ouvrez la vôtre pour voir son suivi et ses horaires à jour sur BledWay.</p>
      <ul>
        {departures.map((departure) => {
          const route = routes.find((entry) => entry.id === departure.route_id);
          const from = ports.find((port) => port.id === route?.departure_port_id);
          const to = ports.find((port) => port.id === route?.arrival_port_id);
          const parts = formatDateParts(departure.departure_at, portTimeZone(from));
          const vessel = vessels.find((entry) => entry.id === departure.vessel_id);
          return (
            <li key={departure.id}>
              <Link
                to="/"
                search={{ select: "departure", id: departure.id } as never}
                className="bw-news-impact__item"
              >
                <span>
                  <strong>
                    {from?.name ?? "?"} → {to?.name ?? "?"}
                  </strong>
                  <small>
                    {parts.weekday} {parts.shortDate} · {parts.time}
                    {from ? ` (heure de ${from.name})` : ""}
                    {vessel ? ` · ${vessel.name}` : ""}
                  </small>
                </span>
                <b data-status={departure.status}>{STATUS[departure.status] ?? "Prévue"}</b>
                <ArrowRight size={16} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <small className="bw-news-impact__note">
        Seule la compagnie confirme un départ : vérifiez aussi auprès d’elle.
      </small>
    </section>
  );
}
