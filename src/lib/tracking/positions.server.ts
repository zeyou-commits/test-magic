// Suivi des navires : cache partagé en base + écoute ponctuelle du flux AISStream.
// Ce fichier ne s'exécute que sur le serveur : la clé API n'est jamais envoyée au navigateur.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { collectPositions } from "./aisstream.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedPosition } from "./parse";
import { collectorAlive, ingestPosition, loadIngestContext } from "./ingest";

const db = supabaseAdmin as unknown as SupabaseClient;

/** Une position n'est pas redemandée tant qu'elle a moins de 5 minutes. */
export const REFRESH_MINUTES = 5;
/** Garde-fou : nombre maximal de navires rafraîchis par une seule requête. */
const MAX_CALLS_PER_REQUEST = 50;
/** Durée d'écoute du flux AIS par rafraîchissement. */
const STREAM_LISTEN_MS = 45000;

export interface PublicPosition {
  mmsi: number;
  vesselName: string | null;
  status: string | null;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  courseDeg: number | null;
  reportedAt: string | null;
  atdAt: string | null;
  ataAt: string | null;
  lastPortId: string | null;
  departurePortId: string | null;
  arrivalPortId: string | null;
  eventDepartureId: string | null;
  atdAfter: string | null;
  ataAfter: string | null;
  declaredDestination: string | null;
  declaredEta: string | null;
  fetchedAt: string;
}

/**
 * MMSI de tous les navires actifs renseignés : le signal réel est suivi en continu,
 * indépendamment des horaires saisis (un navire peut naviguer hors calendrier).
 */
async function trackedMmsis(): Promise<number[]> {
  const { data: vessels } = await supabaseAdmin
    .from("vessels")
    .select("mmsi")
    .eq("status", "active")
    .not("mmsi", "is", null);
  return [...new Set((vessels ?? []).map((vessel) => vessel.mmsi as number))];
}

/**
 * Renvoie les positions des navires suivis. Pour chaque navire dont la position date de plus de
 * 5 minutes, UNE seule requête (même avec des milliers de visiteurs) rafraîchit la donnée :
 * la « réservation » se fait par une mise à jour atomique en base.
 */
export async function getPositions(): Promise<PublicPosition[]> {
  const mmsis = await trackedMmsis();
  if (mmsis.length === 0) return [];

  // S'assure qu'une ligne existe pour chaque navire (sans écraser l'existant).
  await supabaseAdmin.from("vessel_positions").upsert(
    mmsis.map((mmsi) => ({ mmsi })),
    { onConflict: "mmsi", ignoreDuplicates: true },
  );

  const threshold = new Date(Date.now() - REFRESH_MINUTES * 60_000).toISOString();
  const claimed: number[] = [];
  for (const mmsi of mmsis.slice(0, MAX_CALLS_PER_REQUEST)) {
    const { data } = await supabaseAdmin
      .from("vessel_positions")
      .update({ fetched_at: new Date().toISOString() })
      .eq("mmsi", mmsi)
      .lt("fetched_at", threshold)
      .select("mmsi");
    if (data && data.length > 0) claimed.push(mmsi);
  }

  // L'écoute ciblée (Supabase, toutes les 10 min) alimente déjà la base : pas d'écoute en double.
  if (claimed.length > 0 && !(await collectorAlive(db, 25))) {
    const key = process.env["AISSTREAM_API_KEY"] ?? "";
    const statics = new Map<number, { destination: string | null; eta: string | null }>();
    const found = key
      ? await collectPositions(key, claimed, STREAM_LISTEN_MS, statics)
      : new Map<number, ParsedPosition>();
    if (!key) console.error("[tracking] AISSTREAM_API_KEY manquante côté serveur");
    const context = await loadIngestContext(db);
    await Promise.all(
      claimed.map(async (mmsi) => {
        const declared = statics.get(mmsi);
        if (declared) {
          await supabaseAdmin.from("vessel_positions").update(declared).eq("mmsi", mmsi);
        }
        const position = found.get(mmsi);
        if (!position) {
          // Navire non entendu pendant la fenêtre d'écoute : on garde l'ancienne position.
          await supabaseAdmin
            .from("vessel_positions")
            .update({
              last_error: key
                ? "Aucun signal AIS reçu pendant l'écoute"
                : "Clé AISStream manquante",
            })
            .eq("mmsi", mmsi);
          return;
        }
        await ingestPosition(db, position, context);
      }),
    );
  }

  const { data } = await supabaseAdmin.from("vessel_positions").select("*").in("mmsi", mmsis);
  return (data ?? [])
    .filter((row) => row.latitude !== null && row.longitude !== null)
    .map((row) => ({
      mmsi: row.mmsi,
      vesselName: row.vessel_name,
      status: row.status,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      speedKnots: row.speed_knots,
      courseDeg: row.course_deg,
      reportedAt: row.reported_at,
      atdAt: row.atd_at ?? null,
      ataAt: row.ata_at ?? null,
      lastPortId: row.last_port_id ?? null,
      departurePortId: row.departure_port_id ?? null,
      arrivalPortId: row.arrival_port_id ?? null,
      eventDepartureId: row.event_departure_id ?? null,
      atdAfter: row.atd_after ?? null,
      ataAfter: row.ata_after ?? null,
      declaredDestination: row.destination ?? null,
      declaredEta: row.eta ?? null,
      fetchedAt: row.fetched_at,
    }));
}
