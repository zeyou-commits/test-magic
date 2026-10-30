// Fuseaux horaires des ports.
// Règle BledWay : une heure de départ s'affiche toujours dans l'heure locale du port
// de départ, et une heure d'arrivée dans l'heure locale du port d'arrivée.
// Ainsi, un voyageur qui consulte depuis Alger, Paris ou Londres voit la même heure,
// celle imprimée sur son billet.

import type { Port, RouteLine } from "./types";

const COUNTRY_TIME_ZONES: Record<string, string> = {
  DZ: "Africa/Algiers",
  FR: "Europe/Paris",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  PT: "Europe/Lisbon",
  MT: "Europe/Malta",
  GR: "Europe/Athens",
  TR: "Europe/Istanbul",
  TN: "Africa/Tunis",
  MA: "Africa/Casablanca",
  BE: "Europe/Brussels",
  DE: "Europe/Berlin",
  NL: "Europe/Amsterdam",
  GB: "Europe/London",
};

/** Fuseau par défaut si le pays du port est inconnu. */
export const DEFAULT_TIME_ZONE = "Europe/Paris";

export function portTimeZone(port: Pick<Port, "country_code"> | null | undefined): string {
  if (!port) return DEFAULT_TIME_ZONE;
  return COUNTRY_TIME_ZONES[port.country_code.trim().toUpperCase()] ?? DEFAULT_TIME_ZONE;
}

/** Fuseau du port de départ d'une ligne. */
export function routeDepartureTimeZone(
  routeId: string,
  routes: Pick<RouteLine, "id" | "departure_port_id">[],
  ports: Pick<Port, "id" | "country_code">[],
): string {
  const route = routes.find((item) => item.id === routeId);
  const port = route ? ports.find((item) => item.id === route.departure_port_id) : undefined;
  return portTimeZone(port);
}

/** Fuseau du port d'arrivée d'une ligne. */
export function routeArrivalTimeZone(
  routeId: string,
  routes: Pick<RouteLine, "id" | "arrival_port_id">[],
  ports: Pick<Port, "id" | "country_code">[],
): string {
  const route = routes.find((item) => item.id === routeId);
  const port = route ? ports.find((item) => item.id === route.arrival_port_id) : undefined;
  return portTimeZone(port);
}

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

/** Date du jour (AAAA-MM-JJ) d'un instant, vue depuis un fuseau donné. */
export function dateKeyInZone(value: string | Date, timeZone: string): string {
  let formatter = keyFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    keyFormatters.set(timeZone, formatter);
  }
  return formatter.format(typeof value === "string" ? new Date(value) : value);
}

/** Décalage (en minutes) d'un fuseau par rapport à UTC à un instant donné. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Convertit une date et une heure « murales » (celles du billet, dans le fuseau du port)
 * en instant réel. Exemple : 2026-12-01 + 12:00 à Marseille → 2026-12-01T11:00:00Z.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  // Deuxième passe pour les jours de changement d'heure.
  result = guess - zoneOffsetMinutes(new Date(result), timeZone) * 60000;
  return new Date(result);
}

/** Heure « murale » (HH:MM) d'un instant dans un fuseau. */
export function wallTimeInZone(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

const CITY_BY_ZONE: Record<string, string> = {
  "Africa/Algiers": "d'Alger",
  "Europe/Paris": "de Paris",
  "Europe/Madrid": "de Madrid",
  "Europe/Rome": "de Rome",
  "Europe/Lisbon": "de Lisbonne",
  "Africa/Tunis": "de Tunis",
  "Africa/Casablanca": "de Casablanca",
};

/** Libellé court : « heure de Paris », « heure d'Alger »… */
export function zoneLabel(timeZone: string): string {
  const city = CITY_BY_ZONE[timeZone];
  return city ? `heure ${city}` : "heure locale";
}
