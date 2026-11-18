import type { Company, Departure, Vessel } from "./types";

/** Durée d'une traversée en minutes : celle publiée, sinon l'écart départ → arrivée. */
export function departureMinutes(
  departure: Pick<Departure, "duration_minutes" | "departure_at" | "arrival_at">,
) {
  if (departure.duration_minutes && departure.duration_minutes > 0)
    return departure.duration_minutes;
  if (!departure.arrival_at) return null;
  const minutes = Math.round(
    (Date.parse(departure.arrival_at) - Date.parse(departure.departure_at)) / 60_000,
  );
  return minutes > 0 ? minutes : null;
}

export type LineOperator = {
  company: Company;
  /** Départs à venir de cette compagnie sur la ligne. */
  count: number;
  /** Durées publiées, la plus courte et la plus longue ; null si aucune n'est connue. */
  minMinutes: number | null;
  maxMinutes: number | null;
  vessels: Vessel[];
};

export type LineStats = {
  /** Départs à venir, annulations exclues. */
  upcoming: number;
  /** Dans les 7 prochains jours. */
  nextWeek: number;
  /** Date du dernier départ connu : l'horizon du calendrier publié. */
  lastAt: string | null;
  operators: LineOperator[];
  vessels: Vessel[];
  /** Durée la plus courte de la ligne, toutes compagnies confondues. */
  fastestMinutes: number | null;
};

const WEEK = 7 * 24 * 3_600_000;

/**
 * Ce que l'on sait vraiment d'une ligne, à partir des départs publiés : aucun chiffre n'est déduit
 * d'une moyenne ou d'une hypothèse. Une donnée absente reste absente (null ou liste vide).
 */
export function lineStats(input: {
  departures: Departure[];
  companies: Company[];
  vessels: Vessel[];
  now?: number;
}): LineStats {
  const now = input.now ?? Date.now();
  const live = input.departures
    .filter(
      (departure) => departure.status !== "cancelled" && Date.parse(departure.departure_at) >= now,
    )
    .sort((a, b) => Date.parse(a.departure_at) - Date.parse(b.departure_at));
  const operators = new Map<string, LineOperator>();
  const vesselIds: string[] = [];
  for (const departure of live) {
    const company = input.companies.find((item) => item.id === departure.company_id);
    if (company) {
      const entry =
        operators.get(company.id) ??
        ({ company, count: 0, minMinutes: null, maxMinutes: null, vessels: [] } as LineOperator);
      entry.count += 1;
      const minutes = departureMinutes(departure);
      if (minutes !== null) {
        entry.minMinutes =
          entry.minMinutes === null ? minutes : Math.min(entry.minMinutes, minutes);
        entry.maxMinutes =
          entry.maxMinutes === null ? minutes : Math.max(entry.maxMinutes, minutes);
      }
      const vessel = departure.vessel_id
        ? input.vessels.find((item) => item.id === departure.vessel_id)
        : undefined;
      if (vessel && !entry.vessels.some((item) => item.id === vessel.id))
        entry.vessels.push(vessel);
      operators.set(company.id, entry);
    }
    if (departure.vessel_id && !vesselIds.includes(departure.vessel_id))
      vesselIds.push(departure.vessel_id);
  }
  const list = [...operators.values()].sort((a, b) => b.count - a.count);
  const durations = list.flatMap((item) => (item.minMinutes === null ? [] : [item.minMinutes]));
  return {
    upcoming: live.length,
    nextWeek: live.filter((departure) => Date.parse(departure.departure_at) < now + WEEK).length,
    lastAt: live.at(-1)?.departure_at ?? null,
    operators: list,
    vessels: vesselIds.flatMap((id) => input.vessels.filter((vessel) => vessel.id === id)),
    fastestMinutes: durations.length ? Math.min(...durations) : null,
  };
}
