// Suivi des navires : cache partagé en base + écoute ponctuelle du flux AISStream.
// Ce fichier ne s'exécute que sur le serveur : la clé API n'est jamais envoyée au navigateur.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { collectPositions } from "./aisstream.server";
import type { ParsedPosition } from "./parse";

/** Une position n'est pas redemandée tant qu'elle a moins de 5 minutes. */
export const REFRESH_MINUTES = 5;
/** Garde-fou : nombre maximal de navires rafraîchis par une seule requête. */
const MAX_CALLS_PER_REQUEST = 50;
/** Durée d'écoute du flux AIS par rafraîchissement. */
const STREAM_LISTEN_MS = 18000;

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
        const { data: previous } = await supabaseAdmin
          .from("vessel_positions")
          .select("latitude, longitude, speed_knots, course_deg, reported_at, atd_at, ata_at, last_port_id")
          .eq("mmsi", mmsi)
          .maybeSingle();

        // Ne jamais écraser une mesure GPS existante par un null AIS.
        const update: Record<string, unknown> = { last_error: null };
        if (position.vesselName !== null) update.vessel_name = position.vesselName;
        if (position.status !== null) update.status = position.status;
        update.latitude = position.latitude;
        update.longitude = position.longitude;
        if (position.speedKnots !== null) update.speed_knots = position.speedKnots;
        if (position.courseDeg !== null) update.course_deg = position.courseDeg;
        if (position.reportedAt !== null) update.reported_at = position.reportedAt;

        // Détection de l'escale et de l'appareillage à partir des coordonnées réelles des ports.
        const { data: ports } = await supabaseAdmin.from("ports").select("id, latitude, longitude").eq("status", "active");
        const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const rad = (v: number) => (v * Math.PI) / 180;
          const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
          const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
          return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
        };
        const previousPort = previous?.last_port_id
          ? (ports ?? []).find((port) => port.id === previous.last_port_id)
          : null;
        const wasAtPort = previousPort && previous?.latitude != null && previous?.longitude != null
          ? distanceKm(previous.latitude, previous.longitude, previousPort.latitude, previousPort.longitude) < 2
          : false;
        const nearest = (ports ?? [])
          .map((port) => ({ id: port.id, distance: distanceKm(position.latitude, position.longitude, port.latitude, port.longitude) }))
          .sort((x, y) => x.distance - y.distance)[0];
        const previousPortDistance = previousPort && previous?.latitude != null && previous?.longitude != null
          ? distanceKm(position.latitude, position.longitude, previousPort.latitude, previousPort.longitude)
          : Infinity;
        const arrivedAtDifferentPort = Boolean(
          nearest && nearest.distance < 2 && previousPort && nearest.id !== previousPort.id,
        );
        if (nearest && nearest.distance < 2) {
          update.last_port_id = nearest.id;
          if (arrivedAtDifferentPort) update.ata_at = position.reportedAt ?? new Date().toISOString();
        }
        const newDeparture = wasAtPort && previousPortDistance >= 3 && (position.speedKnots ?? 0) >= 3;
        const previousVoyageCompleted = previous?.atd_at && previous?.ata_at && Date.parse(previous.ata_at) >= Date.parse(previous.atd_at);
        if (newDeparture && (!previous?.atd_at || previousVoyageCompleted)) {
          update.atd_at = position.reportedAt ?? new Date().toISOString();
          update.ata_at = null;
        }
        await supabaseAdmin.from("vessel_positions").update(update as never).eq("mmsi", mmsi);
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
      declaredDestination: row.destination ?? null,
      declaredEta: row.eta ?? null,
      fetchedAt: row.fetched_at,
    }));
}
