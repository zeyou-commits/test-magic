import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadAssignConfig, loadScheduleVessels, runAutoAssign } from "./autoAssign";
import type { PlanningDeparture, PlanningVessel } from "./planning";

const db = supabaseAdmin as unknown as SupabaseClient;

/**
 * Passage quotidien (tâche planifiée) : les traversées à venir sans bateau des compagnies
 * réglées en « Automatique » reçoivent leur bateau, avant l'envoi des notifications.
 */
export async function scheduledAutoAssign() {
  const config = await loadAssignConfig(db);
  if (!config.installed || ![...config.modes.values()].includes("auto")) return { count: 0 };
  const from = new Date(Date.now() - 16 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 240 * 86_400_000).toISOString();
  const departures: PlanningDeparture[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("departures")
      .select(
        "id, route_id, company_id, vessel_id, departure_at, arrival_at, duration_minutes, status, schedule_id",
      )
      .gte("departure_at", from)
      .lte("departure_at", to)
      .order("departure_at")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    departures.push(...((data ?? []) as PlanningDeparture[]));
    if (!data || data.length < 1000) break;
  }
  const { data: vessels, error } = await db.from("vessels").select("id, name, company_id, status");
  if (error) throw new Error(error.message);
  return runAutoAssign(db, {
    departures,
    vessels: (vessels ?? []) as PlanningVessel[],
    config,
    scheduleVessel: await loadScheduleVessels(db),
    source: "cron",
  });
}
