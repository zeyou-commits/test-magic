import type { PortMeta } from "@/components/map/FerryMap";
import { capitalizeFirst, formatDateParts } from "./format";
import { portTraffic } from "./portTraffic";
import { portTimeZone } from "./time";
import type { Company, Departure, Port, RouteLine } from "./types";

/**
 * Les infobulles des ports pour « Mon voyage » : même contenu que sur la carte d'accueil
 * (lignes, compagnies, prochains départs et arrivées), calculé pour les seuls ports affichés.
 */
export function journeyPortMeta(
  portIds: string[],
  ports: Port[],
  routes: RouteLine[],
  companies: Company[],
  departures: Departure[],
): Record<string, PortMeta> {
  const meta: Record<string, PortMeta> = {};
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const portById = new Map(ports.map((port) => [port.id, port]));
  for (const id of portIds) {
    const port = portById.get(id);
    if (!port) continue;
    const portRoutes = routes.filter(
      (route) =>
        route.status === "active" &&
        (route.departure_port_id === port.id || route.arrival_port_id === port.id),
    );
    const names = new Set<string>();
    for (const route of portRoutes)
      for (const companyId of route.company_ids) {
        const company = companyById.get(companyId);
        if (company) names.add(company.name);
      }
    const timeZone = portTimeZone(port);
    const traffic = portTraffic(port.id, routes, departures);
    meta[port.id] = {
      departureCount: traffic.departures.length,
      arrivalCount: traffic.arrivals.length,
      routes: portRoutes.length,
      companies: [...names].sort().map((name) => ({
        name,
        logoUrl: companies.find((company) => company.name === name)?.logo_url ?? null,
      })),
      upcoming: traffic.departures.slice(0, 3).map((departure) => {
        const route = routes.find((item) => item.id === departure.route_id);
        const parts = formatDateParts(departure.departure_at, timeZone);
        return {
          departureId: departure.id,
          date: capitalizeFirst(`${parts.weekday} ${parts.shortDate}`),
          time: parts.time,
          to: route ? (portById.get(route.arrival_port_id)?.name ?? null) : null,
          companyName: companyById.get(departure.company_id)?.name ?? null,
          logoUrl: companyById.get(departure.company_id)?.logo_url ?? null,
        };
      }),
      upcomingArrivals: traffic.arrivals.slice(0, 3).map(({ departure, route, arrivalAt }) => {
        const parts = formatDateParts(arrivalAt, timeZone);
        return {
          departureId: departure.id,
          date: capitalizeFirst(`${parts.weekday} ${parts.shortDate}`),
          time: parts.time,
          from: portById.get(route.departure_port_id)?.name ?? null,
          companyName: companyById.get(departure.company_id)?.name ?? null,
          logoUrl: companyById.get(departure.company_id)?.logo_url ?? null,
        };
      }),
    };
  }
  return meta;
}
