import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { portsQuery, routesQuery } from "./queries";

// bw_follows (suivis) n'est pas dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export type FavoriteCrossing = {
  id: string;
  /** Le navire suivi d'où vient cette traversée (son prochain départ), sinon null. */
  vesselName: string | null;
  routeId: string;
  departureAt: string;
  fromPortId: string | null;
  toPortId: string | null;
  label: string;
};

/**
 * Les traversées mises en favori (cœur) et pas encore déclarées « Ma traversée » : à venir,
 * de la plus proche à la plus lointaine. Elles font le pont entre « Préparer » et « Mon voyage ».
 */
export const favoriteCrossingsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["favorite-crossings", userId ?? "anonyme"],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const follows = await supabase
        .from("bw_follows")
        .select("target_id,target_kind,traveller")
        .eq("user_id", userId!)
        .in("target_kind", ["departure", "vessel"])
        .eq("active", true);
      if (follows.error) return [];
      const rows = (follows.data ?? []).filter((row) => !row.traveller);
      const ids = rows
        .filter((r) => r.target_kind === "departure")
        .map((r) => r.target_id as string);
      const vesselIds = rows
        .filter((r) => r.target_kind === "vessel")
        .map((r) => r.target_id as string);
      if (!ids.length && !vesselIds.length) return [];
      const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
      const filter = [
        ids.length ? `id.in.(${ids.join(",")})` : null,
        vesselIds.length ? `vessel_id.in.(${vesselIds.join(",")})` : null,
      ]
        .filter(Boolean)
        .join(",");
      const [{ data, error }, vessels] = await Promise.all([
        supabase
          .from("departures")
          .select("id,route_id,departure_at,status,vessel_id")
          .or(filter)
          .gte("departure_at", since)
          .neq("status", "cancelled")
          .order("departure_at")
          .limit(60),
        vesselIds.length
          ? supabase.from("vessels").select("id,name").in("id", vesselIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      if (error) return [];
      const names = new Map((vessels.data ?? []).map((v) => [v.id as string, v.name as string]));
      // Un cœur sur un navire : seulement son prochain départ, pas tout son calendrier.
      const seen = new Set<string>();
      return (
        (data ?? []) as {
          id: string;
          route_id: string;
          departure_at: string;
          vessel_id: string | null;
        }[]
      ).flatMap((row) => {
        if (ids.includes(row.id)) return [{ ...row, vesselName: null }];
        if (!row.vessel_id || seen.has(row.vessel_id)) return [];
        seen.add(row.vessel_id);
        return [{ ...row, vesselName: names.get(row.vessel_id) ?? null }];
      });
    },
  });

export function useFavoriteCrossings(): FavoriteCrossing[] {
  const { user } = useAuth();
  const { data = [] } = useQuery(favoriteCrossingsQuery(user?.id));
  const { data: routes = [] } = useQuery(routesQuery);
  const { data: ports = [] } = useQuery(portsQuery);
  return data.map((row) => {
    const route = routes.find((item) => item.id === row.route_id);
    const from = ports.find((port) => port.id === route?.departure_port_id);
    const to = ports.find((port) => port.id === route?.arrival_port_id);
    return {
      id: row.id,
      vesselName: row.vesselName,
      routeId: row.route_id,
      departureAt: row.departure_at,
      fromPortId: from?.id ?? null,
      toPortId: to?.id ?? null,
      label: from && to ? `${from.name} → ${to.name}` : "Traversée en favori",
    };
  });
}

/** « mer. 25 nov. · 11:00 », à l'heure de l'appareil. */
export const favoriteWhen = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(/\./g, "");
