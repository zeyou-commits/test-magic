import { createFileRoute } from "@tanstack/react-router";
import { newsFeedItems, newsPath } from "@/lib/ferry/newsFeed";
import { absoluteUrl } from "@/lib/seo/site";
import { escapeXml } from "@/lib/seo/sitemap";

// Flux RSS : les lecteurs de flux, les agrégateurs et les moteurs d'IA suivent les actualités ici.
export const Route = createFileRoute("/actualites.xml")({
  server: {
    handlers: {
      GET: async () => {
        const items = await newsFeedItems().catch(() => []);
        const entries = items
          .slice(0, 50)
          .map(
            (item) =>
              `<item><title>${escapeXml(item.title)}</title><link>${escapeXml(absoluteUrl(newsPath(item)))}</link><guid isPermaLink="false">${item.id}</guid><pubDate>${new Date(item.starts_at).toUTCString()}</pubDate><description>${escapeXml(item.summary)}</description></item>`,
          )
          .join("");
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Actualités BledWay</title><link>${escapeXml(absoluteUrl("/actualites"))}</link><description>Ferries Europe ↔ Algérie : navires, ports, compagnies et perturbations.</description><language>fr</language>${entries}</channel></rss>`,
          {
            headers: {
              "content-type": "application/rss+xml; charset=utf-8",
              "cache-control": "public, max-age=300, s-maxage=300",
            },
          },
        );
      },
    },
  },
});
