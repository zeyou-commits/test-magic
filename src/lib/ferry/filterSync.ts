import type { Departure, Filters, Port, RouteLine, Vessel } from "./types";
import { normalizeText } from "./filtering";

export function vesselCompanyIds(id: string, vessels: Vessel[], departures: Departure[]) {
  return [
    ...new Set(
      [
        vessels.find((v) => v.id === id)?.company_id,
        ...departures
          .filter((d) => d.vessel_id === id && d.status !== "cancelled")
          .map((d) => d.company_id),
      ].filter((value): value is string => Boolean(value)),
    ),
  ];
}

/** Une seule sélection compagnie/navire, quel que soit le sélecteur utilisé. */
export function syncFilters(
  current: Filters,
  next: Filters,
  vessels: Vessel[],
  departures: Departure[],
): Filters {
  if (!next.vesselId) return next;
  const companies = vesselCompanyIds(next.vesselId, vessels, departures);
  if (next.companyId !== current.companyId && next.vesselId === current.vesselId) {
    if (!next.companyId || (companies.length && !companies.includes(next.companyId)))
      return { ...next, vesselId: null };
  }
  if (
    next.vesselId !== current.vesselId &&
    (!next.companyId || !companies.includes(next.companyId))
  ) {
    return { ...next, companyId: companies[0] ?? null };
  }
  return next;
}

/** La carte et son accueil décrivent le trafic actuel, avec le même contexte géographique et les mêmes identités. */
export function matchesTraffic(
  departure: Departure,
  routes: RouteLine[],
  ports: Port[],
  filters: Filters,
) {
  if (departure.status === "cancelled") return false;
  if (filters.companyId && filters.companyId !== departure.company_id) return false;
  if (filters.vesselId && filters.vesselId !== departure.vessel_id) return false;
  const route = routes.find((r) => r.id === departure.route_id);
  if (!route) return false;
  // « Tous les ports » respecte le sens choisi : jamais de départ algérien
  // en Europe → Algérie, jamais d'arrivée européenne en Algérie → Europe.
  const fromIsDz = filters.direction === "dz-eu";
  const fromPort = ports.find((p) => p.id === route.departure_port_id);
  const toPort = ports.find((p) => p.id === route.arrival_port_id);
  if (filters.departurePortIds.length) {
    if (!filters.departurePortIds.includes(route.departure_port_id)) return false;
  } else if (fromPort && (fromPort.country_code === "DZ") !== fromIsDz) return false;
  if (filters.arrivalPortIds.length) {
    if (!filters.arrivalPortIds.includes(route.arrival_port_id)) return false;
  } else if (toPort && (toPort.country_code === "DZ") === fromIsDz) return false;
  const term = normalizeText(filters.search);
  if (
    term &&
    !ports
      .filter((p) => p.id === route.departure_port_id || p.id === route.arrival_port_id)
      .some((p) =>
        normalizeText(`${p.name} ${p.city ?? ""} ${p.country_name ?? ""}`).includes(term),
      )
  )
    return false;
  return true;
}
