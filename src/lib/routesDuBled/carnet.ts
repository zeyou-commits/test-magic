import { PAUSE_EVERY_MIN, PAUSE_MIN } from "@/lib/ferry/itinerary";
import type { Chemin, LonLat } from "./porteAPorte";
import {
  PLACE_NAME,
  reprise,
  ROUTES_DZ,
  type Chain,
  type ChainStop,
  type Etape,
} from "./trajets";
import { VILLES, nomVille } from "./villes";

/**
 * Le carnet d'un chemin, comme un carnet de voyage : départ, villes traversées, pauses (la prière
 * d'abord), nuits, port, mer, puis la route au bled jusqu'au village. Chaque pas sait où il est
 * sur la carte, à quelle heure de route, et quel jour.
 */
export type PasKind =
  | "depart"
  | "ville"
  | "joint"
  | "pause"
  | "priere"
  | "nuit"
  | "vide"
  | "nuitvide"
  | "port"
  | "portdz"
  | "arrivee"
  | "ajout";
/** Un lieu ajouté par un voyageur hors des routes relevées, ou par toi et pas encore relu. */
export type Ajout = {
  id: string;
  k: ChainStop["k"];
  n: string;
  place: string;
  lat: number;
  lon: number;
  f: ChainStop["f"];
  etat: "attente" | "publie" | "mien" | "refuse";
  note?: string | null;
};
export type Pas = {
  id: string;
  k: PasKind;
  side: "eu" | "dz";
  /** Heures de route depuis la maison (côté Europe) ou depuis le port (côté Algérie). */
  h: number;
  /** Kilomètres depuis la maison (côté Europe) ou depuis le port (côté Algérie). */
  km: number;
  point: LonLat;
  name?: string;
  etape?: Etape;
  /** Lieu de prière mis en tête de la pause. */
  priere?: ChainStop | null;
  /** Lieu relevé retenu pour une pause côté Algérie. */
  lieu?: ChainStop | null;
  /** Numéro de la pause ou de la nuit. */
  n?: number;
  jour: number;
  /** Route du bled la plus proche, pour proposer un lieu dessus. */
  route?: string;
  ajout?: Ajout;
};
export type Carnet = {
  pas: Pas[];
  /** La route jusqu'au village n'a pas (encore) de lieux relevés : à raconter. */
  aRaconter: { km: number; h: number } | null;
  /** Jour d'arrivée au bled (après la traversée). */
  jourBled: number;
};

const R = Math.PI / 180;
export function distKm(a: LonLat, b: LonLat) {
  const x =
    Math.sin(((b[1] - a[1]) * R) / 2) ** 2 +
    Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(((b[0] - a[0]) * R) / 2) ** 2;
  return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export const isPriere = (s: { k: string; f?: string[] } | null | undefined) =>
  !!s && (s.k === "priere" || (s.f ?? []).includes("priere"));

/** Point à une fraction t (0..1) d'une ligne. */
export function pointAt(line: LonLat[], t: number): LonLat {
  if (line.length < 2) return line[0] ?? [0, 0];
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + distKm(line[i - 1]!, line[i]!));
  const goal = cum.at(-1)! * Math.max(0, Math.min(1, t));
  for (let i = 1; i < line.length; i++)
    if (cum[i]! >= goal) {
      const l = cum[i]! - cum[i - 1]!;
      const f = l ? (goal - cum[i - 1]!) / l : 0;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
  return line.at(-1)!;
}

/** Villes à moins de 12 km d'une ligne (hors extrémités), avec leur position (0..1) sur la ligne. */
export function villesSur(line: LonLat[], exclure: string[] = []) {
  if (line.length < 3) return [];
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + distKm(line[i - 1]!, line[i]!));
  const tot = cum.at(-1)! || 1;
  const out: { n: string; t: number; point: LonLat }[] = [];
  for (const [n, p] of Object.entries(VILLES)) {
    if (exclure.includes(nomVille(n))) continue;
    // Tri grossier avant le calcul fin.
    if (!line.some((q) => Math.abs(q[0] - p[0]) < 0.6 && Math.abs(q[1] - p[1]) < 0.6)) continue;
    let bi = -1;
    let bd = Infinity;
    line.forEach((q, i) => {
      const d = distKm(p, q);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    if (bd < 12 && cum[bi]! > 8 && tot - cum[bi]! > 8)
      out.push({ n: nomVille(n), t: cum[bi]! / tot, point: p });
  }
  return out.sort((a, b) => a.t - b.t);
}

const lineOf = (c: Chain | null) => (c ? c.line : []);

/** Le point d'une ligne le plus proche de p : écart en km et position (0..1) sur la ligne. */
export function surLigne(line: LonLat[], p: LonLat) {
  if (line.length < 2) return { d: Infinity, t: 0 };
  const kx = 111.32 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110.57;
  const seg: number[] = [];
  let tot = 0;
  for (let i = 1; i < line.length; i++) {
    const l = distKm(line[i - 1]!, line[i]!);
    seg.push(l);
    tot += l;
  }
  let best = { d: Infinity, at: 0 };
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const ax = (a[0] - p[0]) * kx;
    const ay = (a[1] - p[1]) * ky;
    const dx = (b[0] - a[0]) * kx;
    const dy = (b[1] - a[1]) * ky;
    const l2 = dx * dx + dy * dy;
    const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const d = Math.hypot(ax + u * dx, ay + u * dy);
    if (d < best.d) best = { d, at: acc + u * seg[i - 1]! };
    acc += seg[i - 1]!;
  }
  return { d: best.d, t: tot ? best.at / tot : 0 };
}
/** Un ajout est posé sur le chemin s'il est à moins de 15 km de son tracé. */
const AJOUT_KM = 15;

/** Les villes du côté Europe, pour le titre « par Perpignan · Barcelone · Valence ». */
export function viaVilles(c: Chemin, approche?: LonLat[]) {
  const port = PLACE_NAME[c.eu.port];
  const v = [...villesSur(approche ?? []), ...villesSur(lineOf(c.eu.chain))]
    .map((x) => x.n)
    .filter((n, i, a) => n !== port && a.indexOf(n) === i);
  return v.length <= 3
    ? v
    : [v[Math.floor(v.length * 0.25)]!, v[Math.floor(v.length * 0.6)]!, v.at(-1)!].filter(
        (n, i, a) => a.indexOf(n) === i,
      );
}

const PAUSE_TOUTES = PAUSE_EVERY_MIN / 60;

/**
 * L'heure de chaque moment côté Europe, pour un départ à `depart` heures : la route, plus chaque pause
 * déjà faite ; après une nuit, on repart le lendemain matin (`reprise`). Côté Algérie, l'heure dépend du
 * navire : on garde le temps depuis le port.
 */
export function horaires(pas: Pas[], depart: number, pauseMin = PAUSE_MIN) {
  // Clé = le pas lui-même : deux villes peuvent porter le même nom (Valence en France et en Espagne).
  const out = new Map<Pas, number>();
  let h0 = 0;
  let pauses = 0;
  let debut = depart;
  for (const p of pas) {
    if (p.side !== "eu") break;
    out.set(p, debut + (p.h - h0) + (pauses * pauseMin) / 60);
    if (p.k === "pause" || p.k === "priere" || p.k === "vide") pauses++;
    if (p.k === "nuit" || p.k === "nuitvide") {
      h0 = p.h;
      pauses = 0;
      debut = reprise(depart);
    }
  }
  return out;
}

/** « 8 h 15 », arrondi au quart d'heure (« 6 h » pour une heure pile). */
export function heure(t: number) {
  const m = (((Math.round((t * 60) / 15) * 15) % 1440) + 1440) % 1440;
  const mm = m % 60;
  const nb = String.fromCharCode(160);
  return `${Math.floor(m / 60)}${nb}h${mm ? `${nb}${String(mm).padStart(2, "0")}` : ""}`;
}

export function carnet(
  c: Chemin,
  from: { label: string; point: LonLat },
  to: { label: string; point: LonLat },
  geo?: { approche?: LonLat[] | undefined; fin?: LonLat[] | undefined },
  ajouts: Ajout[] = [],
): Carnet {
  const ap = c.eu.approche;
  const ch = c.eu.chain;
  const dzc = c.dz.chain;
  const dl = c.dz.dernier;
  const apLine = geo?.approche ?? [from.point, c.eu.joint];
  const finLine = geo?.fin ?? [c.dz.sortie, to.point];
  const pe = PLACE_NAME[c.eu.port];
  const pd = PLACE_NAME[c.dz.port];
  const exclure = [from.label, to.label, pe, pd];
  const pas: Omit<Pas, "jour">[] = [];
  const ord = new Map<Omit<Pas, "jour">, number>();
  const push = (p: Omit<Pas, "jour">, o: number) => {
    pas.push(p);
    ord.set(p, o);
  };

  push(
    { id: "depart", k: "depart", side: "eu", h: 0, km: 0, point: from.point, name: from.label },
    0,
  );
  for (const v of villesSur(apLine, exclure))
    push(
      {
        id: `v-a-${v.n}`,
        k: "ville",
        side: "eu",
        h: v.t * ap.h,
        km: v.t * ap.km,
        point: v.point,
        name: v.n,
      },
      0,
    );
  if (ch && ap.km > 3)
    push(
      {
        id: "joint",
        k: "joint",
        side: "eu",
        h: ap.h - 1e-3,
        km: ap.km,
        point: c.eu.joint,
        route: ch.segs[0]!.route.id,
      },
      0,
    );
  if (ch) {
    for (const v of villesSur(ch.line, exclure))
      push(
        {
          id: `v-e-${v.n}`,
          k: "ville",
          side: "eu",
          h: ap.h + v.t * ch.h,
          km: ap.km + v.t * ch.km,
          point: v.point,
          name: v.n,
        },
        0,
      );
    for (const e of c.etapes) {
      // Une pause « avant l'autoroute » qui tomberait après l'arrivée sur l'autoroute n'a plus lieu d'être.
      if (e.horsAxe && e.h > ap.h - 0.25) continue;
      const priere = e.horsAxe
        ? null
        : (e.priere[0] ??
          ch.stops
            .filter((s) => isPriere(s) && Math.abs(s.km - e.km) < 30)
            .sort((a, b) => Math.abs(a.km - e.km) - Math.abs(b.km - e.km))[0] ??
          null);
      const point: LonLat = e.best
        ? [e.best.lon, e.best.lat]
        : e.horsAxe
          ? pointAt(apLine, e.h / Math.max(ap.h, 0.01))
          : pointAt(ch.line, e.km / Math.max(ch.km, 1));
      const k: PasKind =
        e.type === "nuit"
          ? e.best
            ? "nuit"
            : "nuitvide"
          : isPriere(e.best) || priere
            ? "priere"
            : e.best
              ? "pause"
              : "vide";
      push(
        {
          id: e.id,
          k,
          side: "eu",
          h: e.h,
          km: e.horsAxe ? (e.h / Math.max(ap.h, 0.01)) * ap.km : ap.km + e.km,
          point,
          etape: e,
          priere,
          route: e.route.id,
        },
        0,
      );
    }
  }
  const auPort = ap.h + (ch?.h ?? 0);
  const kmPort = ap.km + (ch?.km ?? 0);
  push(
    {
      id: "port",
      k: "port",
      side: "eu",
      h: auPort,
      km: kmPort,
      point: ch ? ch.line.at(-1)! : c.eu.joint,
      name: pe,
    },
    1,
  );

  // Côté Algérie : on recompte depuis le port d'arrivée.
  const portDz: LonLat = dzc ? dzc.line[0]! : c.dz.sortie;
  push({ id: "portdz", k: "portdz", side: "dz", h: 0, km: 0, point: portDz, name: pd }, 2);
  const dzH = (dzc?.h ?? 0) + dl.h;
  const dzKm = (dzc?.km ?? 0) + dl.km;
  if (dzc)
    for (const v of villesSur(dzc.line, exclure))
      push(
        {
          id: `v-d-${v.n}`,
          k: "ville",
          side: "dz",
          h: v.t * dzc.h,
          km: v.t * dzc.km,
          point: v.point,
          name: v.n,
        },
        2,
      );
  for (const v of villesSur(finLine, exclure))
    push(
      {
        id: `v-f-${v.n}`,
        k: "ville",
        side: "dz",
        h: (dzc?.h ?? 0) + v.t * dl.h,
        km: (dzc?.km ?? 0) + v.t * dl.km,
        point: v.point,
        name: v.n,
      },
      2,
    );
  // Pauses côté Algérie, à l'heure : un lieu relevé s'il y en a un tout près, sinon « à placer ».
  const routeDz = dzc?.segs[0]?.route.id ?? ROUTES_DZ[c.dz.port][0] ?? "A3";
  let nDz = 0;
  for (let t = PAUSE_TOUTES; t < dzH - 0.75; t += PAUSE_TOUTES) {
    nDz++;
    const nuit = nDz === 4 && dzH > 10;
    let lieu: ChainStop | null = null;
    let point: LonLat;
    let kmT: number;
    if (dzc && t <= dzc.h) {
      const kmc = (t / dzc.h) * dzc.km;
      kmT = kmc;
      const cands = dzc.stops.filter(
        (s) => s.k !== "port" && s.k !== "billets" && Math.abs(s.km - kmc) < 25,
      );
      lieu =
        cands.find(isPriere) ??
        cands.sort((a, b) => Math.abs(a.km - kmc) - Math.abs(b.km - kmc))[0] ??
        null;
      point = lieu ? [lieu.lon, lieu.lat] : pointAt(dzc.line, kmc / dzc.km);
    } else {
      const f = (t - (dzc?.h ?? 0)) / Math.max(dl.h, 0.01);
      kmT = (dzc?.km ?? 0) + f * dl.km;
      point = pointAt(finLine, f);
    }
    const k: PasKind = nuit
      ? lieu
        ? "nuit"
        : "nuitvide"
      : lieu
        ? isPriere(lieu)
          ? "priere"
          : "pause"
        : "vide";
    push(
      {
        id: `dz-${nDz}`,
        k,
        side: "dz",
        h: t,
        km: kmT,
        point,
        lieu,
        priere: isPriere(lieu) ? lieu : null,
        route: routeDz,
      },
      2,
    );
  }
  // Les lieux ajoutés par les voyageurs, posés à leur place sur le chemin.
  const morceaux: {
    line: LonLat[];
    h0: number;
    h: number;
    km0: number;
    km: number;
    side: "eu" | "dz";
    o: number;
    route?: string;
  }[] = [
    {
      line: apLine,
      h0: 0,
      h: ap.h,
      km0: 0,
      km: ap.km,
      side: "eu",
      o: 0,
      ...(ch ? { route: ch.segs[0]!.route.id } : {}),
    },
    ...(ch
      ? [
          {
            line: ch.line,
            h0: ap.h,
            h: ch.h,
            km0: ap.km,
            km: ch.km,
            side: "eu" as const,
            o: 0,
            route: ch.segs[0]!.route.id,
          },
        ]
      : []),
    ...(dzc
      ? [
          {
            line: dzc.line,
            h0: 0,
            h: dzc.h,
            km0: 0,
            km: dzc.km,
            side: "dz" as const,
            o: 2,
            route: routeDz,
          },
        ]
      : []),
    {
      line: finLine,
      h0: dzc?.h ?? 0,
      h: dl.h,
      km0: dzc?.km ?? 0,
      km: dl.km,
      side: "dz",
      o: 2,
      route: routeDz,
    },
  ];
  for (const a of ajouts) {
    const p: LonLat = [a.lon, a.lat];
    let best: { m: (typeof morceaux)[number]; t: number; d: number } | null = null;
    for (const m of morceaux) {
      const r = surLigne(m.line, p);
      if (r.d < AJOUT_KM && (!best || r.d < best.d)) best = { m, t: r.t, d: r.d };
    }
    if (!best) continue;
    const { m, t } = best;
    push(
      {
        id: `aj-${a.id}`,
        k: "ajout",
        side: m.side,
        h: m.h0 + t * m.h,
        km: m.km0 + t * m.km,
        point: p,
        name: a.n,
        ajout: a,
        ...(m.route ? { route: m.route } : {}),
      },
      m.o,
    );
  }
  push(
    {
      id: "arrivee",
      k: "arrivee",
      side: "dz",
      h: dzH + 1e-3,
      km: dzKm,
      point: to.point,
      name: to.label,
    },
    3,
  );

  pas.sort((a, b) => ord.get(a)! - ord.get(b)! || a.h - b.h);
  // Deux villes du même nom (Valence en France puis en Espagne) : un identifiant chacune.
  const vus = new Set<string>();
  for (const p of pas) {
    let id = p.id;
    for (let n = 2; vus.has(id); n++) id = `${p.id}-${n}`;
    vus.add(id);
    p.id = id;
  }
  // Numéros des pauses et des nuits (deux comptes séparés : Pause 3, Nuit 1, Pause 4), et jours.
  let nPause = 0;
  let nNuit = 0;
  let jour = 1;
  let jourBled = 1;
  const out: Pas[] = [];
  for (const p of pas) {
    if (p.k === "portdz") {
      if ((c.mer ?? 0) >= 8 * 60) jour++;
      jourBled = jour;
    }
    const x: Pas = { ...p, jour };
    if (p.k === "nuit" || p.k === "nuitvide") x.n = ++nNuit;
    else if (["pause", "priere", "vide"].includes(p.k)) x.n = ++nPause;
    out.push(x);
    if (p.k === "nuit" || p.k === "nuitvide") jour++;
  }
  // Plus de 150 km hors des routes relevées jusqu'au village : personne ne l'a encore racontée.
  const aRaconter = dl.km > 150 ? { km: dl.km, h: dl.h } : null;
  return { pas: out, aRaconter, jourBled };
}
