import { wallTimeInZone } from "./time";

type CalendarDeparture = {
  company_id: string;
  departure_at: string;
  duration_minutes: number | null;
  status: string;
};

export type LineCalendarEntry = {
  companyId: string;
  /** Durée la plus fréquente de la compagnie sur cette ligne. */
  durationMinutes: number | null;
  count: number;
  slots: { time: string; days: string[] }[];
};

const WEEK = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function mostFrequent(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Le calendrier d'une ligne, déduit de ses traversées à venir : par compagnie, les heures et les
 * jours réellement programmés. Il ne peut donc pas contredire la liste des prochains départs.
 */
export function lineCalendar(departures: CalendarDeparture[], timeZone: string): LineCalendarEntry[] {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone });
  const label = (iso: string) => {
    const name = weekday.format(new Date(iso)).replace(".", "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const byCompany = new Map<string, CalendarDeparture[]>();
  for (const departure of departures) {
    if (departure.status === "cancelled") continue;
    byCompany.set(departure.company_id, [...(byCompany.get(departure.company_id) ?? []), departure]);
  }
  return [...byCompany.entries()]
    .map(([companyId, own]) => {
      const byTime = new Map<string, Set<string>>();
      for (const departure of own) {
        const time = wallTimeInZone(departure.departure_at, timeZone).slice(0, 5);
        byTime.set(time, (byTime.get(time) ?? new Set()).add(label(departure.departure_at)));
      }
      return {
        companyId,
        durationMinutes: mostFrequent(
          own.flatMap((departure) => (departure.duration_minutes ? [departure.duration_minutes] : [])),
        ),
        count: own.length,
        slots: [...byTime.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([time, days]) => ({
            time,
            days: WEEK.filter((day) => days.has(day)),
          })),
      };
    })
    .sort((a, b) => b.count - a.count);
}
