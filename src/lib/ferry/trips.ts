// Traversées prêtes à afficher : heures locales, durée, jour, recommandation.
import type { Company, Departure, Port, RouteLine, Vessel } from "./types";
import { dateKeyInZone, portTimeZone, wallTimeInZone } from "./time";

export type TravelerType = "solo" | "couple" | "family";

export interface Sailing {
  departure: Departure;
  route: RouteLine;
  from: Port;
  to: Port;
  company: Company | undefined;
  vessel: Vessel | undefined;
  fromZone: string;
  toZone: string;
  /** Jour de départ (AAAA-MM-JJ) dans l'heure locale du port de départ. */
  dayKey: string;
  depTime: string;
  arrTime: string | null;
  /** 0 = même jour, 1 = lendemain… (en heure locale d'arrivée). */
  arrDayOffset: number;
  durationMin: number | null;
  /** Heure de départ en décimal (6.5 = 06:30) pour le confort. */
  depHour: number;
}

export function buildSailings(
  departures: Departure[],
  routes: RouteLine[],
  ports: Port[],
  companies: Company[],
  vessels: Vessel[],
): Sailing[] {
  const routeById = new Map(
    routes.filter((route) => route.status === "active").map((route) => [route.id, route]),
  );
  const portById = new Map(
    ports.filter((port) => port.status === "active").map((port) => [port.id, port]),
  );
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));
  const now = Date.now();
  const result: Sailing[] = [];

  departures.forEach((departure) => {
    if (departure.status === "cancelled") return;
    if (new Date(departure.departure_at).getTime() < now) return;
    const route = routeById.get(departure.route_id);
    if (!route) return;
    const from = portById.get(route.departure_port_id);
    const to = portById.get(route.arrival_port_id);
    if (!from || !to) return;
    const fromZone = portTimeZone(from);
    const toZone = portTimeZone(to);
    const dayKey = dateKeyInZone(departure.departure_at, fromZone);
    const depTime = wallTimeInZone(departure.departure_at, fromZone);
    const [hour = 0, minute = 0] = depTime.split(":").map(Number);
    let arrDayOffset = 0;
    let arrTime: string | null = null;
    if (departure.arrival_at) {
      arrTime = wallTimeInZone(departure.arrival_at, toZone);
      const arrKey = dateKeyInZone(departure.arrival_at, toZone);
      arrDayOffset = Math.round(
        (Date.parse(`${arrKey}T00:00:00Z`) - Date.parse(`${dayKey}T00:00:00Z`)) / 86400000,
      );
    }
    result.push({
      departure,
      route,
      from,
      to,
      company: companyById.get(departure.company_id),
      vessel: departure.vessel_id ? vesselById.get(departure.vessel_id) : undefined,
      fromZone,
      toZone,
      dayKey,
      depTime,
      arrTime,
      arrDayOffset,
      durationMin: departure.duration_minutes ?? route.typical_duration_minutes ?? null,
      depHour: hour + minute / 60,
    });
  });

  return result.sort((a, b) => a.departure.departure_at.localeCompare(b.departure.departure_at));
}

/** Traversées d'un sens : ports de départ et d'arrivée (liste vide = tous). */
export function legSailings(
  all: Sailing[],
  fromIds: string[],
  toIds: string[],
  companyId: string | null = null,
  vesselId: string | null = null,
): Sailing[] {
  const from = new Set(fromIds);
  const to = new Set(toIds);
  return all.filter(
    (sailing) =>
      (from.size === 0 || from.has(sailing.from.id)) &&
      (to.size === 0 || to.has(sailing.to.id)) &&
      (!companyId || sailing.departure.company_id === companyId) &&
      (!vesselId || sailing.departure.vessel_id === vesselId),
  );
}

/** Jours qui ont au moins un départ, avec leur nombre de traversées. */
export function daysWithSailings(
  list: Sailing[],
  from: string | null = null,
  limit = 60,
): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  list.forEach((sailing) => {
    if (from && sailing.dayKey < from) return;
    counts.set(sailing.dayKey, (counts.get(sailing.dayKey) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, limit)
    .map(([day, count]) => ({ day, count }));
}

/** Pénalité de confort : une famille évite les départs très tôt ou très tard. */
function comfortPenalty(hour: number, traveler: TravelerType) {
  if (traveler === "family") return hour < 7 || hour >= 22 ? 80 : 0;
  if (traveler === "couple") return hour < 6 ? 35 : 0;
  return hour < 5 ? 20 : 0;
}

/** Identifiant de la traversée à recommander parmi plusieurs le même jour. */
export function recommendedId(list: Sailing[], traveler: TravelerType): string | null {
  if (list.length < 2) return null;
  let best = list[0]!;
  let bestScore = Infinity;
  list.forEach((sailing) => {
    const score = (sailing.durationMin ?? 9999) + comfortPenalty(sailing.depHour, traveler);
    if (score < bestScore) {
      best = sailing;
      bestScore = score;
    }
  });
  return best.departure.id;
}

/** Trajets les plus fréquents (paires de ports), pour les raccourcis. */
export function popularPairs(all: Sailing[], limit = 6) {
  const counts = new Map<string, { from: Port; to: Port; count: number }>();
  all.forEach((sailing) => {
    const key = `${sailing.from.id}>${sailing.to.id}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { from: sailing.from, to: sailing.to, count: 1 });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** « Aujourd'hui », « Demain », « Dans 5 jours ». */
export function relativeDay(dayKey: string, timeZone: string): string {
  const today = dateKeyInZone(new Date(), timeZone);
  const diff = Math.round(
    (Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  );
  if (diff <= 0) return "Aujourd’hui";
  if (diff === 1) return "Demain";
  return `Dans ${diff} jours`;
}
