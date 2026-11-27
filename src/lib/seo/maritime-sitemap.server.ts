import { supabase } from "@/integrations/supabase/client";
import { isIndexableNews, newsFeedItems, newsPath } from "@/lib/ferry/newsFeed";
import { vesselDossiers } from "@/content/vessels";
import {
  maritimeLastmods,
  type SitemapDeparture,
  type SitemapPort,
  type SitemapRoute,
} from "./maritimeLastmod";

export async function maritimeEntries() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const size = 1000;
  async function readAll<T>(
    build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  ) {
    const all: T[] = [];
    for (let page = 0; page < 50; page++) {
      const { data, error } = await build(page * size, (page + 1) * size - 1);
      if (error) throw new Error("Catalogue maritime temporairement indisponible");
      const rows = (data ?? []) as T[];
      all.push(...rows);
      if (rows.length < size) return all;
    }
    throw new Error("Catalogue trop volumineux : partitionner le sitemap maritime");
  }
  try {
    const [ports, routes, departures, news, companies, vessels] = await Promise.all([
      readAll<SitemapPort>((from, to) =>
        supabase
          .from("ports")
          .select("id, slug, updated_at")
          .neq("status", "draft")
          .order("slug")
          .range(from, to)
          .abortSignal(controller.signal),
      ),
      readAll<SitemapRoute>((from, to) =>
        supabase
          .from("routes")
          .select("id, slug, updated_at, departure_port_id, arrival_port_id")
          .eq("status", "active")
          .order("slug")
          .range(from, to)
          .abortSignal(controller.signal),
      ),
      // Les horaires à venir rafraîchissent la date des pages Ligne et Port ; sans eux, la fiche suffit.
      readAll<SitemapDeparture>((from, to) =>
        supabase
          .from("departures")
          .select("route_id, updated_at")
          .gte("departure_at", new Date().toISOString())
          .order("departure_at")
          .range(from, to)
          .abortSignal(controller.signal),
      ).catch(() => [] as SitemapDeparture[]),
      newsFeedItems().catch(() => []),
      readAll<{ slug: string; updated_at: string }>((from, to) =>
        supabase
          .from("companies")
          .select("slug, updated_at")
          .eq("status", "active")
          .order("slug")
          .range(from, to)
          .abortSignal(controller.signal),
      ).catch(() => [] as { slug: string; updated_at: string }[]),
      readAll<{ slug: string; updated_at: string }>((from, to) =>
        supabase
          .from("vessels")
          .select("slug, updated_at")
          .eq("status", "active")
          .order("slug")
          .range(from, to)
          .abortSignal(controller.signal),
      ).catch(() => [] as { slug: string; updated_at: string }[]),
    ]);
    // Les navires à dossier rédigé sont déjà dans le sitemap des pages.
    const dossiers = new Set(vesselDossiers.map((v) => v.slug));
    return [
      ...maritimeLastmods({ ports, routes, departures }),
      ...news.filter(isIndexableNews).map((item) => ({ path: newsPath(item), lastmod: item.starts_at })),
      ...companies.map((c) => ({ path: `/compagnies/${encodeURIComponent(c.slug)}`, lastmod: c.updated_at })),
      ...vessels
        .filter((v) => !dossiers.has(v.slug))
        .map((v) => ({ path: `/bateaux/${encodeURIComponent(v.slug)}`, lastmod: v.updated_at })),
    ];
  } finally {
    clearTimeout(timeout);
  }
}
