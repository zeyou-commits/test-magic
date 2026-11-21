import { locateOnRoute, type BledRoute, type Stop } from "./data";
import {
  buildChain,
  LIGNES,
  planEtapes,
  PORTS,
  ROUTES_DZ,
  TRAJETS,
  type Chain,
  type Etape,
  type Port,
  type PortDz,
} from "./trajets";

/**
 * Porte à porte : n'importe quelle adresse en Europe, n'importe quel village en Algérie.
 * On raccroche le départ à la grande route la plus proche, on accroche l'arrivée au meilleur
 * port et à la meilleure route, et on garde les bouts « hors des grands axes » à part :
 * estimés d'abord, puis mesurés par OSRM quand la réponse arrive.
 */
export type LonLat = [number, number];
export type Lieu = { label: string; point: LonLat };
/** Un bout de route hors des grands axes. `mesure` : calculé par OSRM ; sinon estimé. */
export type Bout = { km: number; h: number; mesure: boolean };
export type Mesures = (a: LonLat, b: LonLat) => Bout | null;

const PORTS_DZ: PortDz[] = [
  "ghazaouet",
  "oran",
  "mostaganem",
  "alger",
  "bejaia",
  "skikda",
  "annaba",
];

/** Même règle que l'outil étape par étape : vol d'oiseau × 1,32, à 68 km/h de moyenne. */
export function estimeBout(a: LonLat, b: LonLat): Bout {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 1.32;
  return { km, h: km / 68, mesure: false };
}
export const cleBout = (a: LonLat, b: LonLat) =>
  `${a[0].toFixed(4)},${a[1].toFixed(4)}>${b[0].toFixed(4)},${b[1].toFixed(4)}`;

const pointAt = (route: BledRoute, km: number): LonLat => {
  let best = route.line[0]!;
  for (const p of route.line) if (Math.abs(p[2] - km) < Math.abs(best[2] - km)) best = p;
  return [best[0], best[1]];
};

/** Point d'un port, pris au bout de la route qui y mène. */
export function portPoint(routes: BledRoute[], p: Port | PortDz): LonLat | null {
  const r = (id: string) => routes.find((x) => x.id === id);
  const end = (id: string) => {
    const x = r(id);
    return x ? pointAt(x, x.km) : null;
  };
  const start = (id: string) => {
    const x = r(id);
    return x ? pointAt(x, 0) : null;
  };
  if (p === "valence") return [-0.3175, 39.444];
  const eu: Partial<Record<Port, string>> = {
    marseille: "E1",
    sete: "E8",
    barcelone: "E2",
    alicante: "E3",
    almeria: "E4",
  };
  if (eu[p as Port]) return end(eu[p as Port]!);
  const dz = ROUTES_DZ[p as PortDz]?.[0];
  return dz ? start(dz) : null;
}

export type OptionEu = {
  key: string;
  port: Port;
  /** Grand axe suivi (null : on va directement au port). */
  chain: Chain | null;
  /** Où l'on rejoint le grand axe (ou le port). */
  joint: LonLat;
  approche: Bout;
  h: number;
};

/** Côté Europe : pour chaque trajet tracé, le point le plus proche du départ, et le trajet coupé là. */
export function optionsEurope(
  routes: BledRoute[],
  stopsOf: (r: BledRoute) => Stop[],
  from: LonLat,
  mesures?: Mesures,
): OptionEu[] {
  const best = new Map<string, OptionEu>();
  const bout = (b: LonLat) => mesures?.(from, b) ?? estimeBout(from, b);
  // Un bout mesuré passe avant un bout estimé : sinon une variante non mesurée
  // reprendrait la place de celle qui vient d'être calculée.
  const rang = (o: OptionEu) => (o.approche.mesure ? 0 : 1000) + o.h;
  const keep = (o: OptionEu) => {
    const old = best.get(o.key);
    if (!old || rang(old) > rang(o)) best.set(o.key, o);
  };
  for (const t of TRAJETS) {
    let bi = -1;
    let bp: LonLat | null = null;
    let bd = Infinity;
    t.legs.forEach((leg, i) => {
      const r = routes.find((x) => x.id === leg.route);
      if (!r) return;
      const a = leg.from ? locateOnRoute(r, ...leg.from).km : 0;
      const b = leg.to ? locateOnRoute(r, ...leg.to).km : r.km;
      const kx = Math.cos((from[1] * Math.PI) / 180);
      for (const [lon, lat, km] of r.line) {
        if (km < a || km > b - 1) continue;
        const d = ((lon - from[0]) * kx) ** 2 + (lat - from[1]) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
          bp = [lon, lat];
        }
      }
    });
    if (bi < 0 || !bp) continue;
    const legs = [{ ...t.legs[bi]!, from: bp }, ...t.legs.slice(bi + 1)];
    const key = `${t.port}:${legs.map((l) => l.route).join(">")}`;
    const chain = buildChain(key, legs, routes, stopsOf);
    if (!chain) continue;
    const approche = bout(bp);
    keep({ key, port: t.port, chain, joint: bp, approche, h: approche.h + chain.h });
  }
  // Tout près d'un port : on y va directement, sans grand axe.
  for (const p of PORTS) {
    const pt = portPoint(routes, p);
    if (!pt || estimeBout(from, pt).km > 160) continue;
    const approche = bout(pt);
    keep({ key: `${p}:direct`, port: p, chain: null, joint: pt, approche, h: approche.h });
  }
  const routesDe = (o: OptionEu) => o.chain?.segs.map((s) => s.route.id) ?? [];
  // Un trajet qui ne fait que reprendre la fin d'un autre, rejoint de plus loin, est un doublon :
  // l'autre passe déjà par là (ex. « E3 » seul quand « E2 > E3 » est rejoint plus près).
  const suite = (x: OptionEu, y: OptionEu) => {
    const a = routesDe(x);
    const b = routesDe(y);
    return (
      x !== y &&
      x.port === y.port &&
      a.length > 0 &&
      a.length < b.length &&
      a.every((r, i) => r === b[b.length - a.length + i]) &&
      x.approche.km >= y.approche.km
    );
  };
  const all = [...best.values()];
  const list = all.filter((x) => !all.some((y) => suite(x, y)));
  // Pas deux fois le même port : « direct » seulement s'il est le meilleur, et pas de grand axe de 30 km.
  return list.filter((o) =>
    !o.chain
      ? !list.some((x) => x !== o && x.port === o.port && x.h <= o.h)
      : !(o.chain.km < 30 && list.some((x) => !x.chain && x.port === o.port)),
  );
}

export type OptionDz = {
  port: PortDz;
  /** Route suivie après le port, coupée au plus près du village (null : le village est au port). */
  chain: Chain | null;
  /** Où l'on quitte la grande route. */
  sortie: LonLat;
  dernier: Bout;
  h: number;
};

/** Côté Algérie : par quel port et quelle route on arrive au plus près du village. */
export function optionsAlgerie(
  routes: BledRoute[],
  stopsOf: (r: BledRoute) => Stop[],
  dest: LonLat,
  mesures?: Mesures,
): OptionDz[] {
  const out: OptionDz[] = [];
  const bout = (a: LonLat) => mesures?.(a, dest) ?? estimeBout(a, dest);
  for (const port of PORTS_DZ) {
    const pt = portPoint(routes, port);
    if (!pt) continue;
    const cands: OptionDz[] = [];
    const direct = bout(pt);
    cands.push({ port, chain: null, sortie: pt, dernier: direct, h: direct.h });
    for (const id of ROUTES_DZ[port]) {
      const r = routes.find((x) => x.id === id);
      if (!r) continue;
      const { km } = locateOnRoute(r, ...dest);
      if (km < 5) continue;
      const sortie = pointAt(r, km);
      const chain = buildChain(
        `${id}-${Math.round(km)}`,
        [{ route: id, to: sortie }],
        routes,
        stopsOf,
      );
      if (!chain) continue;
      const dernier = bout(sortie);
      cands.push({ port, chain, sortie, dernier, h: chain.h + dernier.h });
    }
    // Une vraie route tracée vaut mieux qu'un bout estimé à vol d'oiseau, sans bons plans.
    // Et, comme côté Europe, le bout mesuré passe avant les bouts estimés.
    const cout = (c: OptionDz) => (c.dernier.mesure ? 0 : 1000) + c.h + c.dernier.km / 50;
    const best = cands.sort((a, b) => cout(a) - cout(b))[0]!;
    if (estimeBout(best.sortie, dest).km <= 300) out.push(best);
  }
  return out.sort((a, b) => a.h - b.h);
}

/** Plus de 100 km de grande route sans aucun lieu relevé : on le montre, pour que ça se remplisse. */
export function trous(chain: Chain, min = 100): [number, number][] {
  const ks = chain.stops.map((s) => s.km).sort((a, b) => a - b);
  const out: [number, number][] = [];
  let prev = 0;
  for (const k of ks) {
    if (k - prev > min) out.push([prev, k]);
    prev = k;
  }
  if (chain.km - prev > min) out.push([prev, chain.km]);
  return out;
}

export type Chemin = {
  id: string;
  eu: OptionEu;
  dz: OptionDz;
  /** Heures de route, de la porte au port puis du port au village (traversée non comprise). */
  h: number;
  /** Durée habituelle de la traversée, en minutes ; null si la ligne ne la donne pas. */
  mer: number | null;
  km: number;
  etapes: Etape[];
  bonsPlans: number;
  trousKm: number;
};

/** Durée habituelle d'une traversée, en minutes, dans le sens Europe → Algérie. */
export type DureeMer = (port: Port, dz: PortDz) => number | null;

/** Porte à porte en heures (route + mer, sans l'attente au port) ; null sans durée de traversée. */
export const heuresEnTout = (c: Chemin) => (c.mer == null ? null : c.h + c.mer / 60);

/**
 * Les chemins possibles, du plus court au plus long porte à porte ; un seul par grand axe, trois au plus.
 * Une ligne sans durée de traversée connue passe après les autres, classée par heures de route.
 */
export function chemins(eu: OptionEu[], dz: OptionDz[], max = 3, mer?: DureeMer): Chemin[] {
  const all: Chemin[] = [];
  for (const o of eu)
    for (const d of dz) {
      if (!LIGNES[o.port].includes(d.port)) continue;
      const etapes = o.chain ? planEtapes(o.chain, o.approche.h) : [];
      const t = [...(o.chain ? trous(o.chain) : []), ...(d.chain ? trous(d.chain) : [])];
      all.push({
        id: `${o.key}~${d.port}`,
        eu: o,
        dz: d,
        h: o.h + d.h,
        mer: mer?.(o.port, d.port) ?? null,
        km: o.approche.km + (o.chain?.km ?? 0) + (d.chain?.km ?? 0) + d.dernier.km,
        etapes,
        bonsPlans: (o.chain?.stops.length ?? 0) + (d.chain?.stops.length ?? 0),
        trousKm: t.reduce((s, [a, b]) => s + b - a, 0),
      });
    }
  const rang = (c: Chemin) => heuresEnTout(c) ?? 1e6 + c.h;
  all.sort((a, b) => rang(a) - rang(b));
  const seen = new Set<string>();
  const pick: Chemin[] = [];
  for (const c of all) {
    if (seen.has(c.eu.key)) continue;
    seen.add(c.eu.key);
    pick.push(c);
    if (pick.length === max) break;
  }
  return pick;
}

/** Meilleure option par port d'embarquement, quand seul le départ est connu. */
export function parPort(eu: OptionEu[]): OptionEu[] {
  const m = new Map<Port, OptionEu>();
  for (const o of eu) if (!m.has(o.port) || m.get(o.port)!.h > o.h) m.set(o.port, o);
  return [...m.values()].sort((a, b) => a.h - b.h);
}
