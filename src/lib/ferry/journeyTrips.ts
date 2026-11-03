import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { TRIP_GRACE_MS, tripEnd } from "./myTrip";

// Motif de suivi (script du 08/11/2026), absent des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

const FIELDS =
  "id,departure_at,arrival_at,duration_minutes,vessel_id,route_id,status,presentation_minutes,reported_quay_at,reported_departed_at,reported_arrived_at,reported_delay_minutes,reported_postponed_at,web_departed_at,web_arrived_at,web_eta_at";

export type JourneyDeparture = {
  id: string;
  departure_at: string;
  arrival_at: string | null;
  duration_minutes: number | null;
  vessel_id: string | null;
  route_id: string;
  status: string;
  presentation_minutes?: number | null;
  reported_quay_at?: string | null;
  reported_departed_at?: string | null;
  reported_arrived_at?: string | null;
  reported_delay_minutes?: number | null;
  reported_postponed_at?: string | null;
  web_departed_at?: string | null;
  web_arrived_at?: string | null;
  web_eta_at?: string | null;
};

/**
 * La traversée d'un proche : suivie avec le motif « proche ». La plus proche encore en cours
 * (jusqu'à 10 h après l'arrivée, comme Ma traversée). null si le motif n'existe pas en base.
 */
export const relativeTripQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["journey", "relative", userId ?? "anonyme"],
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<JourneyDeparture | null> => {
      const follows = await supabase
        .from("bw_follows")
        .select("target_id")
        .eq("user_id", userId!)
        .eq("target_kind", "departure")
        .eq("active", true)
        .eq("follow_purpose", "proche");
      if (follows.error) return null;
      const ids = (follows.data ?? []).map((row) => row.target_id as string);
      if (!ids.length) return null;
      const { data, error } = await supabase
        .from("departures")
        .select(FIELDS)
        .in("id", ids)
        .order("departure_at");
      if (error) return null;
      const now = Date.now();
      return (
        ((data ?? []) as JourneyDeparture[]).find(
          (departure) => tripEnd(departure) + TRIP_GRACE_MS > now,
        ) ?? null
      );
    },
  });

/** Consigne de présentation de la traversée du voyageur (colonne du 08/11/2026). */
export const presentationQuery = (departureId: string | undefined) =>
  queryOptions({
    queryKey: ["journey", "presentation", departureId],
    enabled: Boolean(departureId),
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departures")
        .select("presentation_minutes")
        .eq("id", departureId!)
        .maybeSingle();
      if (error) return null;
      return (data?.presentation_minutes as number | null | undefined) ?? null;
    },
  });

/**
 * Trajet sur mesure : la maison (Europe) et la ville au bled, avec les deux routes calculées par le
 * même service que le simulateur. Gardé sur cet appareil seulement, jamais enregistré par BledWay.
 */
export type JourneyPlaces = {
  home: string;
  bled: string;
  homePoint: [number, number];
  bledPoint: [number, number];
  /** Minutes de route, pauses comprises, entre la maison et le port d'Europe. */
  europeMin: number;
  /** Minutes de route, pauses comprises, entre le port d'Algérie et la ville au bled. */
  algeriaMin: number;
  /** Tracés simplifiés (maison → port d'Europe, port d'Algérie → bled), vides si estimés. */
  europeLine: [number, number][];
  algeriaLine: [number, number][];
};
const placesKey = (departureId: string) => `bw-journey-places:${departureId}`;
export function readPlaces(departureId: string): JourneyPlaces | null {
  try {
    const value = JSON.parse(localStorage.getItem(placesKey(departureId)) ?? "null");
    return value && typeof value.europeMin === "number" ? (value as JourneyPlaces) : null;
  } catch {
    return null;
  }
}
export function writePlaces(departureId: string, places: JourneyPlaces | null) {
  try {
    if (places) localStorage.setItem(placesKey(departureId), JSON.stringify(places));
    else localStorage.removeItem(placesKey(departureId));
  } catch {
    /* stockage facultatif */
  }
}

/** Un tracé allégé (au plus `max` points) pour tenir dans le stockage de l'appareil. */
export function thinLine(points: [number, number][], max = 300): [number, number][] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}
