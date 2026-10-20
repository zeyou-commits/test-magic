import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl } from "@/lib/seo/site";
import { escapeXml, xmlResponse } from "@/lib/seo/sitemap";
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        xmlResponse(
          `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/sitemap-pages.xml", "/sitemap-maritime.xml"].map((path) => `  <sitemap><loc>${escapeXml(absoluteUrl(path))}</loc></sitemap>`).join("\n")}\n</sitemapindex>`,
        ),
    },
  },
});
