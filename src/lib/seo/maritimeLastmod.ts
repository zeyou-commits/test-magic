/** Lignes, ports et départs tels que lus pour le sitemap maritime. */
export type SitemapPort = { id: string; slug: string; updated_at: string };
export type SitemapRoute = {
  id: string;
  slug: string;
  updated_at: string;
  departure_port_id: string;
  arrival_port_id: string;
};
export type SitemapDeparture = { route_id: string; updated_at: string };

const latest = (a: string | undefined, b: string | undefined) =>
  !a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b;

/**
 * Date de dernière modification de chaque page Ligne et Port : la plus récente entre la fiche elle-même
 * et les départs publiés qui s'y affichent (une page ligne change dès qu'un horaire change).
 */
export function maritimeLastmods(input: {
  ports: SitemapPort[];
  routes: SitemapRoute[];
  departures: SitemapDeparture[];
}) {
  const byRoute = new Map<string, string>();
  for (const departure of input.departures)
    byRoute.set(departure.route_id, latest(byRoute.get(departure.route_id), departure.updated_at)!);
  const lines = input.routes.map((route) => ({
    route,
    lastmod: latest(route.updated_at, byRoute.get(route.id))!,
  }));
  const byPort = new Map<string, string>();
  for (const { route, lastmod } of lines)
    for (const id of [route.departure_port_id, route.arrival_port_id])
      byPort.set(id, latest(byPort.get(id), lastmod)!);
  return [
    ...input.ports.map((port) => ({
      path: `/ports/${encodeURIComponent(port.slug)}`,
      lastmod: latest(port.updated_at, byPort.get(port.id))!,
    })),
    ...lines.map(({ route, lastmod }) => ({
      path: `/lignes/${encodeURIComponent(route.slug)}`,
      lastmod,
    })),
  ];
}
