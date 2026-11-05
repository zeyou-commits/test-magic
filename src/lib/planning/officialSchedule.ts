// Vérification du planning BledWay contre les sources officielles (compagnies, ports).
// Code pur, sans accès réseau ni base : la fonction Supabase « schedule-check » lit les pages,
// la base, puis appelle compareSchedule() et portArrivals(). Rien n'est écrit sans validation :
// chaque écart devient une proposition dans l'admin (Veille).

/** Une traversée telle que publiée par la compagnie, heures locales des ports. */
export interface OfficialSailing {
  from: string;
  to: string;
  /** « 2026-11-05T15:00 », heure locale du port de départ. */
  departureLocal: string;
  /** Heure locale du port d'arrivée, si publiée. */
  arrivalLocal?: string | null;
  vessel?: string | null;
}

export interface PortRow {
  id: string;
  name: string;
  country_code: string;
}
export interface RouteRow {
  id: string;
  departure_port_id: string;
  arrival_port_id: string;
}
export interface VesselRow {
  id: string;
  name: string;
}
export interface DepartureRow {
  id: string;
  route_id: string;
  vessel_id: string | null;
  departure_at: string;
  arrival_at: string | null;
  status: string;
}

export type Proposal =
  | {
      kind: "schedule_fix";
      departure_id: string;
      field: "departure_at" | "arrival_at" | "vessel_id";
      proposed_value: string;
      title: string;
      summary: string;
    }
  | {
      kind: "new_departure";
      proposed_value: string;
      title: string;
      summary: string;
    }
  | {
      kind: "remove_departure";
      departure_id: string;
      title: string;
      summary: string;
    }
  | {
      kind: "note";
      title: string;
      summary: string;
    };

const ZONES: Record<string, string> = {
  DZ: "Africa/Algiers",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  TN: "Africa/Tunis",
  MA: "Africa/Casablanca",
  PT: "Europe/Lisbon",
  MT: "Europe/Malta",
};
/** Même règle que la fonction SQL bw_port_zone. */
export const portZone = (country: string) => ZONES[country.trim().toUpperCase()] ?? "Europe/Paris";

/** Heure locale « AAAA-MM-JJTHH:mm » d'un fuseau → instant UTC (ISO). */
export function localToUtc(local: string, zone: string): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`Heure illisible : ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as number[];
  const wanted = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  // Deux passes : l'écart du fuseau dépend de l'instant (heure d'été).
  let guess = wanted;
  for (let i = 0; i < 2; i++) guess = wanted - offsetMinutes(guess, zone) * 60_000;
  return new Date(guess).toISOString().replace(/\.000Z$/, "Z");
}

function offsetMinutes(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => +(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - instant) / 60_000);
}

/** Heure UTC → « 05/11 à 15:00 » dans le fuseau du port. */
export function localLabel(iso: string, zone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(" ", " à ");
}

/** Comparaison de noms : accents, casse, tirets, « II » / « 2 ». */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bii\b/g, "2")
    .replace(/\biii\b/g, "3")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PORT_ALIASES: Record<string, string> = {
  algiers: "alger",
  argel: "alger",
  bejaia: "bejaia",
  bougie: "bejaia",
  valencia: "valence",
  barcelona: "barcelone",
  genova: "genes",
  genoa: "genes",
};
export const portKey = (name: string) => {
  const n = normalizeName(name);
  return PORT_ALIASES[n] ?? n;
};

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** Lignes d'un tableau HTML (cellules en texte). */
export function htmlTables(html: string): string[][][] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((t) =>
    [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
      [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
        decode((c[1] ?? "").replace(/<[^>]*>/g, " "))
          .replace(/\s+/g, " ")
          .trim(),
      ),
    ),
  );
}

/** « 05.11.26 à 15:00 » → « 2026-11-05T15:00 ». */
function corsicaDate(value: string): string | null {
  const m = value.match(/(\d{2})\.(\d{2})\.(\d{2,4})\s*à\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, day, month, yy = "", hour = "", minute] = m;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}`;
}

/** Page « Lignes & horaires » de Corsica Linea : toutes les traversées publiées. */
export function parseCorsicaTimetable(html: string): OfficialSailing[] {
  const out: OfficialSailing[] = [];
  for (const table of htmlTables(html)) {
    for (const row of table) {
      const [dep = "", from = "", arr = "", to = "", , vessel] = row;
      const departureLocal = corsicaDate(dep);
      if (row.length < 6 || !departureLocal || !from || !to) continue;
      out.push({
        departureLocal,
        from,
        arrivalLocal: corsicaDate(arr),
        to,
        vessel: vessel || null,
      });
    }
  }
  return out;
}

/** Navire à quai dans un port, avec l'heure réelle d'accostage (heure locale). */
export interface BerthedVessel {
  vessel: string;
  berthedLocal: string;
}

/** « 05/11/2026 08:10:00 » ou « 05/11/2026 08:10 » → « 2026-11-05T08:10 ». */
function slashDate(value: string): string | null {
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, day, month, year, hour = "", minute] = m;
  return `${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}`;
}

/** Pages « Situation des navires » (Béjaïa, Annaba) : tableau des navires à quai. */
export function parseBerthed(html: string): BerthedVessel[] {
  const out: BerthedVessel[] = [];
  for (const table of htmlTables(html)) {
    const head = (table[0] ?? []).map((h) => normalizeName(h));
    const vesselCol = head.findIndex((h) => h === "navire");
    const timeCol = head.findIndex(
      (h) => h.startsWith("accostage") || h.includes("heure d accostage"),
    );
    if (vesselCol < 0 || timeCol < 0) continue;
    for (const row of table.slice(1)) {
      const berthedLocal = slashDate(row[timeCol] ?? "");
      if (row[vesselCol] && berthedLocal) out.push({ vessel: row[vesselCol], berthedLocal });
    }
  }
  return out;
}

export interface CompareInput {
  companyName: string;
  sourceName: string;
  sailings: OfficialSailing[];
  ports: PortRow[];
  routes: RouteRow[];
  vessels: VesselRow[];
  /** Traversées BledWay de la compagnie, de maintenant à la fin de la période publiée. */
  departures: DepartureRow[];
  now: Date;
  /** Une source partielle (agent, presse) ne peut jamais proposer de retirer une traversée. */
  allowRemovals: boolean;
}

const HOUR = 3_600_000;
const MATCH_WINDOW = 18 * HOUR;
const TOLERANCE_MIN = 5;

/**
 * Compare le planning publié par une compagnie à celui de BledWay, sur la seule période publiée :
 * au-delà de la dernière date publiée, rien n'est jugé (les compagnies ne publient pas toute l'année).
 */
export function compareSchedule(input: CompareInput): Proposal[] {
  const { ports, routes, vessels, now } = input;
  const portByKey = new Map(ports.map((p) => [portKey(p.name), p]));
  const portById = new Map(ports.map((p) => [p.id, p]));
  const routeByPorts = new Map(
    routes.map((r) => [`${r.departure_port_id}>${r.arrival_port_id}`, r]),
  );
  const vesselByKey = new Map(vessels.map((v) => [normalizeName(v.name), v]));
  const vesselName = new Map(vessels.map((v) => [v.id, v.name]));
  const proposals: Proposal[] = [];
  const unknownRoutes = new Set<string>();
  const unknownVessels = new Set<string>();

  type Resolved = {
    sailing: OfficialSailing;
    route: RouteRow;
    departureAt: string;
    arrivalAt: string | null;
    vesselId: string | null;
    fromZone: string;
    toZone: string;
    label: string;
  };
  const resolved: Resolved[] = [];
  for (const sailing of input.sailings) {
    const from = portByKey.get(portKey(sailing.from));
    const to = portByKey.get(portKey(sailing.to));
    if (!from || !to) continue; // Port hors BledWay (Corse, Tunisie…) : pas notre périmètre.
    const route = routeByPorts.get(`${from.id}>${to.id}`);
    if (!route) {
      unknownRoutes.add(`${from.name} → ${to.name}`);
      continue;
    }
    const fromZone = portZone(from.country_code);
    const toZone = portZone(to.country_code);
    const departureAt = localToUtc(sailing.departureLocal, fromZone);
    if (new Date(departureAt).getTime() < now.getTime() + HOUR) continue; // Déjà partie ou imminente.
    let vesselId: string | null = null;
    if (sailing.vessel) {
      vesselId = vesselByKey.get(normalizeName(sailing.vessel))?.id ?? null;
      if (!vesselId) unknownVessels.add(sailing.vessel);
    }
    resolved.push({
      sailing,
      route,
      departureAt,
      arrivalAt: sailing.arrivalLocal ? localToUtc(sailing.arrivalLocal, toZone) : null,
      vesselId,
      fromZone,
      toZone,
      label: `${from.name} → ${to.name} du ${localLabel(departureAt, fromZone)}`,
    });
  }
  if (!resolved.length) return [];

  const horizon = Math.max(...resolved.map((r) => new Date(r.departureAt).getTime()));
  const coveredRoutes = new Set(resolved.map((r) => r.route.id));
  const used = new Set<string>();
  const live = input.departures.filter((d) => d.status !== "cancelled");

  for (const r of resolved) {
    const t = new Date(r.departureAt).getTime();
    const match = live
      .filter((d) => d.route_id === r.route.id && !used.has(d.id))
      .map((d) => ({ d, gap: Math.abs(new Date(d.departure_at).getTime() - t) }))
      .filter((x) => x.gap <= MATCH_WINDOW)
      .sort((a, b) => a.gap - b.gap)[0]?.d;

    if (!match) {
      proposals.push({
        kind: "new_departure",
        title: `Traversée à ajouter : ${r.label}`,
        summary:
          `${input.sourceName} publie ${r.label}` +
          (r.sailing.arrivalLocal ? `, arrivée le ${localLabel(r.arrivalAt!, r.toZone)}` : "") +
          (r.sailing.vessel ? `, navire ${r.sailing.vessel}` : "") +
          ". Elle n'existe pas sur BledWay.",
        proposed_value: JSON.stringify({
          route_id: r.route.id,
          departure_at: r.departureAt,
          arrival_at: r.arrivalAt,
          vessel_id: r.vesselId,
        }),
      });
      continue;
    }
    used.add(match.id);
    const minutes = (a: string, b: string) =>
      Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
    if (minutes(match.departure_at, r.departureAt) > TOLERANCE_MIN) {
      proposals.push({
        kind: "schedule_fix",
        departure_id: match.id,
        field: "departure_at",
        proposed_value: r.departureAt,
        title: `Heure de départ à corriger : ${r.label}`,
        summary: `BledWay affiche un départ le ${localLabel(match.departure_at, r.fromZone)}, ${input.sourceName} publie le ${localLabel(r.departureAt, r.fromZone)}.`,
      });
    }
    if (
      r.arrivalAt &&
      (!match.arrival_at || minutes(match.arrival_at, r.arrivalAt) > TOLERANCE_MIN)
    ) {
      proposals.push({
        kind: "schedule_fix",
        departure_id: match.id,
        field: "arrival_at",
        proposed_value: r.arrivalAt,
        title: `Heure d'arrivée à corriger : ${r.label}`,
        summary: match.arrival_at
          ? `BledWay affiche une arrivée le ${localLabel(match.arrival_at, r.toZone)}, ${input.sourceName} publie le ${localLabel(r.arrivalAt, r.toZone)}.`
          : `BledWay n'a pas d'heure d'arrivée, ${input.sourceName} publie le ${localLabel(r.arrivalAt, r.toZone)}.`,
      });
    }
    if (r.vesselId && match.vessel_id !== r.vesselId) {
      proposals.push({
        kind: "schedule_fix",
        departure_id: match.id,
        field: "vessel_id",
        proposed_value: r.vesselId,
        title: `Navire à corriger : ${r.label}`,
        summary: `BledWay affiche ${match.vessel_id ? (vesselName.get(match.vessel_id) ?? "un autre navire") : "aucun navire"}, ${input.sourceName} annonce ${r.sailing.vessel}.`,
      });
    }
  }

  if (input.allowRemovals) {
    for (const d of live) {
      const t = new Date(d.departure_at).getTime();
      // Marge d'un jour avant la fin de la période publiée : la dernière journée peut être incomplète.
      if (used.has(d.id) || !coveredRoutes.has(d.route_id)) continue;
      if (t < now.getTime() + 2 * HOUR || t > horizon - 24 * HOUR) continue;
      const route = routes.find((x) => x.id === d.route_id)!;
      const from = portById.get(route.departure_port_id)!;
      const to = portById.get(route.arrival_port_id)!;
      const label = `${from.name} → ${to.name} du ${localLabel(d.departure_at, portZone(from.country_code))}`;
      proposals.push({
        kind: "remove_departure",
        departure_id: d.id,
        title: `Traversée absente du planning officiel : ${label}`,
        summary: `${input.sourceName} ne publie aucune traversée ${from.name} → ${to.name} ce jour-là, alors que sa période publiée va jusqu'au ${localLabel(new Date(horizon).toISOString(), portZone(from.country_code)).slice(0, 5)}. Retirer la traversée (les suiveurs ne la verront plus).`,
      });
    }
  }

  for (const route of unknownRoutes) {
    proposals.push({
      kind: "note",
      title: `Liaison ${input.companyName} inconnue de BledWay : ${route}`,
      summary: `${input.sourceName} publie des traversées ${route}, mais cette liaison n'existe pas sur BledWay. À créer dans Réseau si elle doit être suivie.`,
    });
  }
  for (const vessel of unknownVessels) {
    proposals.push({
      kind: "note",
      title: `Navire inconnu de BledWay : ${vessel}`,
      summary: `${input.sourceName} affecte ${vessel} à des traversées, mais ce navire n'existe pas dans la flotte BledWay. Les traversées concernées sont proposées sans navire.`,
    });
  }
  return proposals;
}

export interface ArrivalCheck {
  departure_id: string;
  vessel_id: string;
  vessel: string;
  /** Arrivée prévue (UTC). */
  arrival_at: string;
  web_arrived_at: string | null;
}

/** Navires à quai dans un port d'arrivée : arrivée constatée par la capitainerie. */
export function portArrivals(
  portName: string,
  zone: string,
  berthed: BerthedVessel[],
  expected: ArrivalCheck[],
): {
  departure_id: string;
  vessel_id: string;
  web_arrived_at: string;
  title: string;
  summary: string;
}[] {
  const out = [];
  for (const e of expected) {
    if (e.web_arrived_at) continue;
    const hit = berthed.find((b) => normalizeName(b.vessel) === normalizeName(e.vessel));
    if (!hit) continue;
    const at = localToUtc(hit.berthedLocal, zone);
    const gap = new Date(at).getTime() - new Date(e.arrival_at).getTime();
    // Accostage cohérent avec cette traversée : de 12 h d'avance à 36 h de retard.
    if (gap < -12 * HOUR || gap > 36 * HOUR) continue;
    out.push({
      departure_id: e.departure_id,
      vessel_id: e.vessel_id,
      web_arrived_at: at,
      title: `Arrivée constatée à ${portName} : ${e.vessel}`,
      summary: `La capitainerie de ${portName} indique ${e.vessel} à quai depuis le ${localLabel(at, zone)} (arrivée prévue le ${localLabel(e.arrival_at, zone)}).`,
    });
  }
  return out;
}
