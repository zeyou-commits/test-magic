import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { haversineKm } from "./tracking";

// Script « verifie_en_mer » (1-SUPABASE), absent des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

/** Même seuil que les signalements « sur place » d'un navire : 15 km autour de sa dernière position. */
export const AT_SEA_KM = 15;
/** Au-delà, la position du navire est trop ancienne pour comparer (3 h, comme côté serveur). */
export const SHIP_FRESH_MINUTES = 180;

export type SeaCheck = { state: "verified" | "unverified"; reason: string | null };

/**
 * La personne a dit qu'elle était à bord ; sa position (facultative) le confirme-t-elle ?
 * Rien n'est bloqué : sans preuve, la déclaration reste, simplement « non vérifiée ».
 */
export function seaCheck(
  here: [number, number] | null,
  ship: { latitude: number; longitude: number; ageMinutes: number } | null,
): SeaCheck {
  if (!here) return { state: "unverified", reason: "Position indisponible sur cet appareil." };
  if (!ship || ship.ageMinutes > SHIP_FRESH_MINUTES)
    return { state: "unverified", reason: "La position du navire n'est pas connue en ce moment." };
  const km = haversineKm([here[1], here[0]], [ship.longitude, ship.latitude]);
  return km <= AT_SEA_KM
    ? { state: "verified", reason: null }
    : { state: "unverified", reason: "Votre position ne correspond pas à celle du navire." };
}

const missing = (code?: string) => code === "PGRST202" || code === "42883" || code === "PGRST205";

/**
 * Le serveur refait la comparaison et garde seulement « vérifié ou non » : aucune coordonnée n'est
 * enregistrée. Sans le script, on garde le résultat calculé ici, sur cet appareil.
 */
export async function confirmAtSea(
  departureId: string,
  here: [number, number] | null,
  local: SeaCheck,
): Promise<SeaCheck> {
  const { data, error } = await supabase.rpc("bw_confirm_at_sea", {
    p_departure: departureId,
    // Arrondi à ~100 m, comme pour les signalements.
    p_lat: here ? Math.round(here[0] * 1000) / 1000 : null,
    p_lng: here ? Math.round(here[1] * 1000) / 1000 : null,
  });
  if (error) return missing(error.code) ? local : { state: "unverified", reason: error.message };
  const verified = Boolean((data as { verified?: boolean } | null)?.verified);
  return verified
    ? { state: "verified", reason: null }
    : {
        ...local,
        state: "unverified",
        reason: local.reason ?? "Votre position ne correspond pas à celle du navire.",
      };
}

const memoKey = (user: string, departure: string) => `bledway:at-sea:${user}:${departure}`;
/** Seul le résultat est gardé sur l'appareil (« verified » / « unverified »), jamais la position. */
export function rememberSeaCheck(user: string, departure: string, state: SeaCheck["state"]) {
  try {
    localStorage.setItem(memoKey(user, departure), state);
  } catch {
    /* facultatif */
  }
}
export function recalledSeaCheck(user: string, departure: string): SeaCheck["state"] | null {
  try {
    const value = localStorage.getItem(memoKey(user, departure));
    return value === "verified" || value === "unverified" ? value : null;
  } catch {
    return null;
  }
}
