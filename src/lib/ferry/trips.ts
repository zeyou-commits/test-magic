// Traversées prêtes à afficher : heures locales, durée, jour, recommandation.
import type { Company, Departure, Port, RouteLine, Vessel } from "./types";
import { dateKeyInZone, portTimeZone, wallTimeInZone } from "./time";

export type TravelerType = "solo" | "couple" | "family";

export interface Sailing {
  /** Comparaison indicative créée à partir d'une liaison, sans départ publié. */
  isSimulation?: boolean;
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

/**
 * Traversées d'un sens : ports de départ et d'arrivée (liste vide = tous).
 * Quand un côté reste sur « Tous », le sens choisi verrouille le pays :
 * en Europe → Algérie, un départ « Tous » ne propose jamais un port algérien,
 * et une arrivée « Tous » ne propose jamais un port européen (et inversement).
 */
export function legSailings(
  all: Sailing[],
  fromIds: string[],
  toIds: string[],
  companyId: string | null = null,
  vesselId: string | null = null,
  direction: "eu-dz" | "dz-eu" = "eu-dz",
): Sailing[] {
  const from = new Set(fromIds);
  const to = new Set(toIds);
  const fromIsDz = direction === "dz-eu";
  return all.filter(
    (sailing) =>
      (from.size === 0
        ? (sailing.from.country_code === "DZ") === fromIsDz
        : from.has(sailing.from.id)) &&
      (to.size === 0
        ? (sailing.to.country_code === "DZ") === !fromIsDz
        : to.has(sailing.to.id)) &&
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
export function comfortPenalty(hour: number, traveler: TravelerType) {
  if (traveler === "family") return hour < 7 || hour >= 22 ? 80 : 0;
  if (traveler === "couple") return hour < 6 ? 35 : 0;
  return hour < 5 ? 20 : 0;
}

/**
 * « Recommandé », la même règle partout (recherche de traversées et itinéraire) : le plus rapide
 * à un horaire confortable pour le profil, sauf si un autre coûte nettement moins cher.
 * Seule la durée change de nature : la traversée ici, le porte à porte dans l'itinéraire.
 */
export const RECOMMENDED_RULE =
  "Recommandé : le plus rapide à un horaire confortable pour votre profil, sauf si un autre coûte nettement moins cher.";

export type RecommendedCandidate = { minutes: number; hour: number; euro: number };

/** Un écart de prix « net » : 80 € (120 € avec des enfants) ou 18 % du plus cher. */
export function priceGapMatters(a: number, b: number, traveler: TravelerType) {
  return Math.abs(a - b) > Math.max(traveler === "family" ? 120 : 80, 0.18 * Math.max(a, b));
}

export function compareRecommended(
  a: RecommendedCandidate,
  b: RecommendedCandidate,
  traveler: TravelerType,
) {
  if (priceGapMatters(a.euro, b.euro, traveler)) return a.euro - b.euro;
  return (
    a.minutes + comfortPenalty(a.hour, traveler) - (b.minutes + comfortPenalty(b.hour, traveler)) ||
    a.euro - b.euro
  );
}

/** Identifiant de la traversée à recommander parmi plusieurs le même jour. */
export function recommendedId(
  list: Sailing[],
  traveler: TravelerType,
  fare: (sailing: Sailing) => number = () => 0,
): string | null {
  if (list.length < 2) return null;
  const candidate = (sailing: Sailing): RecommendedCandidate => ({
    minutes: sailing.durationMin ?? 9999,
    hour: sailing.depHour,
    euro: fare(sailing),
  });
  return [...list].sort((a, b) => compareRecommended(candidate(a), candidate(b), traveler))[0]!
    .departure.id;
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
