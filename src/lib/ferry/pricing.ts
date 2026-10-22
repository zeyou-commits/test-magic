import { createContext, useContext } from "react";
import type { Sailing } from "./trips";
import { defaultTripProfile, type TripProfileValue, type VehicleKind } from "@/components/panel/TripProfile";

/** Repères publiés par Direct Ferries en septembre–octobre 2026, aller simple.
 * « Avec voiture » est le prix d'une réservation avec voiture, pas un supplément véhicule.
 * Les compositions exactes et les cabines ne sont pas garanties comparables entre lignes.
 */
type RouteBenchmark = { foot: number; withCar: number; source: string };
export const PRICE_BENCHMARKS: Record<string, RouteBenchmark> = {
  "sete|bejaia": { foot: 162, withCar: 423, source: "https://www.directferries.fr/sete_bejaia_ferry.htm" },
  "sete|alger": { foot: 299, withCar: 830, source: "https://www.directferries.fr/sete_alger_ferry.htm" },
  "marseille|alger": { foot: 308, withCar: 617, source: "https://www.directferries.fr/marseille_alger_ferry.htm" },
  "barcelone|alger": { foot: 181, withCar: 520, source: "https://www.directferries.fr/barcelone_alger_ferry.htm" },
  "alger|barcelone": { foot: 239, withCar: 1004, source: "https://www.directferries.fr/alger_barcelone_ferry.htm" },
  "valence|mostaganem": { foot: 116, withCar: 643, source: "https://www.directferries.fr/valence_mostaganem_ferry.htm" },
  "almeria|oran": { foot: 116, withCar: 515, source: "https://www.directferries.fr/almeria_oran_ferry.htm" },
  "oran|almeria": { foot: 127, withCar: 343, source: "https://www.directferries.fr/oran_almeria_ferry.htm" },
};

export type PriceSeason = "calme" | "intermediaire" | "forte" | "pointe";
export type FareEstimate = {
  amount: number;
  low: number;
  high: number;
  vehiclePart: number;
  season: PriceSeason;
  source: string | null;
  benchmarked: boolean;
};

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
const round10 = (value: number) => Math.round(value / 10) * 10;

export function priceSeason(dayKey: string): PriceSeason {
  const [, rawMonth, rawDay] = dayKey.split("-");
  const month = Number(rawMonth);
  const day = Number(rawDay);
  if ((month === 7 && day >= 15) || month === 8) return "pointe";
  if ((month === 6 && day >= 15) || month === 7 || (month === 9 && day <= 10)) return "forte";
  if ([4, 5, 6, 9, 10, 12].includes(month)) return "intermediaire";
  return "calme";
}

const SEASON_FACTOR: Record<PriceSeason, number> = {
  calme: 0.88,
  intermediaire: 1,
  forte: 1.28,
  pointe: 1.6,
};

const VEHICLE_FACTOR: Record<VehicleKind, number> = {
  none: 0,
  city: 0.9,
  sedan: 1,
  suv: 1.22,
  van: 1.35,
  utility: 1.55,
};

export function estimateFerryFare(sailing: Sailing, profile: TripProfileValue): FareEstimate {
  const key = `${normalized(sailing.from.name)}|${normalized(sailing.to.name)}`;
  const benchmark = PRICE_BENCHMARKS[key];
  const reverse = PRICE_BENCHMARKS[`${normalized(sailing.to.name)}|${normalized(sailing.from.name)}`];
  // Une ligne inconnue garde un ordre de grandeur explicite, selon la rive de départ.
  const departureInFrance = sailing.from.country_code === "FR";
  const foot = benchmark?.foot ?? reverse?.foot ?? (departureInFrance ? 230 : 155);
  const withCar = benchmark?.withCar ?? reverse?.withCar ?? (departureInFrance ? 610 : 490);
  const season = priceSeason(sailing.dayKey);
  const p = profile.passengers;
  const passengers = Math.max(foot, 80) * (p.adults + p.seniors * 0.85 + p.children * 0.55 + p.babies * 0.1);
  const vehicleBase = Math.max(120, withCar - foot);
  const accessories = profile.vehicle === "none" ? 0 : profile.accessories.reduce((sum, item) => sum + (item === "trailer" ? 165 : item === "roofbox" ? 75 : 40), 0);
  const vehiclePart = profile.vehicle === "none" ? 0 : round10((vehicleBase * VEHICLE_FACTOR[profile.vehicle] + accessories) * SEASON_FACTOR[season]);
  const seasonalPassengers = passengers * SEASON_FACTOR[season];
  // Les prix moyens publiés ne sont pas des devis. La fourchette couvre disponibilité,
  // délai de réservation, opérateur et hébergement non renseigné dans le profil.
  const amount = round10(Math.max(foot * 0.8, seasonalPassengers + vehiclePart + p.pets * 55));
  const spread = benchmark ? 0.25 : 0.35;
  return {
    amount,
    low: round10(amount * (1 - spread)),
    high: round10(amount * (1 + spread)),
    vehiclePart,
    season,
    source: benchmark?.source ?? reverse?.source ?? null,
    benchmarked: Boolean(benchmark),
  };
}

export const estimateFare = (sailing: Sailing, profile: TripProfileValue) => estimateFerryFare(sailing, profile).amount;
export const estimateVehicleFare = (sailing: Sailing, profile: TripProfileValue) => estimateFerryFare(sailing, profile).vehiclePart;
export const formatEuro = (value: number) => `~${value.toLocaleString("fr-FR")} €`;
export const formatFareRange = (fare: FareEstimate) => `${fare.low.toLocaleString("fr-FR")}–${fare.high.toLocaleString("fr-FR")} €`;

export const FareProfileContext = createContext<TripProfileValue>(defaultTripProfile);
export const useFareProfile = () => useContext(FareProfileContext);
