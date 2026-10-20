import { createFileRoute } from "@tanstack/react-router";
import { staticSitemapEntries } from "@/lib/seo/paths";
import { sitemapXml, xmlResponse } from "@/lib/seo/sitemap";
export const Route = createFileRoute("/sitemap-pages.xml")({
  server: { handlers: { GET: () => xmlResponse(sitemapXml(staticSitemapEntries)) } },
});
