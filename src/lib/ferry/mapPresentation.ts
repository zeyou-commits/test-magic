import type { Departure, Port, RouteLine, Schedule } from "./types";
import type { FleetShip } from "./fleet";
import { dateKeyInZone, portTimeZone, zonedTimeToUtc } from "./time";

export type LineVisibility = "published" | "all" | "none";
export type MapPreview = {
  routeId?: string;
  vesselId?: string;
  portId?: string;
  companyId?: string;
};

const PORT_CODES: Record<string, string> = {
  alger: "ALG",
  marseille: "MRS",
  sete: "SET",
  bejaia: "BEJ",
  oran: "ORN",
  mostaganem: "MOS",
  ghazaouet: "GHA",
  valence: "VLC",
  barcelone: "BCN",
  almeria: "ALM",
  alicante: "ALC",
  genes: "GEN",
  toulon: "TLN",
  skikda: "SKI",
  annaba: "ANN",
};
export function portCode(port?: Pick<Port, "name">) {
  if (!port) return "—";
  const name = port.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    PORT_CODES[name] ??
    name
      .replace(/[^a-z]/g, "")
      .slice(0, 3)
      .toUpperCase()
  );
}
export function shortCompanyName(name: string) {
  if (/nouris/i.test(name)) return "Nouris Elbahr";
  if (/armas.*trasmed|trasmed.*armas/i.test(name)) return "Armas Trasmed.";
  return name.length > 23 ? `${name.slice(0, 21).trimEnd()}…` : name;
}

/** Aucun horizon arbitraire : un calendrier publié l'été prochain compte aussi. */
export function publishedRouteIds(
  departures: Departure[],
  schedules: Schedule[],
  routes: RouteLine[],
  ports: Port[],
  now: number,
) {
  const ids = new Set(
    departures
      .filter((d) => d.status !== "cancelled" && !d.is_demo && Date.parse(d.departure_at) >= now)
      .map((d) => d.route_id),
  );
  for (const schedule of schedules) {
    if (schedule.status !== "active" || schedule.is_demo || !schedule.weekdays.length) continue;
    const route = routes.find((r) => r.id === schedule.route_id);
    const port = ports.find((p) => p.id === route?.departure_port_id);
    if (!port) continue;
    const zone = portTimeZone(port);
    const today = dateKeyInZone(new Date(now).toISOString(), zone);
    const first = schedule.valid_from > today ? schedule.valid_from : today;
    // Une semaine suffit pour trouver la prochaine occurrence d'un programme hebdomadaire.
    for (let offset = 0; offset <= 7; offset++) {
      const date = new Date(`${first}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      if (schedule.valid_to && key > schedule.valid_to) break;
      if (!schedule.weekdays.includes(date.getUTCDay())) continue;
      const instant = zonedTimeToUtc(key, schedule.departure_time.slice(0, 5), zone);
      if (instant.getTime() >= now) {
        ids.add(schedule.route_id);
        break;
      }
    }
  }
  return [...ids];
}

export function fleetShortcutInfo(
  ship: FleetShip,
  departures: Departure[],
  routes: RouteLine[],
  ports: Port[],
  now: number,
) {
  const current = departures.find((d) => d.id === ship.departureId);
  const dock = ports.find((p) => p.id === ship.portId);
  const next =
    ship.state === "docked"
      ? departures
          .filter(
            (d) =>
              d.status !== "cancelled" &&
              (ship.vesselId ? d.vessel_id === ship.vesselId : d.id === ship.departureId) &&
              Date.parse(d.departure_at) >= now &&
              routes.some((r) => r.id === d.route_id && r.departure_port_id === ship.portId),
          )
          .sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at))[0]
      : current;
  const route = routes.find((r) => r.id === (next ?? current)?.route_id);
  const from = ports.find((p) => p.id === route?.departure_port_id);
  const to = next ? ports.find((p) => p.id === route?.arrival_port_id) : undefined;
  const minutes = next
    ? Math.max(0, Math.ceil((Date.parse(next.departure_at) - now) / 60_000))
    : null;
  const delay =
    minutes === null
      ? "En attente d’un départ publié"
      : minutes < 60
        ? `Départ prévu dans ${minutes} min`
        : `Départ prévu dans ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;
  return {
    route: `${portCode(ship.state === "docked" ? (dock ?? from) : from)} → ${portCode(to)}`,
    dock: dock?.name ?? from?.name ?? "Port à confirmer",
    destination: to?.name ?? "Destination à confirmer",
    status: delay,
  };
}
