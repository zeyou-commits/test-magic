/**
 * Calendriers récurrents : les mêmes règles que la base (script « calendrier_recurrent »).
 * Jours ISO (1 = lundi … 7 = dimanche), fréquence en semaines comptée depuis la semaine de début,
 * navire en alternance semaine de départ après semaine de départ.
 */
export type Recurrence = {
  weekdays: number[];
  valid_from: string;
  valid_to: string | null;
  default_vessel_id: string | null;
  /** Absent tant que le script n'est pas exécuté : chaque semaine. */
  every_weeks?: number | null;
  vessel_rotation?: string[] | null;
};

const DAY = 86_400_000;
const toTime = (key: string) => Date.parse(`${key}T00:00:00Z`);
const toKey = (time: number) => new Date(time).toISOString().slice(0, 10);

/** 1 = lundi … 7 = dimanche. */
export const isoWeekday = (key: string) => ((new Date(toTime(key)).getUTCDay() + 6) % 7) + 1;
const mondayOf = (key: string) => toTime(key) - (isoWeekday(key) - 1) * DAY;

/** Semaines écoulées depuis la semaine de début (0 = la semaine du début). */
export const weekIndex = (firstDay: string, day: string) =>
  Math.round((mondayOf(day) - mondayOf(firstDay)) / (7 * DAY));

const every = (r: Recurrence) => Math.max(1, r.every_weeks ?? 1);

export function runsOn(r: Recurrence, day: string) {
  if (!r.weekdays.includes(isoWeekday(day))) return false;
  if (day < r.valid_from || (r.valid_to && day > r.valid_to)) return false;
  return weekIndex(r.valid_from, day) % every(r) === 0;
}

/** Le navire prévu par la règle ce jour-là (avant un choix fait pour cette date). */
export function plannedVessel(r: Recurrence, day: string) {
  const rotation = r.vessel_rotation?.filter(Boolean) ?? [];
  if (!rotation.length) return r.default_vessel_id;
  const turn = Math.floor(weekIndex(r.valid_from, day) / every(r));
  return rotation[((turn % rotation.length) + rotation.length) % rotation.length]!;
}

/** Les prochaines dates du calendrier à partir de `from` (incluse). */
export function nextDates(r: Recurrence, from: string, count: number, maxDays = 400) {
  const dates: string[] = [];
  const start = Math.max(toTime(from), toTime(r.valid_from));
  for (let offset = 0; offset <= maxDays && dates.length < count; offset++) {
    const key = toKey(start + offset * DAY);
    if (r.valid_to && key > r.valid_to) break;
    if (runsOn(r, key)) dates.push(key);
  }
  return dates;
}

const DAY_NAMES = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

/** « mar., ven. · toutes les 2 semaines » */
export function recurrenceLabel(r: Recurrence) {
  const days = [...r.weekdays]
    .sort((a, b) => a - b)
    .map((day) => DAY_NAMES[day - 1])
    .filter(Boolean)
    .join(", ");
  const n = every(r);
  return `${days} · ${n === 1 ? "chaque semaine" : `toutes les ${n} semaines`}`;
}
