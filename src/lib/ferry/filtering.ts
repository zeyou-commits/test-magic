import type { Company, Departure, Filters, Port, RouteLine, Vessel } from "./types";
import { emptyFilters } from "./types";

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const COUNTRY_ORDER = ["ES", "FR", "IT", "DZ"];

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
    else groups.set(port.country_code, { code: port.country_code, name: port.country_name, ports: [port] });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      ports: [...group.ports].sort((a, b) => a.name.localeCompare(b.name, "fr"))
    }))
    .sort((a, b) => {
      const ai = COUNTRY_ORDER.indexOf(a.code);
      const bi = COUNTRY_ORDER.indexOf(b.code);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? COUNTRY_ORDER.length : ai) - (bi === -1 ? COUNTRY_ORDER.length : bi);
      return a.name.localeCompare(b.name, "fr");
    });
}

function openRoutes(ports: Port[], routes: RouteLine[]): RouteLine[] {
  const open = new Set(ports.filter((port) => port.status === "active").map((port) => port.id));
  return routes.filter((route) => open.has(route.departure_port_id) && open.has(route.arrival_port_id));
}

export function getDeparturePorts(ports: Port[], routes: RouteLine[]): Port[] {
  const ids = new Set(openRoutes(ports, routes).map((route) => route.departure_port_id));
  return ports.filter((port) => ids.has(port.id));
}

export function getArrivalPorts(ports: Port[], routes: RouteLine[], departurePortIds: string[]): Port[] {
  const from = new Set(departurePortIds);
  const ids = new Set(
    openRoutes(ports, routes)
      .filter((route) => from.size === 0 || from.has(route.departure_port_id))
      .map((route) => route.arrival_port_id),
  );
  return ports.filter((port) => ids.has(port.id));
}

export function withDeparturePorts(filters: Filters, departurePortIds: string[], ports: Port[], routes: RouteLine[]): Filters {
  const arrivals = new Set(getArrivalPorts(ports, routes, departurePortIds).map((port) => port.id));
  const arrivalPortId = filters.arrivalPortId && arrivals.has(filters.arrivalPortId) ? filters.arrivalPortId : null;
  return { ...filters, departurePortIds, arrivalPortId };
}

export function filtersForPort(filters: Filters, portId: string, routes: RouteLine[]): Filters {
  const isOrigin = routes.some((route) => route.departure_port_id === portId);
  return isOrigin ? { ...filters, departurePortIds: [portId], arrivalPortId: null } : { ...filters, departurePortIds: [], arrivalPortId: portId };
}

export function filtersForRoute(filters: Filters, route: RouteLine): Filters {
  return { ...filters, departurePortIds: [route.departure_port_id], arrivalPortId: route.arrival_port_id };
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
  const useDate = Boolean(filters.date) && !options.ignoreDate;
  const needsDeparture = Boolean(filters.vesselId) || useDate;
  const routesWithDeparture = new Set<string>();

  if (needsDeparture) {
    departures.forEach((departure) => {
      if (departure.status === "cancelled") return;
      if (filters.vesselId && departure.vessel_id !== filters.vesselId) return;
      if (filters.companyId && departure.company_id !== filters.companyId) return;
      if (useDate && localDateKey(departure.departure_at) !== filters.date) return;
      routesWithDeparture.add(departure.route_id);
    });
  }

  const matchesTerm = (port: Port) => normalizeText(`${port.name} ${port.city ?? ""} ${port.country_name}`).includes(term);

  return routes.filter((route) => {
    const from = portById.get(route.departure_port_id);
    const to = portById.get(route.arrival_port_id);

    if (!from || !to || from.status !== "active" || to.status !== "active") return false;
    if (departureIds.size > 0 && !departureIds.has(from.id)) return false;
    if (filters.arrivalPortId && to.id !== filters.arrivalPortId) return false;
    if (filters.companyId && !route.company_ids.includes(filters.companyId)) return false;
    if (needsDeparture && !routesWithDeparture.has(route.id)) return false;
    if (term && !matchesTerm(from) && !matchesTerm(to)) return false;
    return true;
  });
}

export function filterDepartures(departures: Departure[], routeIds: Set<string>, filters: Filters): Departure[] {
  return departures
    .filter((departure) => departure.status !== "cancelled" && routeIds.has(departure.route_id))
    .filter((departure) => !filters.companyId || departure.company_id === filters.companyId)
    .filter((departure) => !filters.vesselId || departure.vessel_id === filters.vesselId)
    .filter((departure) => !filters.date || localDateKey(departure.departure_at) === filters.date)
    .sort((a, b) => new Date(a.departure_at).getTime() - new Date(b.departure_at).getTime());
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.departurePortIds.length > 0 ||
    filters.arrivalPortId !== null ||
    filters.companyId !== null ||
    filters.vesselId !== null ||
    filters.date !== null
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

  if (filters.departurePortIds.length > 0 && filters.departurePortIds.length <= 2) {
    filters.departurePortIds.forEach((id) =>
      chips.push({
        key: `from-${id}`,
        label: `Départ : ${portName(id)}`,
        remove: (f) => ({ ...f, departurePortIds: f.departurePortIds.filter((item) => item !== id) }),
      }),
    );
  } else if (filters.departurePortIds.length > 2) {
    chips.push({
      key: "from-many",
      label: `${filters.departurePortIds.length} ports de départ`,
      remove: (f) => ({ ...f, departurePortIds: [] }),
    });
  }

  if (filters.arrivalPortId) {
    chips.push({
      key: "to",
      label: `Arrivée : ${portName(filters.arrivalPortId)}`,
      remove: (f) => ({ ...f, arrivalPortId: null }),
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
      remove: (f) => ({ ...f, search: "" })
    });
  }

  return chips;
}

export { emptyFilters };
