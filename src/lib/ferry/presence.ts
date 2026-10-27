import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Statuts de voyage (script du 01/11/2026), absents des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type TripStatus = "en_route" | "port" | "onboard" | "arrived";
/** Les quatre étapes de « Ma traversée », chacune avec son cabas. */
export const tripSteps: { id: TripStatus; label: string; short: string; image: string }[] = [
  { id: "en_route", label: "En route vers le port", short: "En route", image: "/cabas/statut-en-route.webp" },
  { id: "port", label: "Au port", short: "Au port", image: "/cabas/statut-au-port.webp" },
  { id: "onboard", label: "À bord", short: "À bord", image: "/cabas/statut-a-bord.webp" },
  { id: "arrived", label: "Arrivé", short: "Arrivé", image: "/cabas/statut-arrive.webp" },
];
export const presenceKey = ["bw-trip-presence"] as const;

export type PresenceRow = {
  departure_id: string;
  vessel_id: string | null;
  departure_port_id: string;
  arrival_port_id: string;
  en_route: number;
  at_port: number;
  onboard: number;
  arrived: number;
};
const missing = (code?: string) => code === "PGRST202" || code === "PGRST205" || code === "42P01";

/** Compteurs anonymes des traversées en cours ; null tant que le script n'est pas exécuté. */
export const presenceQuery = queryOptions({
  queryKey: presenceKey,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("bw_trip_presence");
    if (error) {
      if (missing(error.code)) return null;
      throw new Error("Présence indisponible.");
    }
    return (data ?? []) as PresenceRow[];
  },
  retry: false,
  staleTime: 30_000,
  refetchInterval: (query) => (query.state.data === null ? false : 60_000),
});

export const myTripStatusQuery = (departureId: string, userId: string | undefined) =>
  queryOptions({
    queryKey: [...presenceKey, "mine", departureId, userId ?? "anonyme"],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_trip_status")
        .select("status")
        .eq("departure_id", departureId)
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) return null;
      return ((data?.status as TripStatus | undefined) ?? null) as TripStatus | null;
    },
    retry: false,
  });

export async function setTripStatus(departureId: string, status: TripStatus | null) {
  const { error } = await supabase.rpc("bw_set_trip_status", {
    p_departure: departureId,
    p_status: status,
  });
  if (error) {
    if (missing(error.code)) throw new Error("Fonction pas encore activée.");
    throw new Error(
      /veille|introuvable|actif/.test(error.message)
        ? error.message
        : "Le statut n’a pas pu être enregistré. Réessayez.",
    );
  }
}

/** Avatar cabas stable pour un même identifiant (6 personnages). */
export const avatarFor = (seed: string, index: number) => {
  let hash = index * 7;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `/cabas/avatar-${(hash % 6) + 1}.webp`;
};
