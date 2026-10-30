import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { LivePosition } from "@/lib/ferry/tracking";

const db = typedSupabase as unknown as SupabaseClient;

export type AisHealth = {
  /** Dernier passage de l'écoute ciblée (null : jamais programmée ou script SQL absent). */
  collectorSeen: string | null;
  /** Dernière position datée par MMSI. */
  lastSignal: Map<number, string | null>;
  /** Dernière position complète par MMSI (port, vitesse, départ / arrivée constatés). */
  positions: Map<number, LivePosition>;
};

/** Écoute muette depuis plus longtemps : elle est considérée arrêtée. */
export const COLLECTOR_STALE_MINUTES = 30;
/** Navire sans aucun signal depuis plus longtemps : signalé dans « Aujourd'hui ». */
export const SILENT_HOURS = 24;

type PositionRow = {
  mmsi: number;
  vessel_name: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  speed_knots: number | null;
  course_deg: number | null;
  reported_at: string | null;
  fetched_at: string;
  atd_at?: string | null;
  ata_at?: string | null;
  last_port_id?: string | null;
  departure_port_id?: string | null;
  arrival_port_id?: string | null;
  event_departure_id?: string | null;
};

export const aisHealthQuery = queryOptions({
  queryKey: ["admin", "ais-health"],
  queryFn: async (): Promise<AisHealth> => {
    const [positions, collector] = await Promise.all([
      // « * » : une colonne d'événement absente de la base ne doit pas tout masquer.
      db.from("vessel_positions").select("*"),
      db.from("bw_admin_settings").select("value").eq("key", "ais_collector").maybeSingle(),
    ]);
    const rows = (positions.data ?? []) as PositionRow[];
    return {
      collectorSeen:
        ((collector.data?.value as { last_seen?: string } | undefined)?.last_seen as string) ??
        null,
      lastSignal: new Map(rows.map((row) => [Number(row.mmsi), row.reported_at])),
      positions: new Map(
        rows
          .filter((row) => row.latitude !== null && row.longitude !== null)
          .map((row) => [
            Number(row.mmsi),
            {
              mmsi: Number(row.mmsi),
              vesselName: row.vessel_name,
              status: row.status,
              latitude: row.latitude!,
              longitude: row.longitude!,
              speedKnots: row.speed_knots,
              courseDeg: row.course_deg,
              reportedAt: row.reported_at,
              atdAt: row.atd_at ?? null,
              ataAt: row.ata_at ?? null,
              lastPortId: row.last_port_id ?? null,
              departurePortId: row.departure_port_id ?? null,
              arrivalPortId: row.arrival_port_id ?? null,
              eventDepartureId: row.event_departure_id ?? null,
              fetchedAt: row.fetched_at,
            } satisfies LivePosition,
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
