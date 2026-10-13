// Vacances scolaires françaises, année 2026-2027 (zones A, B et C).
//
// Convention : `start` est le premier jour de vacances et `end` le jour de REPRISE des cours
// (exclu), comme dans les calendriers officiels : « du samedi 17 octobre au lundi 2 novembre ».
// Source : calendrier officiel du ministère de l'Éducation nationale (education.gouv.fr).
// Les dates sont à vérifier chaque année sur ce site avant de les considérer comme définitives.

export type SchoolZone = "A" | "B" | "C";

export interface SchoolBreak {
  name: string;
  start: string;
  end: string;
  zones: SchoolZone[];
}

/** Description lisible de chaque zone, pour aider à choisir la sienne. */
export const SCHOOL_ZONES: Record<SchoolZone, { label: string; cities: string }> = {
  A: { label: "Zone A", cities: "Lyon, Bordeaux, Grenoble, Dijon, Poitiers, Limoges…" },
  B: { label: "Zone B", cities: "Marseille, Nice, Lille, Nantes, Rennes, Strasbourg, Reims…" },
  C: { label: "Zone C", cities: "Paris, Créteil, Versailles, Toulouse, Montpellier" },
};

const ALL: SchoolZone[] = ["A", "B", "C"];

/** Périodes identiques pour les trois zones, puis périodes décalées selon la zone (hiver, printemps). */
export const SCHOOL_BREAKS_2026_2027: SchoolBreak[] = [
  { name: "Toussaint", start: "2026-10-17", end: "2026-11-02", zones: ALL },
  { name: "Noël", start: "2026-12-19", end: "2027-01-04", zones: ALL },
  { name: "Hiver", start: "2027-02-06", end: "2027-02-22", zones: ["A"] },
  { name: "Hiver", start: "2027-02-13", end: "2027-03-01", zones: ["B"] },
  { name: "Hiver", start: "2027-02-20", end: "2027-03-08", zones: ["C"] },
  { name: "Printemps", start: "2027-04-03", end: "2027-04-19", zones: ["A"] },
  { name: "Printemps", start: "2027-04-10", end: "2027-04-26", zones: ["B"] },
  { name: "Printemps", start: "2027-04-17", end: "2027-05-03", zones: ["C"] },
  { name: "Été", start: "2027-07-03", end: "2027-09-01", zones: ALL },
];

export interface HolidayPeriod {
  /** Identifiant stable (ex. « Hiver-2027-02-13 »). */
  id: string;
  name: string;
  /** Premier jour de vacances. */
  start: string;
  /** Dernier jour de vacances (la veille de la reprise). */
  lastDay: string;
  /** Jour de reprise des cours. */
  reprise: string;
}

/** Ajoute (ou retire) des jours à une date AAAA-MM-JJ. */
export function addDaysKey(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Écart en jours entre deux dates AAAA-MM-JJ (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Périodes de vacances d'une zone qui ne sont pas encore terminées à la date donnée. */
export function holidayPeriods(zone: SchoolZone, fromDay: string): HolidayPeriod[] {
  return SCHOOL_BREAKS_2026_2027.filter((item) => item.zones.includes(zone) && item.end > fromDay)
    .map((item) => ({
      id: `${item.name}-${item.start}`,
      name: item.name,
      start: item.start,
      lastDay: addDaysKey(item.end, -1),
      reprise: item.end,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Toutes les périodes d'une zone (y compris passées), au format historique de l'application. */
export function getSchoolBreaksForZone(zone: SchoolZone): SchoolBreak[] {
  return SCHOOL_BREAKS_2026_2027.filter((item) => item.zones.includes(zone));
}

/** Vacances (zone donnée) couvrant une date ISO, ou null. */
export function schoolBreakOn(dateIso: string, zone: SchoolZone): SchoolBreak | null {
  const day = dateIso.slice(0, 10);
  return getSchoolBreaksForZone(zone).find((item) => day >= item.start && day < item.end) ?? null;
}
