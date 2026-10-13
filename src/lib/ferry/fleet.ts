// Flotte déduite des horaires : où se trouve chaque navire en ce moment ?
//
// Règles (sans suivi en direct) :
//  - une traversée en cours (départ passé, arrivée à venir) → le navire est EN MER, placé sur sa ligne
//    selon l'avancement de l'horaire (aussi lent que la réalité : 1/20e de la route par heure pour 20 h) ;
//  - un navire dont le prochain départ a lieu dans les 36 h → AU PORT de départ ;
//  - un navire arrivé il y a moins de 12 h → AU PORT d'arrivée ;
//  - avec le suivi en direct, la position réelle remplace la position déduite.
import { pointAlong, routeArc, type LngLat } from "./geo";
import type { LiveShip } from "./tracking";
import type { Departure, Port, RouteLine, Vessel } from "./types";

export interface FleetShip {
  id: string;
  name: string;
  vesselId: string | null;
  state: "sea" | "docked";
  source: "live" | "schedule";
  /** Position déduite de l'horaire (ignorée si `live` est présent). */
  lngLat: LngLat;
  course: number;
  /** Décalage en pixels pour ranger les navires amarrés le long de la côte. */
  dx: number;
  dy: number;
  routeId: string;
  departureId: string;
  portId: string | null;
  live?: LiveShip;
}

const HOUR = 3600_000;
const DOCK_BEFORE_DEPARTURE = 36 * HOUR;
const DOCK_AFTER_ARRIVAL = 12 * HOUR;
const ANONYMOUS_DOCK_BEFORE = 6 * HOUR;

function bearing(from: LngLat, to: LngLat): number {
  const dLng = ((to[0] - from[0]) * Math.PI) / 180;
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function buildFleet(
  departures: Departure[],
  routes: RouteLine[],
  ports: Port[],
  vessels: Vessel[],
  liveShips: LiveShip[],
  now: number,
): FleetShip[] {
  const routeById = new Map(
    routes.filter((route) => route.status === "active").map((route) => [route.id, route]),
  );
  const portById = new Map(
    ports.filter((port) => port.status === "active").map((port) => [port.id, port]),
  );
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));
  const liveByVessel = new Map(liveShips.map((ship) => [ship.vessel.id, ship]));

  interface Leg {
    departure: Departure;
    route: RouteLine;
    from: Port;
    to: Port;
    start: number;
    end: number;
  }

  // Regroupe les traversées par navire (ou une « traversée anonyme » si aucun navire n'est renseigné).
  const groups = new Map<string, Leg[]>();
  departures.forEach((departure) => {
    if (departure.status === "cancelled") return;
    const route = routeById.get(departure.route_id);
    if (!route) return;
    const from = portById.get(route.departure_port_id);
    const to = portById.get(route.arrival_port_id);
    if (!from || !to) return;
    const start = Date.parse(departure.departure_at);
    const minutes = departure.duration_minutes ?? route.typical_duration_minutes ?? 24 * 60;
    const end = departure.arrival_at ? Date.parse(departure.arrival_at) : start + minutes * 60_000;
    const key = departure.vessel_id ?? `anon:${departure.id}`;
    const legs = groups.get(key) ?? [];
    legs.push({ departure, route, from, to, start, end });
    groups.set(key, legs);
  });

  const ships: FleetShip[] = [];
  const dockedAt = new Map<string, FleetShip[]>();

  groups.forEach((legs, key) => {
    legs.sort((a, b) => a.start - b.start);
    const vessel = key.startsWith("anon:") ? undefined : vesselById.get(key);
    const name = vessel?.name ?? "Ferry";
    const live = vessel ? liveByVessel.get(vessel.id) : undefined;

    // Signal AIS récent : la position réelle prime sur l'horaire (en mer ou à quai).
    if (live && vessel) {
      ships.push({
        id: `live:${vessel.id}`,
        name,
        vesselId: vessel.id,
        state: live.phase === "sea" ? "sea" : "docked",
        source: "live",
        lngLat: [live.position.longitude, live.position.latitude],
        course: live.position.courseDeg ?? 90,
        dx: 0,
        dy: 0,
        routeId: live.route.id,
        departureId: live.departure.id,
        portId: null,
        live,
      });
      return;
    }


    const current = legs.find((leg) => leg.start <= now && now <= leg.end);
    if (current) {
      const progress = Math.min(
        1,
        Math.max(0, (now - current.start) / Math.max(1, current.end - current.start)),
      );
      const arc = routeArc(current.from, current.to);
      const oriented = current.from.id > current.to.id ? [...arc].reverse() : arc;
      const here = pointAlong(oriented, progress);
      const ahead = pointAlong(oriented, Math.min(1, progress + 0.02));
      ships.push({
        id: `sea:${key}:${current.departure.id}`,
        name,
        vesselId: vessel?.id ?? null,
        state: "sea",
        source: live && live.phase === "sea" ? "live" : "schedule",
        lngLat: here,
        course: bearing(here, ahead),
        dx: 0,
        dy: 0,
        routeId: current.route.id,
        departureId: current.departure.id,
        portId: null,
        ...(live && live.phase === "sea" ? { live } : {}),
      });
      return;
    }

    const next = legs.find((leg) => leg.start > now);
    const last = [...legs].reverse().find((leg) => leg.end < now);
    let port: Port | undefined;
    let leg: Leg | undefined;
    const dockWindow = vessel ? DOCK_BEFORE_DEPARTURE : ANONYMOUS_DOCK_BEFORE;
    if (next && next.start - now <= dockWindow) {
      port = next.from;
      leg = next;
    } else if (vessel && last && now - last.end <= DOCK_AFTER_ARRIVAL) {
      port = last.to;
      leg = next ?? last;
    }
    if (!port || !leg) return;

    const ship: FleetShip = {
      id: `dock:${key}`,
      name,
      vesselId: vessel?.id ?? null,
      state: "docked",
      source: "schedule",
      lngLat: [port.longitude, port.latitude],
      course: 90,
      dx: 0,
      dy: 0,
      routeId: leg.route.id,
      departureId: leg.departure.id,
      portId: port.id,
    };
    ships.push(ship);
    const list = dockedAt.get(port.id) ?? [];
    list.push(ship);
    dockedAt.set(port.id, list);
  });

  // Range les navires amarrés en file, parallèlement à la côte, du côté de la mer.
  dockedAt.forEach((list, portId) => {
    const port = portById.get(portId);
    const offshoreDown = port?.country_code !== "DZ"; // ports européens : mer au sud ; ports algériens : mer au nord
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((ship, index) => {
      ship.dx = (index - (list.length - 1) / 2) * 17;
      ship.dy = offshoreDown ? 20 : -20;
      ship.course = index % 2 === 0 ? 90 : 270;
    });
  });

  return ships;
}
