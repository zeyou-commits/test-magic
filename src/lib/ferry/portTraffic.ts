import type { Departure, RouteLine } from "./types";

/** Shared by the map preview and the port profile: counts cover all known
 * upcoming movements, while each view may display a shorter preview. */
export function portTraffic(
  portId: string,
  routes: RouteLine[],
  departures: Departure[],
  now = Date.now(),
) {
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const outgoing: Departure[] = [];
  const incoming: { departure: Departure; route: RouteLine; arrivalAt: string }[] = [];

  for (const departure of departures) {
    if (departure.status === "cancelled") continue;
    const route = routeById.get(departure.route_id);
    if (!route) continue;
    const departureTime = Date.parse(departure.departure_at);
    if (route.departure_port_id === portId && departureTime >= now) outgoing.push(departure);
    if (route.arrival_port_id !== portId) continue;
    const arrivalTime = departure.arrival_at
      ? Date.parse(departure.arrival_at)
      : departure.duration_minutes != null && departure.duration_minutes > 0
        ? departureTime + departure.duration_minutes * 60_000
        : NaN;
    if (Number.isFinite(arrivalTime) && arrivalTime >= now) {
      incoming.push({ departure, route, arrivalAt: new Date(arrivalTime).toISOString() });
    }
  }

  outgoing.sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at));
  incoming.sort((a, b) => Date.parse(a.arrivalAt) - Date.parse(b.arrivalAt));
  return { departures: outgoing, arrivals: incoming };
}
