// Suivi des navires : cache partagé en base + écoute ponctuelle du flux AISStream.
// Ce fichier ne s'exécute que sur le serveur : la clé API n'est jamais envoyée au navigateur.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { collectPositions } from "./aisstream.server";
import type { ParsedPosition } from "./parse";
import { acceptableReport, observePortEvent } from "./events";

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

  if (claimed.length > 0) {
    const key = process.env["AISSTREAM_API_KEY"] ?? "";
    const statics = new Map<number, { destination: string | null; eta: string | null }>();
    const found = key
      ? await collectPositions(key, claimed, STREAM_LISTEN_MS, statics)
      : new Map<number, ParsedPosition>();
    if (!key) console.error("[tracking] AISSTREAM_API_KEY manquante côté serveur");
    const { data: ports = [] } = await supabaseAdmin.from("ports").select("id, latitude, longitude").eq("status", "active");
    const { data: vessels = [] } = await supabaseAdmin.from("vessels").select("id, mmsi");
    const { data: routes = [] } = await supabaseAdmin.from("routes").select("id, departure_port_id, arrival_port_id");
    await Promise.all(
      claimed.map(async (mmsi) => {
        const declared = statics.get(mmsi);
        if (declared) {
          await supabaseAdmin
            .from("vessel_positions")
            .update(declared)
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
          .select("latitude, longitude, speed_knots, course_deg, reported_at, atd_at, ata_at, last_port_id, departure_port_id, arrival_port_id, event_departure_id")
          .eq("mmsi", mmsi)
          .maybeSingle();

        if (!acceptableReport(position, previous, Date.now())) return;
        const event = observePortEvent(position, previous, ports ?? [], Date.now());
        if (event.atd_at && event.departure_port_id) {
          const vessel = (vessels ?? []).find((v) => v.mmsi === mmsi);
          const routeIds = (routes ?? []).filter((r) => r.departure_port_id === event.departure_port_id).map((r) => r.id);
          if (vessel && routeIds.length) {
            const instant = Date.parse(event.atd_at);
            const { data: candidates } = await supabaseAdmin.from("departures").select("id")
              .eq("vessel_id", vessel.id).neq("status", "cancelled").in("route_id", routeIds)
              .gte("departure_at", new Date(instant - 6 * 3600_000).toISOString())
              .lte("departure_at", new Date(instant + 6 * 3600_000).toISOString());
            if (candidates?.length === 1) event.event_departure_id = candidates[0]?.id ?? null;
          }
        }
        // Une observation horodatée ne se remplace pas par le timestamp de la tentative.
        await supabaseAdmin.from("vessel_position_observations").upsert({
          mmsi, reported_at: position.reportedAt ?? "", latitude: position.latitude,
          longitude: position.longitude, speed_knots: position.speedKnots, course_deg: position.courseDeg,
        }, { onConflict: "mmsi,reported_at", ignoreDuplicates: true });
        const { error } = await supabaseAdmin.from("vessel_positions").update({
          ...event, last_error: null, vessel_name: position.vesselName,
          status: position.status, latitude: position.latitude, longitude: position.longitude,
          // Ne pas conserver l'ancienne vitesse sous le nouvel horodatage.
          speed_knots: position.speedKnots, course_deg: position.courseDeg,
          reported_at: position.reportedAt,
        }).eq("mmsi", mmsi);
        if (error) console.error("[tracking] position non enregistrée", error.code);

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
