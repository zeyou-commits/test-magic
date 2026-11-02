// Les salons d'un port : ceux des traversées qui partent ou arrivent bientôt, puis les autres.
import type { Departure, RouteLine } from "./types";

const HOUR = 3_600_000;
/** Mis en avant : de 12 h avant le départ (ou l'arrivée) jusqu'à 2 h après. */
export const SOON_BEFORE_MS = 12 * HOUR;
export const SOON_AFTER_MS = 2 * HOUR;

export type PortRoom = {
  departureId: string;
  routeId: string;
  kind: "departure" | "arrival";
  /** Heure qui compte pour ce port : le départ d'ici, ou l'arrivée ici. */
  at: string;
  otherPortId: string;
  vesselId: string | null;
};

function arrivalOf(departure: Departure) {
  if (departure.arrival_at) return Date.parse(departure.arrival_at);
  const minutes = departure.duration_minutes;
  return minutes && minutes > 0 ? Date.parse(departure.departure_at) + minutes * 60_000 : NaN;
}

export function portRooms(
  portId: string,
  routes: RouteLine[],
  departures: Departure[],
  now = Date.now(),
  laterLimit = 8,
) {
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const rooms: (PortRoom & { time: number })[] = [];
  for (const departure of departures) {
    if (departure.status === "cancelled") continue;
    const route = routeById.get(departure.route_id);
    if (!route) continue;
    const base = { departureId: departure.id, routeId: route.id, vesselId: departure.vessel_id ?? null };
    if (route.departure_port_id === portId) {
      const time = Date.parse(departure.departure_at);
      rooms.push({ ...base, kind: "departure", at: departure.departure_at, otherPortId: route.arrival_port_id, time });
    } else if (route.arrival_port_id === portId) {
      const time = arrivalOf(departure);
      if (Number.isFinite(time))
        rooms.push({ ...base, kind: "arrival", at: new Date(time).toISOString(), otherPortId: route.departure_port_id, time });
    }
  }
  rooms.sort((a, b) => a.time - b.time);
  const soon = rooms.filter((room) => room.time >= now - SOON_AFTER_MS && room.time <= now + SOON_BEFORE_MS);
  const later = rooms.filter((room) => room.time > now + SOON_BEFORE_MS).slice(0, laterLimit);
  const strip = ({ time: _time, ...room }: PortRoom & { time: number }): PortRoom => room;
  return { soon: soon.map(strip), later: later.map(strip) };
}
