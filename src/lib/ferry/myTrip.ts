import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { portsQuery, routesQuery, vesselsQuery } from "./queries";
import { reportedCrossing } from "./tracking";

// Suivis « je voyage » (script du 02/11/2026), absents des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export const myTripsKey = ["my-trips"] as const;
type TripDeparture = {
  id: string;
  departure_at: string;
  arrival_at: string | null;
  duration_minutes: number | null;
  vessel_id: string | null;
  route_id: string;
  status: string;
  /** Signalements validés par l'équipe : ils corrigent les horaires. */
  reported_quay_at?: string | null;
  reported_departed_at?: string | null;
  reported_arrived_at?: string | null;
  reported_delay_minutes?: number | null;
  reported_postponed_at?: string | null;
  web_departed_at?: string | null;
  web_arrived_at?: string | null;
  web_eta_at?: string | null;
};

/** Traversées marquées « je voyage », de la plus proche à la plus lointaine ; null sans le script. */
export const myTripsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: [...myTripsKey, userId ?? "anonyme"],
    enabled: Boolean(userId),
    queryFn: async () => {
      const follows = await supabase
        .from("bw_follows")
        .select("target_id")
        .eq("user_id", userId!)
        .eq("target_kind", "departure")
        .eq("active", true)
        .eq("traveller", true);
      if (follows.error) {
        if (/traveller|42703|PGRST204/.test(`${follows.error.code} ${follows.error.message}`)) return null;
        throw new Error("Ma traversée est momentanément indisponible.");
      }
      const ids = (follows.data ?? []).map((row) => row.target_id as string);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("departures")
        .select(
          "id,departure_at,arrival_at,duration_minutes,vessel_id,route_id,status,reported_quay_at,reported_departed_at,reported_arrived_at,reported_delay_minutes,reported_postponed_at,web_departed_at,web_arrived_at,web_eta_at",
        )
        .in("id", ids)
        .order("departure_at");
      if (error) throw new Error("Ma traversée est momentanément indisponible.");
      return (data ?? []) as TripDeparture[];
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

/** Fin estimée d'une traversée, signalements validés compris (sinon arrivée, départ + durée, départ + 24 h). */
export const tripEnd = (departure: TripDeparture) => {
  const report = reportedCrossing(departure);
  if (report.changed && Number.isFinite(report.end)) return report.end;
  return departure.arrival_at
    ? Date.parse(departure.arrival_at)
    : Date.parse(departure.departure_at) + (departure.duration_minutes ?? 24 * 60) * 60_000;
};

/**
 * Ma traversée du moment : la prochaine (ou celle en cours, jusqu'à 12 h après l'arrivée),
 * avec son trajet, ses ports et son bateau.
 */
export function useMyTrip() {
  const { user } = useAuth();
  const trips = useQuery(myTripsQuery(user?.id));
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  const { data: vessels = [] } = useQuery(vesselsQuery);
  const now = Date.now();
  // Une traversée annulée reste affichée (avec « Annulée ») tant que sa date n'est pas passée.
  const departure = (trips.data ?? []).find((item) => tripEnd(item) + 12 * 3_600_000 > now);
  if (!departure) return { trip: null, others: [] as TripDeparture[], ready: !trips.isPending };
  const route = routes.find((item) => item.id === departure.route_id);
  return {
    trip: {
      departure,
      route,
      from: ports.find((port) => port.id === route?.departure_port_id),
      to: ports.find((port) => port.id === route?.arrival_port_id),
      vessel: vessels.find((vessel) => vessel.id === departure.vessel_id),
    },
    others: (trips.data ?? []).filter((item) => item.id !== departure.id && tripEnd(item) > now),
    ready: true,
  };
}
export type MyTrip = NonNullable<ReturnType<typeof useMyTrip>["trip"]>;
