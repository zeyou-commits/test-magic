import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { newsKinds } from "@/lib/ferry/flash";
import { formatDateParts } from "@/lib/ferry/format";
import {
  newsDay,
  newsDeparturesQuery,
  newsFeedQuery,
  newsIdFromSlug,
  newsPath,
} from "@/lib/ferry/newsFeed";
import { portsQuery, routesQuery, vesselsQuery } from "@/lib/ferry/queries";
import { portTimeZone } from "@/lib/ferry/time";
import { absoluteUrl, jsonLdString, seoHead } from "@/lib/seo/site";

export const Route = createFileRoute("/actualites/$slug")({
  loader: async ({ context, params }) => {
    const [items] = await Promise.all([
      context.queryClient.ensureQueryData(newsFeedQuery),
      context.queryClient.ensureQueryData(vesselsQuery),
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
  const id = newsIdFromSlug(slug);
  const item = items.find((entry) => entry.id === id);
  if (!item) return null;
  const path = newsPath(item);
  const vessel = vessels.find((entry) => entry.id === item.vessel_id);
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
      <article className="mt-6 max-w-3xl">
        <span className="bw-news-kind" data-kind={item.kind}>
          {newsKinds[item.kind].label}
        </span>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          {item.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          <time dateTime={item.starts_at}>{newsDay(item.starts_at)}</time>
        </p>
        <p className="mt-6 text-lg leading-relaxed">{item.summary}</p>
        <NewsImpact ids={item.departure_ids} />
        {item.source_url ? (
          // Aperçu de l'article d'origine : son titre, quelques mots, et le lien pour le lire en entier.
          <aside className="bw-news-source" aria-label="Article d’origine">
            <span className="bw-news-source__meta">
              Source · {item.source_name || new URL(item.source_url).hostname}
              {item.source_published_at ? ` · ${newsDay(item.source_published_at)}` : ""}
            </span>
            {item.source_title ? <strong>{item.source_title}</strong> : null}
            {item.source_excerpt ? <blockquote>« {item.source_excerpt} »</blockquote> : null}
            <a href={item.source_url} target="_blank" rel="noopener noreferrer nofollow">
              Lire l’article{item.source_name ? ` sur ${item.source_name}` : ""}
              <ExternalLink size={15} aria-hidden />
            </a>
          </aside>
        ) : null}
        <div className="bw-news-empty mt-8 text-left">
          <h2 className="text-lg font-bold">Vous voyagez bientôt ?</h2>
          <p className="mt-2 text-muted-foreground">
            Seule la compagnie confirme un départ. Vérifiez votre traversée avant de prendre la
            route.
          </p>
          <p className="mt-3 flex flex-wrap gap-4 font-semibold">
            <Link to="/horaires" className="text-primary underline underline-offset-4">
              Départs et arrivées
            </Link>
            {vessel?.slug ? (
              <Link
                to="/bateaux/$slug"
                params={{ slug: vessel.slug }}
                className="text-primary underline underline-offset-4"
              >
                Le navire {vessel.name}
              </Link>
            ) : null}
            <Link to="/actualites" className="text-primary underline underline-offset-4">
              Toutes les actualités
            </Link>
          </p>
        </div>
      </article>
    </SiteLayout>
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
