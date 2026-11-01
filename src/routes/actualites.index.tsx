import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Breadcrumbs } from "@/components/editorial/Editorial";
import { PageHero, SiteLayout } from "@/components/layout/SiteLayout";
import { newsKinds, type NewsItem } from "@/lib/ferry/flash";
import { newsDay, newsFeedQuery, newsPath, newsSlug } from "@/lib/ferry/newsFeed";
import { absoluteUrl, jsonLdString, seoHead } from "@/lib/seo/site";

const title = "Actualités des ferries Europe ↔ Algérie | BledWay";
const description =
  "Perturbations, navires, ports et compagnies : les informations utiles aux traversées entre l'Europe et l'Algérie, datées et avec leur source.";

export const Route = createFileRoute("/actualites/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(newsFeedQuery);
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

function Meta({ item }: { item: NewsItem }) {
  return (
    <span className="bw-news-meta">
      {newsDay(item.starts_at)}
      {item.source_name ? ` · ${item.source_name}` : ""}
    </span>
  );
}

function NewsPage() {
  const { data: items } = useSuspenseQuery(newsFeedQuery);
  const [filter, setFilter] = useState("all");
  const shown = items.filter((item) => filter === "all" || item.kind === filter);
  const [lead, ...rest] = shown;
  const days = [...new Set(rest.map((item) => newsDay(item.starts_at)))];
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
      {lead ? (
        <Link to="/actualites/$slug" params={{ slug: newsSlug(lead) }} className="bw-news-lead">
          <span className="bw-news-kind" data-kind={lead.kind}>
            {newsKinds[lead.kind].label}
          </span>
          <h2>{lead.title}</h2>
          <p>{lead.summary}</p>
          <Meta item={lead} />
        </Link>
      ) : (
        <div className="bw-news-empty">
          <h2 className="text-lg font-bold">
            {items.length ? "Rien dans cette catégorie" : "Les premières actualités arrivent"}
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
      {days.map((day) => (
        <section key={day}>
          <h2 className="bw-news-day">{day}</h2>
          {rest
            .filter((item) => newsDay(item.starts_at) === day)
            .map((item) => (
              <Link
                key={item.id}
                to="/actualites/$slug"
                params={{ slug: newsSlug(item) }}
                className="bw-news-card"
              >
                <span className="bw-news-kind" data-kind={item.kind}>
                  {newsKinds[item.kind].label}
                </span>
                <h3>{item.title}</h3>
                <p className="text-muted-foreground">{item.summary}</p>
                {item.source_name ? <span className="bw-news-meta">{item.source_name}</span> : null}
              </Link>
            ))}
        </section>
      ))}
    </SiteLayout>
  );
}
