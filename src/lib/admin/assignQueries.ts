import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { loadAssignConfig, loadScheduleVessels } from "./autoAssign";

// Tables de l'affectation automatique pas encore présentes dans les types générés.
export const assignDb = typedSupabase as unknown as SupabaseClient;

/** Règles actives et mode par compagnie (lecture côté espace équipe). */
export const assignConfigQuery = queryOptions({
  queryKey: ["admin", "assign-config"],
  queryFn: () => loadAssignConfig(assignDb),
  staleTime: 30_000,
});

/** Bateau prévu par chaque calendrier récurrent (règle « programme »). */
export const scheduleVesselsQuery = queryOptions({
  queryKey: ["schedules", "default-vessels"],
  queryFn: () => loadScheduleVessels(assignDb),
  staleTime: 60_000,
});
