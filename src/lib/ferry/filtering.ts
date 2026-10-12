import type { Company, Departure, Filters, Port, RouteLine, Vessel } from "./types";
import { emptyFilters } from "./types";
import { dateKeyInZone, portTimeZone } from "./time";
import { schoolBreakOn } from "./schoolCalendar";

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const COUNTRY_ORDER = ["FR", "ES", "IT", "DZ"];

export interface CountryGroup {
  code: string;
  name: string;
  ports: Port[];
}

export function groupPortsByCountry(ports: Port[]): CountryGroup[] {
  const groups = new Map<string, CountryGroup>();
  ports.forEach((port) => {
    const group = groups.get(port.country_code);
    if (group) group.ports.push(port);
    else
      groups.set(port.country_code, {
        code: port.country_code,
        name: port.country_name,
        ports: [port],
      });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      ports: [...group.ports].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    }))
    .sort((a, b) => {
      const ai = COUNTRY_ORDER.indexOf(a.code);
      const bi = COUNTRY_ORDER.indexOf(b.code);
      if (ai !== -1 || bi !== -1)
        return (ai === -1 ? COUNTRY_ORDER.length : ai) - (bi === -1 ? COUNTRY_ORDER.length : bi);
      return a.name.localeCompare(b.name, "fr");
    });
}

function openRoutes(ports: Port[], routes: RouteLine[]): RouteLine[] {
  const open = new Set(ports.filter((port) => port.status === "active").map((port) => port.id));
  return routes.filter(
    (route) => open.has(route.departure_port_id) && open.has(route.arrival_port_id),
  );
}

/** Ports d'où part au moins une ligne ouverte (éventuellement vers les arrivées choisies). */
export function getDeparturePorts(
  ports: Port[],
  routes: RouteLine[],
  arrivalPortIds: string[] = [],
): Port[] {
  const to = new Set(arrivalPortIds);
  const ids = new Set(
    openRoutes(ports, routes)
      .filter((route) => to.size === 0 || to.has(route.arrival_port_id))
      .map((route) => route.departure_port_id),
  );
  return ports.filter((port) => ids.has(port.id));
}

/** Ports atteignables depuis les départs choisis (tous si aucun départ choisi). */
export function getArrivalPorts(
  ports: Port[],
  routes: RouteLine[],
  departurePortIds: string[] = [],
): Port[] {
  const from = new Set(departurePortIds);
  const ids = new Set(
    openRoutes(ports, routes)
      .filter((route) => from.size === 0 || from.has(route.departure_port_id))
      .map((route) => route.arrival_port_id),
  );
  return ports.filter((port) => ids.has(port.id));
}

/** Change les ports de départ et retire les arrivées devenues inaccessibles. */
export function withDeparturePorts(
  filters: Filters,
  departurePortIds: string[],
  ports: Port[],
  routes: RouteLine[],
): Filters {
  const arrivals = new Set(getArrivalPorts(ports, routes, departurePortIds).map((port) => port.id));
  return {
    ...filters,
    departurePortIds,
    arrivalPortIds: filters.arrivalPortIds.filter((id) => arrivals.has(id)),
  };
}

/** Change les ports d'arrivée et retire les départs qui n'y mènent pas. */
export function withArrivalPorts(
  filters: Filters,
  arrivalPortIds: string[],
  ports: Port[],
  routes: RouteLine[],
): Filters {
  const departures = new Set(
    getDeparturePorts(ports, routes, arrivalPortIds).map((port) => port.id),
  );
  return {
    ...filters,
    arrivalPortIds,
    departurePortIds: filters.departurePortIds.filter((id) => departures.has(id)),
  };
}

/** Inverse le sens du trajet (Europe → Algérie devient Algérie → Europe). */
export function swapDirection(filters: Filters): Filters {
  return {
    ...filters,
    departurePortIds: filters.arrivalPortIds,
    arrivalPortIds: filters.departurePortIds,
  };
}

export function filtersForRoute(filters: Filters, route: RouteLine): Filters {
  return {
    ...filters,
    departurePortIds: [route.departure_port_id],
    arrivalPortIds: [route.arrival_port_id],
  };
}

/** Fuseau horaire du port de départ, ligne par ligne. */
export function routeTimeZones(routes: RouteLine[], ports: Port[]): Map<string, string> {
  const portById = new Map(ports.map((port) => [port.id, port]));
  return new Map(
    routes.map((route) => [route.id, portTimeZone(portById.get(route.departure_port_id))]),
  );
}

/** Jour de départ (AAAA-MM-JJ) dans l'heure locale du port de départ. */
export function departureDateKey(departure: Departure, timeZones: Map<string, string>): string {
  return dateKeyInZone(
    departure.departure_at,
    timeZones.get(departure.route_id) ?? portTimeZone(null),
  );
}

interface FilterOptions {
  ignoreDate?: boolean;
}

export function filterRoutes(
  routes: RouteLine[],
  ports: Port[],
  departures: Departure[],
  filters: Filters,
  options: FilterOptions = {},
): RouteLine[] {
  const portById = new Map(ports.map((port) => [port.id, port]));
  const term = normalizeText(filters.search);
  const departureIds = new Set(filters.departurePortIds);
  const arrivalIds = new Set(filters.arrivalPortIds);
  const useDate = Boolean(filters.date) && !options.ignoreDate;
  const needsDeparture = Boolean(filters.vesselId) || useDate || Boolean(filters.schoolZone);
  const routesWithDeparture = new Set<string>();

  if (needsDeparture) {
    const timeZones = routeTimeZones(routes, ports);
    departures.forEach((departure) => {
      if (departure.status === "cancelled") return;
      if (filters.vesselId && departure.vessel_id !== filters.vesselId) return;
      if (filters.companyId && departure.company_id !== filters.companyId) return;
      const day = departureDateKey(departure, timeZones);
      if (useDate && day !== filters.date) return;
      if (filters.schoolZone && !schoolBreakOn(day, filters.schoolZone)) return;
      routesWithDeparture.add(departure.route_id);
    });
  }

  const matchesTerm = (port: Port) =>
    normalizeText(`${port.name} ${port.city ?? ""} ${port.country_name}`).includes(term);

  return routes.filter((route) => {
    const from = portById.get(route.departure_port_id);
    const to = portById.get(route.arrival_port_id);

    if (!from || !to || from.status !== "active" || to.status !== "active") return false;
    if (route.status !== "active") return false;
    if (departureIds.size > 0 && !departureIds.has(from.id)) return false;
    if (arrivalIds.size > 0 && !arrivalIds.has(to.id)) return false;
    if (filters.companyId && !route.company_ids.includes(filters.companyId)) return false;
    if (needsDeparture && !routesWithDeparture.has(route.id)) return false;
    if (term && !matchesTerm(from) && !matchesTerm(to)) return false;
    return true;
  });
}

export function filterDepartures(
  departures: Departure[],
  routeIds: Set<string>,
  filters: Filters,
  timeZones: Map<string, string>,
): Departure[] {
  return departures
    .filter((departure) => departure.status !== "cancelled" && routeIds.has(departure.route_id))
    .filter((departure) => !filters.companyId || departure.company_id === filters.companyId)
    .filter((departure) => !filters.vesselId || departure.vessel_id === filters.vesselId)
    .filter((departure) => !filters.date || departureDateKey(departure, timeZones) === filters.date)
    .filter(
      (departure) =>
        !filters.schoolZone ||
        schoolBreakOn(departureDateKey(departure, timeZones), filters.schoolZone) !== null,
    )
    .sort((a, b) => new Date(a.departure_at).getTime() - new Date(b.departure_at).getTime());
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.departurePortIds.length > 0 ||
    filters.arrivalPortIds.length > 0 ||
    filters.companyId !== null ||
    filters.vesselId !== null ||
    filters.date !== null ||
    filters.schoolZone !== null
  );
}

export interface FilterChip {
  key: string;
  label: string;
  remove: (filters: Filters) => Filters;
}

const chipDateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function describeActiveFilters(
  filters: Filters,
  ports: Port[],
  companies: Company[],
  vessels: Vessel[],
): FilterChip[] {
  const chips: FilterChip[] = [];
  const portName = (id: string) => ports.find((port) => port.id === id)?.name ?? "Port";

  if (filters.departurePortIds.length === 1) {
    const id = filters.departurePortIds[0]!;
    chips.push({
      key: "from",
      label: `Départ : ${portName(id)}`,
      remove: (f) => ({ ...f, departurePortIds: [] }),
    });
  } else if (filters.departurePortIds.length > 1) {
    chips.push({
      key: "from",
      label: `${filters.departurePortIds.length} ports de départ`,
      remove: (f) => ({ ...f, departurePortIds: [] }),
    });
  }

  if (filters.arrivalPortIds.length === 1) {
    const id = filters.arrivalPortIds[0]!;
    chips.push({
      key: "to",
      label: `Arrivée : ${portName(id)}`,
      remove: (f) => ({ ...f, arrivalPortIds: [] }),
    });
  } else if (filters.arrivalPortIds.length > 1) {
    chips.push({
      key: "to",
      label: `${filters.arrivalPortIds.length} ports d’arrivée`,
      remove: (f) => ({ ...f, arrivalPortIds: [] }),
    });
  }

  if (filters.date) {
    const [y = 1970, m = 1, d = 1] = filters.date.split("-").map(Number);
    chips.push({
      key: "date",
      label: chipDateFormatter.format(new Date(y, m - 1, d)),
      remove: (f) => ({ ...f, date: null }),
    });
  }

  if (filters.schoolZone) {
    chips.push({
      key: "zone",
      label: `Vacances zone ${filters.schoolZone}`,
      remove: (f) => ({ ...f, schoolZone: null }),
    });
  }

  if (filters.companyId) {
    chips.push({
      key: "company",
      label: companies.find((company) => company.id === filters.companyId)?.name ?? "Compagnie",
      remove: (f) => ({ ...f, companyId: null }),
    });
  }

  if (filters.vesselId) {
    chips.push({
      key: "vessel",
      label: vessels.find((vessel) => vessel.id === filters.vesselId)?.name ?? "Navire",
      remove: (f) => ({ ...f, vesselId: null }),
    });
  }

  if (filters.search.trim()) {
    chips.push({
      key: "search",
      label: `« ${filters.search.trim()} »`,
      remove: (f) => ({ ...f, search: "" }),
    });
  }

  return chips;
}

export { emptyFilters };

/** Façades algériennes déduites de la longitude réelle des ports. */
export function algerianRegion(port: Port): "Ouest" | "Centre" | "Est" | null {
  if (port.country_code !== "DZ") return null;
  if (port.longitude < 1.5) return "Ouest";
  if (port.longitude < 5.5) return "Centre";
  return "Est";
}

/** Résumé lisible d'une liste de ports : « Marseille », « Toute la France (2) », « 3 ports »… */
const COUNTRY_LABEL: Record<string, string> = {
  FR: "Toute la France",
  ES: "Toute l’Espagne",
  IT: "Toute l’Italie",
  DZ: "Toute l’Algérie",
};

export function summarizePorts(
  ids: string[],
  ports: Port[],
  emptyLabel = "Tous les ports",
): string {
  if (!ids.length) return emptyLabel;
  const portById = new Map(ports.map((port) => [port.id, port]));
  if (ids.length === 1) return portById.get(ids[0]!)?.name ?? "1 port";
  const set = new Set(ids);
  const full = groupPortsByCountry(ports).find(
    (c) => c.ports.length === ids.length && c.ports.every((p) => set.has(p.id)),
  );
  if (full) return `${COUNTRY_LABEL[full.code] ?? full.name} (${ids.length})`;
  const regions = new Set(
    ids.map((id) => portById.get(id)).map((p) => (p ? algerianRegion(p) : null)),
  );
  if (regions.size === 1 && !regions.has(null)) return `Algérie ${[...regions][0]} (${ids.length})`;
  return `${ids.length} ports`;
}

export const countryShortcutLabel = COUNTRY_LABEL;
