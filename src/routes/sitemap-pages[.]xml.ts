import { createFileRoute } from "@tanstack/react-router";
import { staticSitemapEntries } from "@/lib/seo/paths";
import { maritimeEntries } from "@/lib/seo/maritime-sitemap.server";
import { sitemapXml, xmlResponse } from "@/lib/seo/sitemap";

/** Date la plus récente du catalogue maritime (horaires, lignes, ports, actualités), sinon aucune. */
async function latestMaritimeDate() {
  try {
    const dates = (await maritimeEntries())
      .map((e) => e.lastmod)
      .filter((d): d is string => Boolean(d) && !Number.isNaN(Date.parse(d)));
    if (!dates.length) return null;
    const now = Date.now();
    // Une actualité programmée ne doit pas dater une page dans le futur.
    const past = dates.map((d) => Math.min(Date.parse(d), now));
    return new Date(Math.max(...past)).toISOString();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/sitemap-pages.xml")({
  server: {
    handlers: {
      GET: async () => {
        const live = await latestMaritimeDate();
        return xmlResponse(
          sitemapXml(staticSitemapEntries.map((e) => (e.live ? { path: e.path, lastmod: live } : e))),
        );
      },
    },
  },
});
