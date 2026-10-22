import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAdminCounts() {
  return useQuery({
    queryKey: ["admin", "counts"],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const [today, reports, reviews, unlinked] = await Promise.all([
        supabase
          .from("departures")
          .select("id", { count: "exact", head: true })
          .gte("departure_at", start.toISOString())
          .lt("departure_at", end.toISOString()),
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase
          .from("port_reviews")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("departures")
          .select("id", { count: "exact", head: true })
          .is("vessel_id", null)
          .gte("departure_at", start.toISOString()),
      ]);
      const error = [today, reports, reviews, unlinked].find((result) => result.error)?.error;
      if (error) throw error;
      return {
        today: today.count ?? 0,
        reports: reports.count ?? 0,
        reviews: reviews.count ?? 0,
        unlinked: unlinked.count ?? 0,
      };
    },
  });
}
