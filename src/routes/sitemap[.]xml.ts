import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const staticPaths = [
  "/",
  "/horaires",
  "/ports",
  "/lignes",
  "/compagnies",
  "/guide",
  "/a-propos",
  "/contact",
  "/mentions-legales",
  "/confidentialite",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const [ports, routes] = await Promise.all([
          supabase.from("ports").select("slug, updated_at").neq("status", "draft"),
          supabase.from("routes").select("slug, updated_at").eq("status", "active"),
        ]);
        const urls = [
          ...staticPaths.map((path) => ({ path, lastmod: null as string | null })),
          ...(ports.data ?? []).map((port) => ({
            path: `/ports/${port.slug}`,
            lastmod: port.updated_at,
          })),
          ...(routes.data ?? []).map((route) => ({
            path: `/lignes/${route.slug}`,
            lastmod: route.updated_at,
          })),
        ];
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ({ path, lastmod }) =>
      `  <url><loc>${origin}${path}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}<changefreq>${
        path === "/" || path === "/horaires" ? "daily" : "weekly"
      }</changefreq></url>`,
  )
  .join("\n")}
</urlset>`;
        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
