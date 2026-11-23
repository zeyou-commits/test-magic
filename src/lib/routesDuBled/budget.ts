import { FUEL_EURO_PER_L, FUEL_L_PER_100, TOLL_EURO_PER_KM } from "@/lib/ferry/companion";
import { estimateFerryFare, type FareEstimate } from "@/lib/ferry/pricing";
import type { Sailing } from "@/lib/ferry/trips";
import type { VehicleKind } from "@/components/panel/TripProfile";
import type { Carnet } from "./carnet";
import type { Chemin } from "./porteAPorte";
import { PLACE_NAME, type Port } from "./trajets";

/**
 * « Combien ça coûte ? » pour une route du bled, seulement sur demande : la traversée (prix moyens
 * de la ligne, ajustés à la saison, aux voyageurs et au véhicule, le même calcul que Préparer),
 * l'essence de chaque côté de la mer et les péages en France. Les nuits et les repas n'y sont pas.
 */
export type Reglages = {
  /** Mois du départ, 1 à 12 : il fixe la saison des prix. */
  mois: number;
  adultes: number;
  enfants: number;
  vehicule: Exclude<VehicleKind, "none">;
};
export const REGLAGES_DEFAUT: Reglages = { mois: 7, adultes: 2, enfants: 2, vehicule: "sedan" };

/** Sans plomb en Algérie : environ 45 DA le litre, soit à peu près 0,30 €. */
export const FUEL_DZ_EURO_PER_L = 0.3;
/** Au nord de cette latitude, côté Europe, on roule en France (Le Perthus : 42,46° N). */
const FRANCE_LAT = 42.45;

const PAYS: Record<Port, "FR" | "ES"> = {
  marseille: "FR",
  sete: "FR",
  barcelone: "ES",
  valence: "ES",
  alicante: "ES",
  almeria: "ES",
};

/** Le jour qui représente le mois choisi : le 10, de cette année ou de la suivante s'il est passé. */
export function jourDuMois(mois: number, now = new Date()) {
  const year = mois >= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() + 1;
  return `${year}-${String(mois).padStart(2, "0")}-10`;
}

export type Cout = {
  traversee: FareEstimate;
  essence: number;
  peages: number;
  total: number;
  low: number;
  high: number;
};

export function coutRoute(c: Chemin, k: Carnet, r: Reglages, now = new Date()): Cout {
  const sailing = {
    from: { name: PLACE_NAME[c.eu.port], country_code: PAYS[c.eu.port] },
    to: { name: PLACE_NAME[c.dz.port], country_code: "DZ" },
    dayKey: jourDuMois(r.mois, now),
  } as unknown as Sailing;
  const traversee = estimateFerryFare(sailing, {
    vehicle: r.vehicule,
    accessories: [],
    passengers: {
      adults: Math.max(1, r.adultes),
      seniors: 0,
      children: r.enfants,
      babies: 0,
      pets: 0,
    },
  });
  const kmEu = c.eu.approche.km + (c.eu.chain?.km ?? 0);
  const kmDz = Math.max(0, c.km - kmEu);
  const litres = (km: number) => (km * FUEL_L_PER_100) / 100;
  const essence = litres(kmEu) * FUEL_EURO_PER_L + litres(kmDz) * FUEL_DZ_EURO_PER_L;
  // Les péages comptent sur la partie française seulement (l'autoroute espagnole de la côte est gratuite).
  const kmFrance = Math.max(
    0,
    ...k.pas.filter((p) => p.side === "eu" && p.point[1] >= FRANCE_LAT).map((p) => p.km),
  );
  const peages = kmFrance * TOLL_EURO_PER_KM;
  const route = essence + peages;
  return {
    traversee,
    essence,
    peages,
    total: traversee.amount + route,
    low: traversee.low + route * 0.85,
    high: traversee.high + route * 1.15,
  };
}

/** Arrondi lisible : à la dizaine sous 200 €, sinon à la cinquantaine. */
export const euros = (n: number) =>
  `${(n < 200 ? Math.round(n / 10) * 10 : Math.round(n / 50) * 50).toLocaleString("fr-FR")}${String.fromCharCode(160)}€`;
