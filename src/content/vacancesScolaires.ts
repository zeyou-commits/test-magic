import { holidayCalendars, VACANCES_CHECKED } from "./vacancesScolaires.data";

/**
 * Les vacances scolaires des pays d'Europe où vivent les voyageurs : un repère pour choisir sa
 * période de départ. France : calendrier officiel par zone ; autres pays : OpenHolidays.
 * Données générées par scripts/vacances-scolaires.mjs (à relancer chaque année).
 */

export { VACANCES_CHECKED };

export type HolidayKind =
  | "toussaint"
  | "noel"
  | "hiver"
  | "carnaval"
  | "printemps"
  | "paques"
  | "ascension"
  | "pentecote"
  | "ete";

export interface HolidayCalendar {
  id: string;
  name: string;
  /** « zone », « canton », « Land »… ; null : un seul calendrier pour tout le pays. */
  areaLabel: string | null;
  source: "fr" | "openholidays";
  areas: { id: string; name: string; hint?: string }[];
  /** [famille, premier jour, dernier jour (null : fin pas encore publiée), zone ("" : tout le pays)] */
  periods: [HolidayKind, string, string | null, string][];
}

export const holidayKindLabels: Record<HolidayKind, string> = {
  toussaint: "Toussaint",
  noel: "Noël",
  hiver: "Hiver",
  carnaval: "Carnaval",
  printemps: "Printemps",
  paques: "Pâques",
  ascension: "Ascension",
  pentecote: "Pentecôte",
  ete: "Été",
};

export const holidaySources = {
  fr: {
    name: "Ministère de l'Éducation nationale : calendrier scolaire",
    url: "https://www.education.gouv.fr/calendrier-scolaire-100148",
  },
  openholidays: {
    name: "OpenHolidays : vacances scolaires en Europe (données ouvertes)",
    url: "https://www.openholidaysapi.org",
  },
} as const;

/** « FR » (toutes zones), « FR:C », « BE:FR »… */
export type HolidayChoice = string;

export function parseHolidayChoice(choice: HolidayChoice) {
  const [id, area] = choice.split(":");
  const calendar = holidayCalendars.find((c) => c.id === id) ?? null;
  return {
    calendar,
    area: calendar && area && calendar.areas.some((a) => a.id === area) ? area : null,
  };
}

/** Le calendrier par défaut d'un pays de résidence, s'il est publié en données ouvertes. */
export const defaultHolidayChoice = (country: string): HolidayChoice | null =>
  holidayCalendars.some((c) => c.id === country) ? country : null;

export function holidayChoiceLabel(choice: HolidayChoice) {
  const { calendar, area } = parseHolidayChoice(choice);
  if (!calendar) return null;
  const zone = calendar.areas.find((a) => a.id === area);
  if (zone) return `${calendar.name} · ${zone.name}`;
  return calendar.areas.length
    ? `${calendar.name} (${allAreas[calendar.areaLabel ?? ""] ?? "partout"})`
    : calendar.name;
}

const allAreas: Record<string, string> = {
  zone: "toutes zones",
  canton: "tous cantons",
  Land: "tous Länder",
  région: "toutes régions",
  communauté: "toutes communautés",
};

/** Les choix du sélecteur, pays par pays. */
export const holidayChoiceGroups = holidayCalendars.map((calendar) => ({
  label: calendar.name,
  options: [
    { value: calendar.id, label: holidayChoiceLabel(calendar.id)! },
    ...calendar.areas.map((area) => ({
      value: `${calendar.id}:${area.id}`,
      label: `${calendar.name} · ${area.name}${area.hint ? ` (${area.hint})` : ""}`,
    })),
  ],
}));

export type HolidaySpan = {
  kind: HolidayKind;
  label: string;
  start: string;
  /** null : la fin n'est pas encore publiée. */
  end: string | null;
  /** Les dates changent selon la zone : on montre l'ensemble, du plus tôt au plus tard. */
  varies: boolean;
};

const DAY = 86_400_000;

/** Les vacances qui touchent [from, to], réunies quand la zone n'est pas précisée. */
export function holidaysBetween(choice: HolidayChoice, from: string, to: string): HolidaySpan[] {
  const { calendar, area } = parseHolidayChoice(choice);
  if (!calendar) return [];
  const rows = calendar.periods
    .filter(
      ([, start, end, zone]) =>
        (!area || zone === area || zone === "") && (end ?? start) >= from && start <= to,
    )
    .sort((a, b) => a[1].localeCompare(b[1]));
  const spans: (HolidaySpan & { ranges: Set<string> })[] = [];
  for (const [kind, start, end] of rows) {
    const span = spans.find(
      (s) => s.kind === kind && Math.abs(Date.parse(s.start) - Date.parse(start)) < 45 * DAY,
    );
    if (!span) {
      spans.push({
        kind,
        label: holidayKindLabels[kind],
        start,
        end,
        varies: false,
        ranges: new Set([`${start}/${end}`]),
      });
      continue;
    }
    span.ranges.add(`${start}/${end}`);
    span.varies = span.ranges.size > 1;
    if (end && (!span.end || end > span.end)) span.end = end;
  }
  return spans
    .filter((s) => s.end === null || (Date.parse(s.end) - Date.parse(s.start)) / DAY >= 2)
    .map(({ ranges: _ranges, ...span }) => span);
}

/** Le mois AAAA-MM contient-il des vacances pour ce calendrier ? */
export const monthHasHolidays = (choice: HolidayChoice, month: string) =>
  holidaysBetween(choice, `${month}-01`, `${month}-31`).length > 0;
