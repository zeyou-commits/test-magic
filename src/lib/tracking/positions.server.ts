// Suivi des navires : cache partagé en base + écoute ponctuelle du flux AISStream.
// Ce fichier ne s'exécute que sur le serveur : la clé API n'est jamais envoyée au navigateur.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { collectPositions } from "./aisstream.server";
import type { ParsedPosition } from "./parse";

/** Une position n'est pas redemandée tant qu'elle a moins de 5 minutes. */
export const REFRESH_MINUTES = 5;
/** On suit un navire de 6 h avant son départ jusqu'à 1 h après son arrivée prévue. */
const BEFORE_DEPARTURE_MS = 6 * 3600_000;
const AFTER_ARRIVAL_MS = 3600_000;
const DEFAULT_CROSSING_MS = 36 * 3600_000;
/** Garde-fou : nombre maximal de navires rafraîchis par une seule requête. */
const MAX_CALLS_PER_REQUEST = 50;
/** Durée d'écoute du flux AIS par rafraîchissement. */
const STREAM_LISTEN_MS = 8000;

export interface PublicPosition {
  mmsi: number;
  vesselName: string | null;
  status: string | null;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  courseDeg: number | null;
  reportedAt: string | null;
  fetchedAt: string;
}

/** MMSI des navires à suivre maintenant (départ proche ou traversée en cours). */
async function trackedMmsis(): Promise<number[]> {
  const now = Date.now();
  const { data: vessels } = await supabaseAdmin
    .from("vessels")
    .select("id, mmsi")
    .not("mmsi", "is", null);
  if (!vessels?.length) return [];
  const byVessel = new Map(vessels.map((vessel) => [vessel.id, vessel.mmsi as number]));

  const since = new Date(now - DEFAULT_CROSSING_MS - AFTER_ARRIVAL_MS).toISOString();
  const until = new Date(now + BEFORE_DEPARTURE_MS).toISOString();
  const { data: departures } = await supabaseAdmin
    .from("departures")
    .select("vessel_id, departure_at, arrival_at, status")
    .in("vessel_id", [...byVessel.keys()])
    .neq("status", "cancelled")
    .gte("departure_at", since)
    .lte("departure_at", until);

  const result = new Set<number>();
  (departures ?? []).forEach((departure) => {
    if (!departure.vessel_id) return;
    const start = new Date(departure.departure_at).getTime();
    const end = departure.arrival_at
      ? new Date(departure.arrival_at).getTime()
      : start + DEFAULT_CROSSING_MS;
    if (start - BEFORE_DEPARTURE_MS <= now && now <= end + AFTER_ARRIVAL_MS) {
      const mmsi = byVessel.get(departure.vessel_id);
      if (mmsi) result.add(mmsi);
    }
  });
  return [...result];
}

/**
 * Renvoie les positions des navires suivis. Pour chaque navire dont la position date de plus de
 * 20 minutes, UNE seule requête (même avec des milliers de visiteurs) rafraîchit la donnée :
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

  if (claimed.length > 0) {
    const key = process.env["AISSTREAM_API_KEY"] ?? "";
    const statics = new Map<number, { destination: string | null; eta: string | null }>();
    const found = key
      ? await collectPositions(key, claimed, STREAM_LISTEN_MS, statics)
      : new Map<number, ParsedPosition>();
    if (!key) console.error("[tracking] AISSTREAM_API_KEY manquante côté serveur");
    await Promise.all(
      claimed.map(async (mmsi) => {
        const declared = statics.get(mmsi);
        if (declared) {
          await supabaseAdmin
            .from("vessel_positions")
            .update(declared as never)
            .eq("mmsi", mmsi);
        }
        const position = found.get(mmsi);
        if (!position) {
          // Navire non entendu pendant la fenêtre d'écoute : on garde l'ancienne position.
          await supabaseAdmin
            .from("vessel_positions")
            .update({ last_error: key ? "Aucun signal AIS reçu pendant l'écoute" : "Clé AISStream manquante" })
            .eq("mmsi", mmsi);
          return;
        }
        await supabaseAdmin
          .from("vessel_positions")
          .update({
            vessel_name: position.vesselName,
            status: position.status,
            latitude: position.latitude,
            longitude: position.longitude,
            speed_knots: position.speedKnots,
            course_deg: position.courseDeg,
            reported_at: position.reportedAt,
            last_error: null,
          })
          .eq("mmsi", mmsi);
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
      fetchedAt: row.fetched_at,
    }));
}
