import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setHolidayCalendars, type HolidayCalendar } from "@/content/vacancesScolaires";
import { setEuropePosts, type EuropeCountryPosts } from "@/content/consulatsEurope";

/**
 * Les données de référence approuvées dans l'admin (vacances scolaires, consulats en Europe).
 * Tant qu'elles ne sont pas chargées, ou s'il n'y en a pas, le site garde le relevé du dépôt.
 * Renvoie un numéro de version : les écrans qui l'appellent se redessinent quand il change.
 */
export function useReferenceData() {
  const { data } = useQuery({
    queryKey: ["reference-data"],
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      // Table hors des types générés : lecture publique des seules colonnes approuvées.
      const { data: rows, error } = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => Promise<{
              data: { key: string; active: unknown; active_checked: string | null }[] | null;
              error: unknown;
            }>;
          };
        }
      )
        .from("bw_reference_data")
        .select("key, active, active_checked");
      if (error || !rows) return 0;
      let applied = 0;
      for (const row of rows) {
        if (!Array.isArray(row.active) || !row.active.length || !row.active_checked) continue;
        if (row.key === "vacances")
          setHolidayCalendars(row.active as HolidayCalendar[], row.active_checked);
        else if (row.key === "consulats")
          setEuropePosts(row.active as EuropeCountryPosts[], row.active_checked);
        else continue;
        applied += 1;
      }
      return applied;
    },
  });
  return data ?? 0;
}
