import { PAUSE_EVERY_MIN, PAUSE_MIN } from "@/lib/ferry/itinerary";
import { locateOnRoute, type BledRoute, type Stop } from "./data";

/**
 * Un trajet, c'est ce que le voyageur a en tête : « je pars de Lyon, j'embarque à Alicante ».
 * On l'assemble à partir des routes tracées (coupées au bon endroit), puis on le découpe en pauses
 * toutes les 2 h (règle commune du site), avec une nuit au-delà de 10 h de route.
 */
export type Depart = "paris" | "lyon" | "montpellier" | "barcelone" | "madrid";
export type Port = "marseille" | "sete" | "barcelone" | "valence" | "alicante" | "almeria";
export type PortDz = "alger" | "oran" | "bejaia" | "skikda" | "annaba" | "mostaganem" | "ghazaouet";

type LonLat = [number, number];
type Leg = { route: string; from?: LonLat; to?: LonLat };
export type TrajetDef = { from: Depart; port: Port; via?: "cote" | "madrid"; legs: Leg[] };

const LYON: LonLat = [4.8303, 45.7599];
const MONTPELLIER: LonLat = [3.8804, 43.61];
const PORT_VALENCE: LonLat = [-0.3175, 39.444];

const parisLyon: Leg = { route: "E1", to: LYON };
const cote = (until: "barcelone" | "valence" | "alicante" | "almeria"): Leg[] => {
  if (until === "barcelone") return [];
  if (until === "valence") return [{ route: "E3", to: PORT_VALENCE }];
  if (until === "alicante") return [{ route: "E3" }];
  return [{ route: "E3" }, { route: "E4" }];
};

export const TRAJETS: TrajetDef[] = [
  { from: "paris", port: "marseille", legs: [{ route: "E1" }] },
  { from: "lyon", port: "marseille", legs: [{ route: "E1", from: LYON }] },
  {
    from: "paris",
    port: "sete",
    legs: [parisLyon, { route: "E2", to: MONTPELLIER }, { route: "E8" }],
  },
  { from: "lyon", port: "sete", legs: [{ route: "E2", to: MONTPELLIER }, { route: "E8" }] },
  { from: "montpellier", port: "sete", legs: [{ route: "E8" }] },
  ...(["barcelone", "valence", "alicante", "almeria"] as const).flatMap((p): TrajetDef[] => [
    { from: "paris", port: p, via: "cote", legs: [parisLyon, { route: "E2" }, ...cote(p)] },
    { from: "lyon", port: p, legs: [{ route: "E2" }, ...cote(p)] },
    { from: "montpellier", port: p, legs: [{ route: "E2", from: MONTPELLIER }, ...cote(p)] },
    ...(p === "barcelone" ? [] : [{ from: "barcelone" as const, port: p, legs: cote(p) }]),
  ]),
  { from: "paris", port: "alicante", via: "madrid", legs: [{ route: "E5" }, { route: "E6" }] },
  { from: "paris", port: "almeria", via: "madrid", legs: [{ route: "E5" }, { route: "E7" }] },
  { from: "madrid", port: "alicante", legs: [{ route: "E6" }] },
  { from: "madrid", port: "almeria", legs: [{ route: "E7" }] },
];

export const DEPARTS: Depart[] = ["paris", "lyon", "montpellier", "barcelone", "madrid"];
export const PORTS: Port[] = ["marseille", "sete", "barcelone", "valence", "alicante", "almeria"];

export const PLACE_NAME: Record<Depart | Port | PortDz, string> = {
  paris: "Paris",
  lyon: "Lyon",
  montpellier: "Montpellier",
  barcelone: "Barcelone",
  madrid: "Madrid",
  marseille: "Marseille",
  sete: "Sète",
  valence: "Valence",
  alicante: "Alicante",
  almeria: "Almería",
  alger: "Alger",
  oran: "Oran",
  bejaia: "Béjaïa",
  skikda: "Skikda",
  annaba: "Annaba",
  mostaganem: "Mostaganem",
  ghazaouet: "Ghazaouet",
};

/** Lignes vers l'Algérie confirmées en 2026 (recherche du 18/11/2026), par port d'embarquement. */
export const LIGNES: Record<Port, PortDz[]> = {
  marseille: ["alger", "oran", "bejaia", "skikda", "annaba"],
  sete: ["alger", "bejaia", "skikda"],
  barcelone: ["alger", "oran"],
  valence: ["mostaganem", "oran", "alger"],
  alicante: ["alger", "oran"],
  almeria: ["oran", "ghazaouet"],
};

/** Routes tracées au départ de chaque port algérien. */
export const ROUTES_DZ: Record<PortDz, string[]> = {
  ghazaouet: ["A1"],
  oran: ["A2", "A3"],
  mostaganem: ["A4"],
  alger: ["A5", "A6"],
  bejaia: ["A7"],
  skikda: ["A8"],
  annaba: ["A9"],
};

export const portsFrom = (from: Depart) =>
  PORTS.filter((p) => TRAJETS.some((t) => t.from === from && t.port === p));
export const variants = (from: Depart, port: Port) =>
  TRAJETS.filter((t) => t.from === from && t.port === port);

export type ChainStop = Stop & { route: string };
type Seg = {
  route: BledRoute;
  start: number;
  len: number;
  offset: number;
  hours: number;
  h0: number;
};
export type Chain = {
  key: string;
  km: number;
  h: number;
  line: LonLat[];
  /** Kilomètre de chaque point de `line`, depuis le début du trajet. */
  lineKm: number[];
  stops: ChainStop[];
  segs: Seg[];
  /** Routes du trajet sans relevé des haltes. */
  sansReleve: BledRoute[];
};

/** Assemble un trajet : chaque route coupée à son point de départ et d'arrivée, km remis bout à bout. */
export function buildChain(
  key: string,
  legs: Leg[],
  routes: BledRoute[],
  stopsOf: (r: BledRoute) => Stop[],
): Chain | null {
  const segs: Seg[] = [];
  const line: LonLat[] = [];
  const lineKm: number[] = [];
  const stops: ChainStop[] = [];
  let offset = 0;
  let hours = 0;
  for (const leg of legs) {
    const route = routes.find((r) => r.id === leg.route);
    if (!route) return null;
    const a = leg.from ? locateOnRoute(route, ...leg.from).km : 0;
    const b = leg.to ? locateOnRoute(route, ...leg.to).km : route.km;
    const len = Math.max(1, b - a);
    const segHours = (route.h * len) / route.km;
    for (const [lon, lat, km] of route.line)
      if (km >= a && km <= b) {
        line.push([lon, lat]);
        lineKm.push(km - a + offset);
      }
    for (const s of stopsOf(route)) {
      if (s.km < a || s.km > b || s.direction === "retour") continue;
      stops.push({ ...s, km: s.km - a + offset, route: route.id });
    }
    segs.push({ route, start: a, len, offset, hours: segHours, h0: hours });
    offset += len;
    hours += segHours;
  }
  stops.sort((x, y) => x.km - y.km);
  const sansReleve = segs.map((s) => s.route).filter((r) => !r.releve);
  return { key, km: offset, h: hours, line, lineKm, stops, segs, sansReleve };
}

/** Heure de route au km donné, et l'inverse, en suivant la vitesse propre à chaque route. */
export function hoursAt(chain: Chain, km: number) {
  const seg = chain.segs.find((s) => km <= s.offset + s.len) ?? chain.segs[chain.segs.length - 1]!;
  return seg.h0 + (seg.hours * Math.max(0, km - seg.offset)) / seg.len;
}
export function kmAt(chain: Chain, h: number) {
  const seg = chain.segs.find((s) => h <= s.h0 + s.hours) ?? chain.segs[chain.segs.length - 1]!;
  return seg.offset + (seg.len * Math.max(0, h - seg.h0)) / seg.hours;
}
const routeAt = (chain: Chain, km: number) =>
  (chain.segs.find((s) => km <= s.offset + s.len) ?? chain.segs[chain.segs.length - 1]!).route;

export type Etape = {
  id: string;
  type: "pause" | "nuit";
  n: number;
  h: number;
  km: number;
  route: BledRoute;
  best: ChainStop | null;
  others: ChainStop[];
  priere: ChainStop[];
  manger: ChainStop[];
  /** Pause prise avant de rejoindre la grande route (entre chez toi et l'autoroute). */
  horsAxe?: boolean;
};

// Même règle que le reste du site (ferry/itinerary.ts).
const PAUSE_TOUTES_LES = PAUSE_EVERY_MIN / 60;
/** Au plus 10 h de volant par jour ; un départ du matin s'arrête vers 20 h pour dormir. */
const VOLANT_MAX = 10;
const FIN_DE_JOURNEE = 20;
export { PAUSE_MIN };

/** L'heure de reprise le lendemain d'une nuit : l'heure du départ si c'est le matin, sinon 7 h. */
export const reprise = (depart: number) => (depart <= 10 ? depart : 7);

/**
 * Heures de volant d'une journée qui commence à `debut` h. On roule jusqu'à 10 h, et pas après
 * 20 h (pauses de 20 min comprises) ; parti l'après-midi ou le soir, on roule de nuit : seules les 10 h comptent.
 */
export function volantDuJour(debut: number) {
  if (debut >= 14) return VOLANT_MAX;
  const horloge = (L: number) =>
    debut + L + (Math.max(0, Math.ceil(L / PAUSE_TOUTES_LES) - 1) * PAUSE_MIN) / 60;
  let L = VOLANT_MAX;
  while (L > 4 && horloge(L) > FIN_DE_JOURNEE) L -= 0.25;
  return L;
}

/** Halte sans vrai nom dans OpenStreetMap (« (sans nom) », « Lieu de prière »…). */
export const anonyme = (s: Stop) =>
  /^\(sans nom\)$|^lieu de prière$|^hôtel$|^hotel$/i.test(s.n.trim());

/** Pause : on préfère une aire avec de quoi manger et prier, et ce que la communauté a ajouté. */
function scorePause(s: ChainStop, target: number) {
  let v = s.k === "aire" ? 3 : s.k === "carburant" ? 1 : 0;
  const f = new Set(s.f);
  if (f.has("priere")) v += 3;
  if (f.has("ablutions")) v += 1;
  if (f.has("manger")) v += 2;
  if (f.has("halal")) v += 2;
  if (f.has("h24")) v += 1;
  if (f.has("toilettes") || f.has("cafe")) v += 1;
  if (f.has("parking_sur")) v += 2;
  if (s.src !== "osm") v += 3;
  if (anonyme(s)) v -= 2;
  // Station réservée aux poids lourds : pas une pause pour une voiture.
  if (/^as ?24/i.test(s.n.trim())) v -= 6;
  return v - Math.abs(s.km - target) / 12;
}
function scoreNuit(s: ChainStop, target: number) {
  let v = s.k === "dormir" ? 3 : 0;
  if (s.f.includes("parking_sur")) v += 3;
  if (s.f.includes("parking")) v += 1;
  if (s.src !== "osm") v += 3;
  return v - Math.abs(s.km - target) / 20;
}

const near = (
  stops: ChainStop[],
  km: number,
  range: number,
  test: (s: ChainStop) => boolean,
  max: number,
) =>
  stops
    .filter((s) => Math.abs(s.km - km) <= range && test(s))
    .sort((a, b) => Math.abs(a.km - km) - Math.abs(b.km - km))
    .slice(0, max);

/**
 * Découpe le trajet en journées, puis en pauses régulières. Parti à `depart` h, on roule tant que la
 * journée le permet (voir `volantDuJour`), on dort, et on repart le lendemain matin ; s'il reste moins
 * d'une heure, on finit d'une traite. `avant` : heures déjà roulées avant de rejoindre ce trajet
 * (depuis chez vous) ; les heures des étapes comptent depuis le départ de la maison.
 */
export function planEtapes(chain: Chain, avant = 0, depart = 6): Etape[] {
  const T = chain.h + avant;
  const nuits: number[] = [];
  for (let h = 0, debut = depart; nuits.length < 6; debut = reprise(depart)) {
    const L = volantDuJour(debut);
    if (T - h <= L + 1) break;
    h += L;
    nuits.push(h);
  }
  const bornes = [0, ...nuits, T];
  const marks: { type: Etape["type"]; h: number }[] = [];
  for (let i = 0; i < bornes.length - 1; i++) {
    const a = bornes[i]!;
    const L = bornes[i + 1]! - a;
    const n = Math.max(0, Math.ceil(L / PAUSE_TOUTES_LES) - 1);
    for (let j = 1; j <= n; j++) marks.push({ type: "pause", h: a + (L * j) / (n + 1) });
    if (i < nuits.length) marks.push({ type: "nuit", h: bornes[i + 1]! });
  }

  const used = new Set<string>();
  const urbain = (s: ChainStop) => s.src === "osm" && (s.km < 25 || s.km > chain.km - 15);
  let pauses = 0;
  let nNuit = 0;
  return marks.map((m, i): Etape => {
    if (m.h < avant)
      return {
        id: `${chain.key}-${i}`,
        type: m.type,
        n: m.type === "nuit" ? ++nNuit : ++pauses,
        h: m.h,
        km: 0,
        route: chain.segs[0]!.route,
        best: null,
        others: [],
        priere: [],
        manger: [],
        horsAxe: true,
      };
    const km = kmAt(chain, m.h - avant);
    const isNuit = m.type === "nuit";
    const range = isNuit ? 60 : 35;
    const pool = chain.stops.filter(
      (s) =>
        !used.has(s.id) &&
        !urbain(s) &&
        Math.abs(s.km - km) <= range &&
        (isNuit
          ? s.k === "dormir" || (s.src !== "osm" && s.f.includes("dormir"))
          : s.k === "aire" || s.k === "carburant" || (s.src !== "osm" && s.k !== "dormir")),
    );
    const ranked = pool
      .map((s) => ({ s, v: isNuit ? scoreNuit(s, km) : scorePause(s, km) }))
      .sort((a, b) => b.v - a.v)
      .map((x) => x.s);
    const best = ranked[0] ?? null;
    if (best) used.add(best.id);
    const at = best?.km ?? km;
    return {
      id: `${chain.key}-${i}`,
      type: m.type,
      n: isNuit ? ++nNuit : ++pauses,
      h: best ? hoursAt(chain, best.km) + avant : m.h,
      km: at,
      route: routeAt(chain, at),
      best,
      others: ranked.slice(1, 3),
      priere: near(chain.stops, at, 10, (s) => s.k === "priere" && s.id !== best?.id, 2),
      manger: near(chain.stops, at, 8, (s) => s.k === "manger" && s.id !== best?.id, 2),
    };
  });
}

/** « 7 h », « 6 h 45 », « 45 min » : arrondi au quart d'heure, pas de fausse précision. */
export function dureeRonde(h: number) {
  const q = Math.max(1, Math.round(h * 4));
  const hh = Math.floor(q / 4);
  const mm = (q % 4) * 15;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${mm}` : `${hh} h`;
}

/** Distance le long de la route, arrondie, pour situer une halte voisine. */
export const ecartKm = (a: { km: number }, b: { km: number }) =>
  Math.max(1, Math.round(Math.abs(a.km - b.km)));
