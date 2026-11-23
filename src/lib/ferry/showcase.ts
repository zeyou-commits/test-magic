import {
  estimateFerryFare,
  PRICE_BENCHMARKS,
  type FareEstimate,
  type PriceSeason,
} from "./pricing";
import type { Departure, Port } from "./types";
import type { Sailing } from "./trips";
import type { TripProfileValue, VehicleKind } from "@/components/panel/TripProfile";

const WEEK = 7 * 24 * 3_600_000;

/**
 * Cadence d'une ligne, lue sur le calendrier publié : moyenne par semaine sur les 4 prochaines semaines
 * (les calendriers lointains sont souvent incomplets) quand le calendrier les couvre, sinon le nombre
 * de départs des 7 prochains jours. Aucun départ : null.
 */
export function weeklyPace(
  departures: Pick<Departure, "departure_at" | "status">[],
  now = Date.now(),
): { value: number; kind: "average" | "nextWeek"; weeks: number } | null {
  const live = departures
    .filter((item) => item.status !== "cancelled" && Date.parse(item.departure_at) >= now)
    .map((item) => Date.parse(item.departure_at));
  if (!live.length) return null;
  const last = Math.max(...live);
  const weeks = Math.min(4, Math.floor((last - now) / WEEK));
  if (weeks >= 2) {
    const count = live.filter((at) => at < now + weeks * WEEK).length;
    return { value: Math.max(1, Math.round(count / weeks)), kind: "average", weeks };
  }
  return { value: live.filter((at) => at < now + WEEK).length, kind: "nextWeek", weeks: 1 };
}

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** Le relevé publié pour ce sens exact (Direct Ferries, sept.–oct. 2026), sinon null. */
export function lineBenchmark(from: Pick<Port, "name">, to: Pick<Port, "name">) {
  return PRICE_BENCHMARKS[`${normalized(from.name)}|${normalized(to.name)}`] ?? null;
}

/** Un jour représentatif de chaque saison tarifaire (seuls le mois et le jour comptent). */
export const SEASON_DAYS: { season: PriceSeason; label: string; months: string; dayKey: string }[] =
  [
    { season: "calme", label: "Période calme", months: "janv.–mars, nov.", dayKey: "2027-02-15" },
    {
      season: "intermediaire",
      label: "Intermédiaire",
      months: "avr.–mi-juin, mi-sept.–oct., déc.",
      dayKey: "2027-05-15",
    },
    {
      season: "forte",
      label: "Forte demande",
      months: "mi-juin–mi-juil., début sept.",
      dayKey: "2027-07-01",
    },
    { season: "pointe", label: "Pointe estivale", months: "mi-juil.–août", dayKey: "2027-08-05" },
  ];

const soloProfile = (vehicle: VehicleKind): TripProfileValue => ({
  vehicle,
  accessories: [],
  passengers: { adults: 1, seniors: 0, children: 0, babies: 0, pets: 0 },
});

/**
 * Estimation BledWay d'un aller simple selon la saison, pour 1 adulte à pied et 1 adulte avec une berline.
 * Le même calcul que le reste du site (estimateFerryFare) ; seulement pour une ligne relevée.
 */
export function seasonFares(
  from: Port,
  to: Port,
): { season: (typeof SEASON_DAYS)[number]; foot: FareEstimate; car: FareEstimate }[] | null {
  if (!lineBenchmark(from, to)) return null;
  return SEASON_DAYS.map((season) => {
    const sailing = { from, to, dayKey: season.dayKey } as unknown as Sailing;
    return {
      season,
      foot: estimateFerryFare(sailing, soloProfile("none")),
      car: estimateFerryFare(sailing, soloProfile("sedan")),
    };
  });
}
