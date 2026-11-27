import { intlLocale } from "@/lib/i18n";

type Dated = { departure_at: string; status: string | null };

const ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Jours de la semaine où partent les bateaux publiés (heure locale du port), du lundi au dimanche.
 * Sert au « programme » des pages lignes : on ne décrit que ce qui est publié.
 */
export function departureDays(departures: Dated[], timeZone: string, now = Date.now()) {
  const key = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone });
  const label = new Intl.DateTimeFormat(intlLocale(), { weekday: "long", timeZone });
  const seen = new Map<number, string>();
  for (const departure of departures) {
    if (departure.status === "cancelled" || Date.parse(departure.departure_at) < now) continue;
    const date = new Date(departure.departure_at);
    const index = ORDER.indexOf(key.format(date));
    if (index >= 0 && !seen.has(index)) seen.set(index, label.format(date));
  }
  return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, name]) => name);
}
