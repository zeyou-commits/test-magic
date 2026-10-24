import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Tables communautaires pas encore présentes dans les types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

type FollowDetail = {
  label: string;
  departureAt?: string;
  departureId?: string;
  port?: { name: string; country_code: string };
};
export function useTravelFollows(userId: string) {
  const queryClient = useQueryClient();
  const follows = useQuery({
    queryKey: ["my-follows", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_follows")
        .select("id,target_kind,target_id,created_at")
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const watches = useQuery({
    queryKey: ["my-itinerary-watches", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bw_itinerary_watches")
        .select("id,route_id,period_month,origin_label,destination_label")
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const targetIds = (follows.data ?? [])
    .map((follow) => follow.target_id)
    .sort()
    .join(",");
  const details = useQuery({
    queryKey: ["follow-labels", userId, targetIds],
    enabled: Boolean(targetIds),
    queryFn: async () => {
      const rows = follows.data ?? [];
      const vesselIds = rows
        .filter((follow) => follow.target_kind === "vessel")
        .map((follow) => follow.target_id);
      const departureIds = rows
        .filter((follow) => follow.target_kind === "departure")
        .map((follow) => follow.target_id);
      const [vessels, departures, next, routes, ports] = await Promise.all([
        supabase.from("vessels").select("id,name").in("id", vesselIds),
        supabase
          .from("departures")
          .select("id,route_id,departure_at,vessel_id")
          .in("id", departureIds),
        supabase
          .from("departures")
          .select("id,route_id,departure_at,vessel_id")
          .in("vessel_id", vesselIds)
          .gte("departure_at", new Date().toISOString())
          .neq("status", "cancelled")
          .order("departure_at")
          .limit(100),
        supabase.from("routes").select("id,departure_port_id,arrival_port_id"),
        supabase.from("ports").select("id,name,country_code"),
      ]);
      const error = [vessels, departures, next, routes, ports].find(
        (result) => result.error,
      )?.error;
      if (error) throw error;
      const routeById = new Map((routes.data ?? []).map((route) => [route.id, route]));
      const portById = new Map((ports.data ?? []).map((port) => [port.id, port]));
      const result: Record<string, FollowDetail> = {};
      for (const vessel of vessels.data ?? []) result[vessel.id] = { label: vessel.name };
      for (const departure of [...(departures.data ?? []), ...(next.data ?? [])]) {
        const route = routeById.get(departure.route_id);
        const port = route ? portById.get(route.departure_port_id) : undefined;
        const label = route
          ? `${port?.name ?? "Départ"} → ${portById.get(route.arrival_port_id)?.name ?? "arrivée"}`
          : "Traversée suivie";
        const detail: FollowDetail = {
          label,
          departureAt: departure.departure_at,
          departureId: departure.id,
          ...(port ? { port } : {}),
        };
        result[departure.id] = detail;
        if (
          departure.vessel_id &&
          result[departure.vessel_id] &&
          !result[departure.vessel_id]!.departureId
        )
          result[departure.vessel_id] = { ...detail, label: result[departure.vessel_id]!.label };
      }
      return result;
    },
  });
  async function remove(kind: "follow" | "watch", id: string) {
    const result =
      kind === "follow"
        ? await supabase
            .from("bw_follows")
            .update({ active: false })
            .eq("id", id)
            .eq("user_id", userId)
        : await supabase
            .from("bw_itinerary_watches")
            .update({ active: false })
            .eq("id", id)
            .eq("user_id", userId);
    if (result.error) {
      toast.error("Le suivi n’a pas pu être arrêté.");
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-follows", userId] }),
      queryClient.invalidateQueries({ queryKey: ["my-itinerary-watches", userId] }),
      queryClient.invalidateQueries({ queryKey: ["follow", userId] }),
    ]);
    toast.success("Suivi arrêté.");
  }
  return { follows, watches, details, remove };
}
