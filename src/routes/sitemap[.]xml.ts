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
          supabase.from("ports").select("slug").neq("status", "draft"),
          supabase.from("routes").select("slug").eq("status", "active"),
        ]);
        const urls = [
          ...staticPaths,
          ...(ports.data ?? []).map((port) => `/ports/${port.slug}`),
          ...(routes.data ?? []).map((route) => `/lignes/${route.slug}`),
        ];
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (path) =>
      `  <url><loc>${origin}${path}</loc><changefreq>${
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
