import { createFileRoute } from "@tanstack/react-router";
import { maritimeEntries } from "@/lib/seo/maritime-sitemap.server";
import { sitemapXml, xmlResponse } from "@/lib/seo/sitemap";
export const Route = createFileRoute("/sitemap-maritime.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return xmlResponse(sitemapXml(await maritimeEntries()));
        } catch {
          return new Response(
            "Catalogue maritime temporairement indisponible. Réessayez plus tard.",
            {
              status: 503,
              headers: {
                "content-type": "text/plain; charset=utf-8",
                "cache-control": "no-store",
                "retry-after": "300",
              },
            },
          );
        }
      },
    },
  },
});
