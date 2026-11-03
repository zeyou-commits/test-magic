import type { TripProfileValue } from "@/components/panel/TripProfile";
import type { TripProfile } from "./preparation";

/**
 * Le profil du voyageur (passagers, véhicule, enfants, animal), saisi une fois et retrouvé partout :
 * la Route, la recherche « Trouver », puis la préparation du voyage suivi. Gardé sur cet appareil,
 * et seulement s'il a été choisi : le profil par défaut n'est jamais pris pour un choix.
 */
const PROFILE_KEY = "bledway:travel-profile:v1";
/** Ce que la Route a trouvé (mois et ports de la traversée choisie), repris par « Trouver ». */
const CHOICE_KEY = "bledway:itinerary-choice:v1";
export const TRAVEL_PROFILE_EVENT = "bledway:travel-profile";

export type ItineraryChoice = {
  period: string;
  departurePortId: string;
  arrivalPortId: string;
};

export function readTravelProfile(): TripProfileValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as TripProfileValue) : null;
  } catch {
    return null;
  }
}

export function saveTravelProfile(profile: TripProfileValue) {
  if (typeof window === "undefined") return;
  if (JSON.stringify(readTravelProfile()) === JSON.stringify(profile)) return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* sans stockage, le profil reste celui de l'écran en cours */
  }
  window.dispatchEvent(new Event(TRAVEL_PROFILE_EVENT));
}

/** Le profil de recherche traduit pour la préparation : à pied, enfants, animal. */
export function preparationFromTravelProfile(
  profile: TripProfileValue | null = readTravelProfile(),
): Partial<TripProfile> | null {
  if (!profile) return null;
  const { children, babies, pets } = profile.passengers;
  return {
    vehicle: profile.vehicle !== "none",
    kids: children + babies > 0,
    pet: pets > 0,
  };
}

export function saveItineraryChoice(choice: ItineraryChoice | null) {
  if (typeof window === "undefined") return;
  try {
    if (choice) window.sessionStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
    else window.sessionStorage.removeItem(CHOICE_KEY);
  } catch {
    /* stockage facultatif */
  }
}

export function readItineraryChoice(): ItineraryChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHOICE_KEY);
    return raw ? (JSON.parse(raw) as ItineraryChoice) : null;
  } catch {
    return null;
  }
}
