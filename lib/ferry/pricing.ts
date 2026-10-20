import { createContext, useContext } from "react";
import type { Sailing } from "./trips";
import { defaultTripProfile, type TripProfileValue, type VehicleKind } from "@/components/panel/TripProfile";

/**
 * Tarifs moyens INDICATIFS (estimation), en attendant les grilles réelles des compagnies.
 * Remplacer `estimateFare` par une lecture des vrais tarifs quand ils seront en base.
 */
const VEHICLE_BASE: Record<VehicleKind, number> = {
  none: 0,
  city: 120,
  sedan: 150,
  suv: 190,
  van: 230,
  utility: 260,
};

export function estimateFare(sailing: Sailing, profile: TripProfileValue): number {
  const hours = Math.max((sailing.durationMin ?? 600) / 60, 2);
  const factor = Math.min(Math.max(hours / 12, 0.6), 1.8);
  const adult = 50 + hours * 5;
  const p = profile.passengers;
  const people = p.adults * adult + p.seniors * adult * 0.9 + p.children * adult * 0.5 + p.pets * 30;
  const vehicle = VEHICLE_BASE[profile.vehicle] * factor;
  const extras = profile.vehicle === "none" ? 0 : profile.accessories.length * 40 * factor;
  return Math.max(5, Math.round((people + vehicle + extras) / 5) * 5);
}

export const formatEuro = (value: number) => `~${value.toLocaleString("fr-FR")} €`;

export const FareProfileContext = createContext<TripProfileValue>(defaultTripProfile);
export const useFareProfile = () => useContext(FareProfileContext);
