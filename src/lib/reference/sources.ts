/* eslint-disable @typescript-eslint/no-explicit-any -- réponses JSON des API publiques */
// Les données de référence relevées aux sources officielles ou ouvertes : vacances scolaires
// d'Europe et postes consulaires d'Algérie en Europe. Un seul code pour les deux usages :
//   - scripts/vacances-scolaires.mjs et scripts/consulats-europe.mjs (fichiers du dépôt) ;
//   - la rubrique « Données de référence » de l'admin (relevé, comparaison, approbation).
// Ce fichier est lu tel quel par Node (types effacés) : imports de types seulement, sans alias.
import type { HolidayCalendar, HolidayKind } from "../../content/vacancesScolaires";
import type { EuropeCountryPosts, EuropePost } from "../../content/consulatsEurope";

export type Log = (message: string) => void;

const parisDay = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function getJson(url: string, agent: string, timeout = 20_000): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": agent },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${res.status} ${new URL(url).host}`);
  return res.json();
}

/* ------------------------------------------------------------------ Vacances scolaires */

/** Le nom d'une période, ramené à une famille commune à tous les pays. */
function kindOf(name: string): HolidayKind | null {
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
function season(kind: HolidayKind, start: string): HolidayKind {
  const month = Number(start.slice(5, 7));
  if (kind === "hiver" && month === 12) return "noel";
  if ((kind === "printemps" || kind === "paques") && month <= 2) return "hiver";
  return kind;
}

/** Les noms que l'API ne donne qu'en anglais. */
const FRENCH_NAMES: Record<string, string> = {
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

type Row = { area: string; kind: HolidayKind; start: string; end: string | null };

/** Une période par zone et par famille : les plages qui se chevauchent sont réunies. */
function merge(rows: Row[]): Row[] {
  const out: Row[] = [];
  const byKey = new Map<string, Row>();
  for (const row of [...rows].sort((a, b) => a.start.localeCompare(b.start))) {
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

const toCalendar = (c: Omit<HolidayCalendar, "periods"> & { periods: Row[] }): HolidayCalendar => ({
  ...c,
  periods: c.periods.map((p) => [p.kind, p.start, p.end, p.area]),
});

async function france(today: string, until: string): Promise<HolidayCalendar> {
  const agent = "bledway-calendar/1.0";
  const zones = ["Zone A", "Zone B", "Zone C", "Corse"];
  const base =
    "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
  const rows: Row[] = [];
  const academies = new Map(zones.map((z) => [z, new Set<string>()]));
  for (const zone of zones) {
    let offset = 0;
    for (;;) {
      const where = encodeURIComponent(
        `zones="${zone}" and end_date>="${today}" and start_date<="${until}" and population!="Enseignants"`,
      );
      const page = await getJson(
        `${base}?where=${where}&select=description,start_date,end_date,location&limit=100&offset=${offset}`,
        agent,
      );
      for (const r of page.results) {
        academies.get(zone)!.add(r.location);
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
  return toCalendar({
    id: "FR",
    name: "France",
    areaLabel: "zone",
    source: "fr",
    areas: zones.map((z) => ({
      id: z === "Corse" ? "corse" : z.slice(-1),
      name: z === "Corse" ? "Corse" : z,
      hint: [...academies.get(z)!]
        .filter((a) => a !== "Corse")
        .sort()
        .join(", "),
    })),
    periods: merge(unique),
  });
}

const OH = "https://openholidaysapi.org";
const ohText = (names: any[]) => {
  const value: string = (names.find((n) => n.language === "FR") ?? names[0])?.text ?? "";
  return FRENCH_NAMES[value] ?? value;
};

async function openHolidays(
  cc: string,
  name: string,
  areaLabel: string | null,
  mode: "groups" | "subdivisions" | "national",
  today: string,
  until: string,
  log: Log,
): Promise<HolidayCalendar> {
  const agent = "bledway-calendar/1.0";
  const rows: any[] = await getJson(
    `${OH}/SchoolHolidays?countryIsoCode=${cc}&languageIsoCode=FR&validFrom=${today}&validTo=${until}`,
    agent,
  );
  let areas: { id: string; name: string }[] = [];
  let areaOf: (r: any) => string[] = () => [""];
  if (mode === "groups") {
    const groups: any[] = await getJson(
      `${OH}/Groups?countryIsoCode=${cc}&languageIsoCode=FR`,
      agent,
    );
    areas = groups.map((g) => ({ id: g.shortName, name: ohText(g.name) }));
    areaOf = (r) => (r.groups ?? []).map((g: any) => g.shortName);
  } else if (mode === "subdivisions") {
    const subs: any[] = await getJson(
      `${OH}/Subdivisions?countryIsoCode=${cc}&languageIsoCode=FR`,
      agent,
    );
    areas = subs.map((s) => ({ id: s.shortName, name: ohText(s.name) }));
    const top = new Set(areas.map((a) => a.id));
    areaOf = (r) =>
      r.nationwide
        ? areas.map((a) => a.id)
        : [
            ...new Set<string>(
              (r.subdivisions ?? []).map((s: any) => String(s.shortName).split("-")[0]),
            ),
          ].filter((id) => top.has(id));
  }
  const periods: Row[] = [];
  for (const r of rows) {
    const label = ohText(r.name);
    const kind = kindOf(label);
    if (!kind) continue;
    const open = /^d[ée]but/i.test(label);
    // Les jours isolés (fête locale, pont) ne changent pas un projet de voyage.
    if (!open && r.startDate === r.endDate && kind !== "ascension") continue;
    // Garde-fou : un congé d'hiver ou de printemps de plus de trois semaines est une erreur de saisie.
    const days = open ? 0 : (Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000;
    if (kind !== "ete" && days > 24) {
      log(`${name} : période écartée (durée suspecte) ${label} ${r.startDate} → ${r.endDate}`);
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
  return toCalendar({
    id: cc,
    name,
    areaLabel,
    source: "openholidays",
    areas: areas.filter((a) => used.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    periods: merge(periods),
  });
}

/** Tous les calendriers, relevés aujourd'hui, jusqu'à la fin de l'été dans deux ans. */
export async function fetchHolidayCalendars(
  log: Log = () => undefined,
  now = new Date(),
): Promise<HolidayCalendar[]> {
  const today = now.toISOString().slice(0, 10);
  const until = `${now.getFullYear() + 2}-08-31`;
  const others: [string, string, string | null, "groups" | "subdivisions" | "national"][] = [
    ["BE", "Belgique", "communauté", "groups"],
    ["LU", "Luxembourg", null, "national"],
    ["CH", "Suisse", "canton", "subdivisions"],
    ["DE", "Allemagne", "Land", "subdivisions"],
    ["NL", "Pays-Bas", "région", "groups"],
    ["AT", "Autriche", "Land", "subdivisions"],
    ["PT", "Portugal", null, "national"],
  ];
  const results = await Promise.allSettled([
    france(today, until),
    ...others.map(([cc, name, label, mode]) =>
      openHolidays(cc, name, label, mode, today, until, log),
    ),
  ]);
  const calendars: HolidayCalendar[] = [];
  results.forEach((result, i) => {
    const name = i === 0 ? "France" : others[i - 1]![1];
    if (result.status === "fulfilled") calendars.push(result.value);
    else log(`${name} : source indisponible (${String(result.reason?.message ?? result.reason)})`);
  });
  return calendars;
}

/* ------------------------------------------------------------------ Consulats en Europe */

export const EUROPE_COUNTRIES: Record<string, string> = {
  BE: "Belgique",
  ES: "Espagne",
  IT: "Italie",
  DE: "Allemagne",
  CH: "Suisse",
  NL: "Pays-Bas",
  GB: "Royaume-Uni",
  LU: "Luxembourg",
  AT: "Autriche",
  PT: "Portugal",
  SE: "Suède",
  DK: "Danemark",
  NO: "Norvège",
  IE: "Irlande",
};

const ENTITIES: Record<string, string> = {
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ocirc: "ô",
  icirc: "î",
  ucirc: "û",
  ugrave: "ù",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  Eacute: "É",
  laquo: "«",
  raquo: "»",
  ndash: "–",
  mdash: "—",
  ordm: "º",
  deg: "°",
  szlig: "ß",
  ntilde: "ñ",
  iacute: "í",
  oacute: "ó",
  aacute: "á",
  uacute: "ú",
};
const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
const clean = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/[؀-ۿݐ-ݿ]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*/g, " : ")
    .trim();

/** Les postes d'une fiche du ministère (HTML « infos »). */
export function parseMfaInfos(html: string): EuropePost[] {
  type Draft = Omit<EuropePost, "address" | "point"> & { address: string[] };
  const posts: Draft[] = [];
  let current: Draft | null = null;
  for (const [, inner = ""] of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const strong = /<strong>/.test(inner);
    const line = clean(inner);
    if (!line) continue;
    if (strong && /ambassade|consulat|section consulaire|agence consulaire/i.test(line)) {
      current = {
        name: line.replace(/\s*:\s*$/, "").replace(/Lisbone$/, "Lisbonne"),
        address: [],
        phone: "",
        email: "",
        site: "",
      };
      posts.push(current);
      continue;
    }
    if (!current) continue;
    if (/^t[ée]l/i.test(line)) current.phone ||= line.replace(/^t[ée]l[ée]?(phone)?\s*:?\s*/i, "");
    else if (/^fax/i.test(line)) continue;
    else if (/@/.test(line) && !/\s/.test(line.replace(/\s*\/\s*/g, ""))) current.email ||= line;
    else if (/^(https?:\/\/|www\.)/i.test(line))
      current.site ||= line.startsWith("http") ? line : `https://${line}`;
    else if (/@/.test(line)) current.email ||= line.split(/\s/)[0] ?? "";
    else current.address.push(line);
  }
  return (
    posts
      .filter((p) => /consulat|section consulaire|ambassade/i.test(p.name))
      // Une adresse par poste : la suite (autre mission, autre ville) n'est pas la sienne.
      .map((p) => ({
        ...p,
        address: (p.address.join(", ").split(/, (?:Mission|Représentation) /)[0] ?? "").replace(
          /\.$/,
          "",
        ),
        point: null,
      }))
  );
}

async function geocode(address: string, cc: string): Promise<[number, number] | null> {
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", address);
  url.searchParams.set("limit", "1");
  try {
    const data = await getJson(url.toString(), "bledway-consulats/1.0", 8000);
    const feature = (data.features ?? []).find(
      (f: any) => f.properties?.countrycode?.toUpperCase() === cc,
    );
    const c = feature?.geometry?.coordinates;
    return c ? [Number(c[0].toFixed(4)), Number(c[1].toFixed(4))] : null;
  } catch {
    return null;
  }
}

const LOCAL_CITY: Record<string, string> = {
  Barcelone: "Barcelona",
  Naples: "Napoli",
  Berne: "Bern",
  Lisbonne: "Lisboa",
};

/**
 * Les postes d'Algérie pays par pays, d'après le ministère algérien des Affaires étrangères.
 * known : coordonnées déjà trouvées (par nom de poste), pour ne géocoder que les nouveaux.
 */
export async function fetchEuropePosts(
  known: Map<string, [number, number]>,
  log: Log = () => undefined,
): Promise<EuropeCountryPosts[]> {
  // Les 14 pays en même temps : le relevé tient en quelques secondes côté serveur.
  const one = async ([cc, name]: [string, string]): Promise<EuropeCountryPosts | null> => {
    let list: any[];
    try {
      list = await getJson(
        `https://www.mfa.gov.dz/api/ambassies/api?countries=${cc}`,
        "bledway-consulats/1.0",
      );
    } catch (error) {
      log(`${name} : source indisponible (${(error as Error).message})`);
      return null;
    }
    const posts = list.flatMap((entry) => {
      const found = parseMfaInfos(entry.infos ?? "");
      // Les cartes intégrées par le ministère, dans l'ordre des postes : !2d longitude !3d latitude.
      const maps = [...String(entry.maps ?? "").matchAll(/!2d(-?[\d.]+)!3d(-?[\d.]+)/g)].map(
        (m): [number, number] => [Number(Number(m[1]).toFixed(4)), Number(Number(m[2]).toFixed(4))],
      );
      if (maps.length === found.length) found.forEach((post, i) => (post.point = maps[i]!));
      return found;
    });
    for (const post of posts) {
      if (post.point) continue;
      post.point = known.get(post.name) ?? (post.address ? await geocode(post.address, cc) : null);
      if (post.point) continue;
      // Adresse introuvable : la ville du poste suffit pour classer par distance.
      const city = post.name.match(/ à (.+)$/)?.[1];
      if (city) post.point = await geocode(LOCAL_CITY[city] ?? city, cc);
      if (!post.point) log(`${name} : ${post.name} sans coordonnées`);
    }
    return { country: cc, name, posts };
  };
  const results = await Promise.all(Object.entries(EUROPE_COUNTRIES).map(one));
  return results.filter((c): c is EuropeCountryPosts => c !== null);
}

/* ------------------------------------------------------------------ Contrôle et comparaison */

export type ReferenceKey = "vacances" | "consulats";

export interface ReferenceSummary {
  /** Une ligne par pays : ce qui change. */
  lines: { label: string; detail: string; changed: boolean }[];
  /** Ce qui doit faire hésiter avant d'approuver. */
  warnings: string[];
  changed: number;
}

export function compareHolidays(
  before: HolidayCalendar[],
  after: HolidayCalendar[],
  today: string,
): ReferenceSummary {
  const lines: ReferenceSummary["lines"] = [];
  const warnings: string[] = [];
  const key = (p: HolidayCalendar["periods"][number]) => p.join("|");
  for (const old of before)
    if (!after.some((c) => c.id === old.id))
      warnings.push(
        `${old.name} manque dans le nouveau relevé : l'ancien calendrier disparaîtrait.`,
      );
  for (const cal of after) {
    const old = before.find((c) => c.id === cal.id);
    // Les périodes déjà passées sortent naturellement : on ne compare que l'avenir.
    const future = (c?: HolidayCalendar) =>
      new Set((c?.periods ?? []).filter((p) => (p[2] ?? p[1]) >= today).map(key));
    const a = future(old);
    const b = future(cal);
    const added = [...b].filter((k) => !a.has(k)).length;
    const removed = [...a].filter((k) => !b.has(k)).length;
    const last = cal.periods.reduce((m, p) => (p[1] > m ? p[1] : m), "");
    if (!cal.periods.length) warnings.push(`${cal.name} : aucune période dans le nouveau relevé.`);
    lines.push({
      label: cal.name,
      detail:
        (added || removed
          ? `${added} période${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}, ${removed} retirée${removed > 1 ? "s" : ""}`
          : "aucun changement") + (last ? ` · jusqu'en ${last.slice(0, 4)}` : ""),
      changed: added + removed > 0 || !old,
    });
  }
  return { lines, warnings, changed: lines.filter((l) => l.changed).length };
}

export function compareConsulates(
  before: EuropeCountryPosts[],
  after: EuropeCountryPosts[],
): ReferenceSummary {
  const lines: ReferenceSummary["lines"] = [];
  const warnings: string[] = [];
  for (const old of before)
    if (!after.some((c) => c.country === old.country))
      warnings.push(`${old.name} : le ministère n'a pas répondu, ses postes seraient retirés.`);
  for (const country of after) {
    const old = before.find((c) => c.country === country.country)?.posts ?? [];
    const parts: string[] = [];
    for (const post of country.posts) {
      const prev = old.find((p) => p.name === post.name);
      if (!prev) parts.push(`nouveau : ${post.name}`);
      else {
        const fields = (["address", "phone", "email", "site"] as const).filter(
          (f) => prev[f] !== post[f],
        );
        const names = { address: "adresse", phone: "téléphone", email: "e-mail", site: "site" };
        if (fields.length) parts.push(`${post.name} : ${fields.map((f) => names[f]).join(", ")}`);
      }
    }
    for (const prev of old)
      if (!country.posts.some((p) => p.name === prev.name)) parts.push(`retiré : ${prev.name}`);
    if (old.length && !country.posts.length)
      warnings.push(`${country.name} : plus aucun poste dans le nouveau relevé.`);
    lines.push({
      label: country.name,
      detail: parts.length ? parts.join(" · ") : "aucun changement",
      changed: parts.length > 0,
    });
  }
  return { lines, warnings, changed: lines.filter((l) => l.changed).length };
}

/* ------------------------------------------------------------------ Rappel */

const DAY = 86_400_000;
/** Un relevé de plus de 6 mois est à refaire. */
export const REFERENCE_MAX_AGE_DAYS = 183;

/**
 * Faut-il relancer le relevé ? Trop ancien, ou (vacances) la France ne couvre plus les
 * 9 prochains mois : le prochain été n'est pas encore dedans.
 */
export function referenceDue(
  key: ReferenceKey,
  checked: string,
  today: string,
  calendars: HolidayCalendar[] = [],
): string | null {
  const age = Math.round((Date.parse(today) - Date.parse(checked)) / DAY);
  if (age > REFERENCE_MAX_AGE_DAYS) return `Dernier relevé il y a ${Math.round(age / 30)} mois.`;
  if (key === "vacances") {
    const fr = calendars.find((c) => c.id === "FR");
    const last = fr?.periods.reduce((m, p) => ((p[2] ?? p[1]) > m ? (p[2] ?? p[1]) : m), "") ?? "";
    const horizon = new Date(Date.parse(today) + 270 * DAY).toISOString().slice(0, 10);
    if (last < horizon) return "Le calendrier français ne couvre plus les 9 prochains mois.";
  }
  return null;
}
