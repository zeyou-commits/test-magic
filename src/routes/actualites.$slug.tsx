import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { newsKinds } from "@/lib/ferry/flash";
import { newsDay, newsFeedQuery, newsIdFromSlug, newsPath } from "@/lib/ferry/newsFeed";
import { vesselsQuery } from "@/lib/ferry/queries";
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
        {item.source_url ? (
          <p className="mt-6">
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-2 font-semibold text-primary underline underline-offset-4"
            >
              Lire la source{item.source_name ? ` : ${item.source_name}` : ""}
              <ExternalLink size={15} aria-hidden />
            </a>
          </p>
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
