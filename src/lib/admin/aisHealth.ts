import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

const db = typedSupabase as unknown as SupabaseClient;

export type AisHealth = {
  /** Dernier signe de vie du collecteur permanent (null : jamais lancé ou script SQL absent). */
  collectorSeen: string | null;
  /** Dernière position datée par MMSI. */
  lastSignal: Map<number, string | null>;
};

/** Collecteur muet depuis plus longtemps : il est considéré arrêté. */
export const COLLECTOR_STALE_MINUTES = 30;
/** Navire sans aucun signal depuis plus longtemps : signalé dans « Aujourd'hui ». */
export const SILENT_HOURS = 24;

export const aisHealthQuery = queryOptions({
  queryKey: ["admin", "ais-health"],
  queryFn: async (): Promise<AisHealth> => {
    const [positions, collector] = await Promise.all([
      db.from("vessel_positions").select("mmsi, reported_at"),
      db.from("bw_admin_settings").select("value").eq("key", "ais_collector").maybeSingle(),
    ]);
    return {
      collectorSeen:
        ((collector.data?.value as { last_seen?: string } | undefined)?.last_seen as string) ??
        null,
      lastSignal: new Map(
        ((positions.data ?? []) as { mmsi: number; reported_at: string | null }[]).map((row) => [
          Number(row.mmsi),
          row.reported_at,
        ]),
      ),
    };
  },
  refetchInterval: 120_000,
});

export const ageLabel = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return "jamais reçu";
  const minutes = Math.max(0, (now - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `il y a ${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  return `il y a ${Math.round(minutes / 1440)} jours`;
};
