import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export const globalCriterionQuery = queryOptions({
  queryKey: ["rating_criteria", "global"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("rating_criteria")
      .select("id")
      .eq("slug", "global")
      .maybeSingle();
    if (error) return null;
    return (data?.id as string | undefined) ?? null;
  },
  staleTime: 30 * 60 * 1000,
});
