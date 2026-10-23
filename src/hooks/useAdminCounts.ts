import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminDayRange } from "@/lib/admin/navigation";

export function useAdminCounts() {
  return useQuery({
    queryKey: ["admin", "counts"],
    queryFn: async () => {
      const now = new Date();
      const { start, end } = adminDayRange(now);
      const [today, reports, reviews, unlinked] = await Promise.all([
        supabase
          .from("departures")
          .select("id", { count: "exact", head: true })
          .gte("departure_at", start)
          .lt("departure_at", end),
        supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "new"),
        supabase
          .from("port_reviews")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("departures")
          .select("id", { count: "exact", head: true })
          .is("vessel_id", null)
          .neq("status", "cancelled")
          .gte("departure_at", now.toISOString()),
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
