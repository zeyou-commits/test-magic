import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RULES,
  suggestVessels,
  type AssignRules,
  type PlanningDeparture,
  type PlanningVessel,
  type VesselSuggestion,
} from "./planning";

/**
 * Affectation automatique : mêmes règles que les propositions de l'écran « Aujourd'hui »,
 * appliquées seules pour les compagnies réglées en « Automatique ». Utilisable avec le client
 * d'un membre de l'équipe (navigateur) comme avec le client serveur (tâche quotidienne).
 */

export type AssignMode = "auto" | "suggest" | "manual";

export type AssignConfig = {
  rules: AssignRules;
  /** Mode par compagnie ; une compagnie absente est en « suggest ». */
  modes: Map<string, AssignMode>;
  /** Navires immobilisés (dossier ouvert) : jamais proposés ni affectés. */
  blockedVessels?: Set<string>;
  /** false tant que le script SQL « affectation_auto » n'est pas installé. */
  installed: boolean;
};

export async function loadAssignConfig(db: SupabaseClient): Promise<AssignConfig> {
  const [settings, rules, incidents] = await Promise.all([
    db.from("bw_assign_settings").select("company_id, mode"),
    db.from("bw_admin_settings").select("value").eq("key", "assign_rules").maybeSingle(),
    db.from("bw_vessel_incidents").select("vessel_id").in("status", ["verifying", "confirmed"]),
  ]);
  if (settings.error || rules.error) {
    return { rules: DEFAULT_RULES, modes: new Map(), installed: false };
  }
  return {
    rules: { ...DEFAULT_RULES, ...((rules.data?.value as Partial<AssignRules> | undefined) ?? {}) },
    modes: new Map(
      ((settings.data ?? []) as { company_id: string; mode: AssignMode }[]).map((row) => [
        row.company_id,
        row.mode,
      ]),
    ),
    blockedVessels: new Set(
      ((incidents.data ?? []) as { vessel_id: string }[]).map((row) => row.vessel_id),
    ),
    installed: true,
  };
}

/** Propositions visibles : jamais pour une compagnie en « Manuel ». */
export function visibleSuggestions(
  departures: PlanningDeparture[],
  vessels: PlanningVessel[],
  config: Pick<AssignConfig, "rules" | "modes" | "blockedVessels">,
  scheduleVessel: Map<string, string | null>,
  now = Date.now(),
): VesselSuggestion[] {
  const byId = new Map(departures.map((d) => [d.id, d]));
  const usable = vessels.filter((v) => !config.blockedVessels?.has(v.id));
  return suggestVessels(departures, usable, now, config.rules, scheduleVessel).filter(
    (s) => config.modes.get(byId.get(s.departureId)?.company_id ?? "") !== "manual",
  );
}

/** Applique les propositions des compagnies « Automatique » et journalise le passage. */
export async function runAutoAssign(
  db: SupabaseClient,
  input: {
    departures: PlanningDeparture[];
    vessels: PlanningVessel[];
    config: AssignConfig;
    scheduleVessel: Map<string, string | null>;
    source: "admin" | "cron" | "import";
  },
): Promise<{ count: number; logId: string | null }> {
  if (!input.config.installed) return { count: 0, logId: null };
  const companyOf = new Map(input.departures.map((d) => [d.id, d.company_id]));
  const todo = visibleSuggestions(
    input.departures,
    input.vessels,
    input.config,
    input.scheduleVessel,
  ).filter((s) => input.config.modes.get(companyOf.get(s.departureId) ?? "") === "auto");
  if (!todo.length) return { count: 0, logId: null };
  const done: VesselSuggestion[] = [];
  const byVessel = new Map<string, VesselSuggestion[]>();
  for (const s of todo) byVessel.set(s.vesselId, [...(byVessel.get(s.vesselId) ?? []), s]);
  for (const [vesselId, items] of byVessel) {
    for (let i = 0; i < items.length; i += 200) {
      const chunk = items.slice(i, i + 200);
      const { data, error } = await db
        .from("departures")
        .update({ vessel_id: vesselId })
        .in(
          "id",
          chunk.map((s) => s.departureId),
        )
        .is("vessel_id", null)
        .select("id");
      if (error) throw new Error(error.message);
      const updated = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
      done.push(...chunk.filter((s) => updated.has(s.departureId)));
    }
  }
  if (!done.length) return { count: 0, logId: null };
  const { data: log } = await db
    .from("bw_assign_log")
    .insert({
      source: input.source,
      items: done.map((s) => ({
        departure_id: s.departureId,
        vessel_id: s.vesselId,
        reason: s.reason,
      })),
    })
    .select("id")
    .single();
  return { count: done.length, logId: (log as { id: string } | null)?.id ?? null };
}

/** Bateau prévu par chaque calendrier récurrent. */
export async function loadScheduleVessels(db: SupabaseClient) {
  const { data } = await db.from("schedules").select("id, default_vessel_id");
  return new Map(
    ((data ?? []) as { id: string; default_vessel_id: string | null }[]).map((row) => [
      row.id,
      row.default_vessel_id,
    ]),
  );
}
