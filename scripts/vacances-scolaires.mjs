// Génère src/content/vacancesScolaires.data.ts : les vacances scolaires des pays d'Europe où vivent
// les voyageurs, pour le calendrier de « Préparer mon voyage ».
//   node scripts/vacances-scolaires.mjs
// France : calendrier officiel du ministère de l'Éducation nationale (data.education.gouv.fr).
// Autres pays : OpenHolidays (données ouvertes, openholidaysapi.org). Espagne, Italie et Royaume-Uni
// n'y figurent pas : aucun calendrier n'est affiché pour eux plutôt que des dates inventées.
// Le relevé lui-même est dans src/lib/reference/sources.ts, partagé avec l'admin (« Données de
// référence ») : en production, l'admin le relance et l'approuve sans passer par ce fichier.
import { writeFileSync } from "node:fs";
import { fetchHolidayCalendars } from "../src/lib/reference/sources.ts";

const TODAY = new Date().toISOString().slice(0, 10);
const calendars = await fetchHolidayCalendars((m) => console.warn(m));

const lines = calendars.map((c) => {
  const periods = c.periods.map((p) => JSON.stringify(p)).join(",");
  return `  {\n    id: ${JSON.stringify(c.id)},\n    name: ${JSON.stringify(c.name)},\n    areaLabel: ${JSON.stringify(c.areaLabel)},\n    source: ${JSON.stringify(c.source)},\n    areas: ${JSON.stringify(c.areas)},\n    periods: [${periods}],\n  },`;
});

writeFileSync(
  "src/content/vacancesScolaires.data.ts",
  `// Généré par scripts/vacances-scolaires.mjs le ${TODAY} : ne pas modifier à la main.\n` +
    `import type { HolidayCalendar } from "./vacancesScolaires";\n\n` +
    `export const VACANCES_CHECKED = ${JSON.stringify(TODAY)};\n\n` +
    `export const holidayCalendars: HolidayCalendar[] = [\n${lines.join("\n")}\n];\n`,
);
for (const c of calendars) console.log(c.id, c.areas.length, "zones", c.periods.length, "périodes");
