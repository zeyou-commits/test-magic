// Génère src/content/vacancesScolaires.data.ts : les vacances scolaires des pays d'Europe où vivent
// les voyageurs, pour le calendrier de « Préparer mon voyage ».
//   node scripts/vacances-scolaires.mjs
// France : calendrier officiel du ministère de l'Éducation nationale (data.education.gouv.fr).
// Autres pays : OpenHolidays (données ouvertes, openholidaysapi.org). Espagne, Italie et Royaume-Uni
// n'y figurent pas : aucun calendrier n'est affiché pour eux plutôt que des dates inventées.
import { writeFileSync } from "node:fs";

const TODAY = new Date().toISOString().slice(0, 10);
const UNTIL = `${new Date().getFullYear() + 2}-08-31`;
const UA = { headers: { Accept: "application/json", "User-Agent": "bledway-calendar/1.0" } };
const get = async (url) => {
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const parisDay = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Le nom d'une période, ramené à une famille commune à tous les pays. */
function kindOf(name) {
  const n = name.toLowerCase();
  if (/toussaint|automne|autumn|herbst|fall/.test(n)) return "toussaint";
  if (/no[eë]l|christmas|weihnacht|nouvel an/.test(n)) return "noel";
  if (/carnaval|carnival|fasching|d[ée]tente|krokus/.test(n)) return "carnaval";
  if (/p[âa]ques|easter|oster/.test(n)) return "paques";
  if (/printemps|spring|fr[üu]hling|may holidays|mai/.test(n)) return "printemps";
  if (/ascension|himmelfahrt/.test(n)) return "ascension";
  if (/pentec[ôo]te|pentecost|whitsun|pfingst/.test(n)) return "pentecote";
  if (/[ée]t[ée]|summer|sommer/.test(n)) return "ete";
  if (/hiver|winter|semester|sportives|f[ée]vrier|mid-year|rel[âa]che/.test(n)) return "hiver";
  return null;
}

/** Même famille, quel que soit le mot du pays : un congé de décembre, c'est Noël ; de février, l'hiver. */
function season(kind, start) {
  const month = Number(start.slice(5, 7));
  if (kind === "hiver" && month === 12) return "noel";
  if ((kind === "printemps" || kind === "paques") && month <= 2) return "hiver";
  return kind;
}

/** Les noms que l'API ne donne qu'en anglais. */
const FRENCH_NAMES = {
  "Baden-Württemberg": "Bade-Wurtemberg",
  Bavaria: "Bavière",
  Brandenburg: "Brandebourg",
  Bremen: "Brême",
  Hamburg: "Hambourg",
  Hesse: "Hesse",
  "Lower Saxony": "Basse-Saxe",
  "Mecklenburg-Western Pomerania": "Mecklembourg-Poméranie-Occidentale",
  "North Rhine-Westphalia": "Rhénanie-du-Nord-Westphalie",
  "Rhineland-Palatinate": "Rhénanie-Palatinat",
  Saxony: "Saxe",
  "Saxony-Anhalt": "Saxe-Anhalt",
  Thuringia: "Thuringe",
  "Central Region": "Centre",
  "North Region": "Nord",
  "South Region": "Sud",
  Carinthia: "Carinthie",
  "Lower Austria": "Basse-Autriche",
  "Upper Austria": "Haute-Autriche",
  Styria: "Styrie",
  Tyrol: "Tyrol",
  Vienna: "Vienne",
};

/** Une période par zone et par famille : les plages qui se chevauchent sont réunies. */
function merge(rows) {
  const out = [];
  const byKey = new Map();
  for (const row of rows.sort((a, b) => a.start.localeCompare(b.start))) {
    const key = `${row.area}|${row.kind}`;
    const last = byKey.get(key);
    if (last && row.start <= addDays(last.end ?? last.start, 3)) {
      if (row.end === null || last.end === null) last.end = null;
      else if (row.end > last.end) last.end = row.end;
      continue;
    }
    const copy = { ...row };
    byKey.set(key, copy);
    out.push(copy);
  }
  return out;
}

async function france() {
  const zones = ["Zone A", "Zone B", "Zone C", "Corse"];
  const base =
    "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
  const rows = [];
  const academies = new Map(zones.map((z) => [z, new Set()]));
  for (const zone of zones) {
    let offset = 0;
    for (;;) {
      const where = encodeURIComponent(
        `zones="${zone}" and end_date>="${TODAY}" and start_date<="${UNTIL}" and population!="Enseignants"`,
      );
      const page = await get(
        `${base}?where=${where}&select=description,start_date,end_date,location&limit=100&offset=${offset}`,
      );
      for (const r of page.results) {
        academies.get(zone).add(r.location);
        const kind = kindOf(r.description);
        if (!kind) continue;
        const start = parisDay(r.start_date);
        const resume = parisDay(r.end_date);
        // « Début des vacances d'été » : la fin n'est pas encore publiée.
        const open = /^d[ée]but/i.test(r.description);
        const end = open ? null : resume > start ? addDays(resume, -1) : start;
        rows.push({
          area: zone === "Corse" ? "corse" : zone.slice(-1),
          kind: season(kind, start),
          start,
          end,
        });
      }
      offset += page.results.length;
      if (!page.results.length || offset >= page.total_count) break;
    }
  }
  const unique = [...new Map(rows.map((r) => [JSON.stringify(r), r])).values()];
  return {
    id: "FR",
    name: "France",
    areaLabel: "zone",
    source: "fr",
    areas: zones.map((z) => ({
      id: z === "Corse" ? "corse" : z.slice(-1),
      name: z === "Corse" ? "Corse" : z,
      hint: [...academies.get(z)]
        .filter((a) => a !== "Corse")
        .sort()
        .join(", "),
    })),
    periods: merge(unique),
  };
}

const OH = "https://openholidaysapi.org";
const text = (names) => {
  const value = (names.find((n) => n.language === "FR") ?? names[0])?.text ?? "";
  return FRENCH_NAMES[value] ?? value;
};

async function openHolidays(cc, name, areaLabel, mode) {
  const rows = await get(
    `${OH}/SchoolHolidays?countryIsoCode=${cc}&languageIsoCode=FR&validFrom=${TODAY}&validTo=${UNTIL}`,
  );
  let areas = [];
  let areaOf = () => [""];
  if (mode === "groups") {
    const groups = await get(`${OH}/Groups?countryIsoCode=${cc}&languageIsoCode=FR`);
    areas = groups.map((g) => ({ id: g.shortName, name: text(g.name) }));
    areaOf = (r) => (r.groups ?? []).map((g) => g.shortName);
  } else if (mode === "subdivisions") {
    const subs = await get(`${OH}/Subdivisions?countryIsoCode=${cc}&languageIsoCode=FR`);
    areas = subs.map((s) => ({ id: s.shortName, name: text(s.name) }));
    const top = new Set(areas.map((a) => a.id));
    areaOf = (r) =>
      r.nationwide
        ? areas.map((a) => a.id)
        : [...new Set((r.subdivisions ?? []).map((s) => s.shortName.split("-")[0]))].filter((id) =>
            top.has(id),
          );
  }
  const periods = [];
  for (const r of rows) {
    const kind = kindOf(text(r.name));
    if (!kind) continue;
    const open = /^d[ée]but/i.test(text(r.name));
    // Les jours isolés (fête locale, pont) ne changent pas un projet de voyage.
    if (!open && r.startDate === r.endDate && kind !== "ascension") continue;
    // Garde-fou : un congé d'hiver ou de printemps de plus de trois semaines est une erreur de saisie.
    const days = open ? 0 : (Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000;
    if (kind !== "ete" && days > 24) {
      console.warn("écartée (durée suspecte)", cc, text(r.name), r.startDate, r.endDate);
      continue;
    }
    for (const area of areaOf(r))
      periods.push({
        area,
        kind: season(kind, r.startDate),
        start: r.startDate,
        end: open ? null : r.endDate,
      });
  }
  const used = new Set(periods.map((p) => p.area));
  return {
    id: cc,
    name,
    areaLabel,
    source: "openholidays",
    areas: areas.filter((a) => used.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    periods: merge(periods),
  };
}

const calendars = [
  await france(),
  await openHolidays("BE", "Belgique", "communauté", "groups"),
  await openHolidays("LU", "Luxembourg", null, "national"),
  await openHolidays("CH", "Suisse", "canton", "subdivisions"),
  await openHolidays("DE", "Allemagne", "Land", "subdivisions"),
  await openHolidays("NL", "Pays-Bas", "région", "groups"),
  await openHolidays("AT", "Autriche", "Land", "subdivisions"),
  await openHolidays("PT", "Portugal", null, "national"),
];

const lines = calendars.map((c) => {
  const periods = c.periods
    .map(
      (p) =>
        `[${JSON.stringify(p.kind)},${JSON.stringify(p.start)},${JSON.stringify(p.end)},${JSON.stringify(p.area)}]`,
    )
    .join(",");
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
