// Enregistrement d'une position AIS reçue : observation horodatée, dernière position connue,
// départ / arrivée réels au port. Partagé par l'écoute à l'ouverture de la carte et par l'écoute
// ciblée (/api/ais-refresh) : le client Supabase est fourni par l'appelant.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedPosition } from "./parse";
import { acceptableReport, observePortEvent } from "./events";

export type IngestContext = {
  ports: { id: string; latitude: number; longitude: number }[];
  vessels: { id: string; mmsi: number | null }[];
  routes: { id: string; departure_port_id: string; arrival_port_id: string }[];
};

export async function loadIngestContext(db: SupabaseClient): Promise<IngestContext> {
  const [ports, vessels, routes] = await Promise.all([
    db.from("ports").select("id, latitude, longitude").eq("status", "active"),
    db.from("vessels").select("id, mmsi"),
    db.from("routes").select("id, departure_port_id, arrival_port_id"),
  ]);
  return {
    ports: (ports.data ?? []) as IngestContext["ports"],
    vessels: (vessels.data ?? []) as IngestContext["vessels"],
    routes: (routes.data ?? []) as IngestContext["routes"],
  };
}

/** Enregistre une position ; renvoie false si elle est plus ancienne que la dernière connue. */
export async function ingestPosition(
  db: SupabaseClient,
  position: ParsedPosition,
  context: IngestContext,
  now = Date.now(),
): Promise<boolean> {
  const mmsi = position.mmsi;
  const { data: previous } = await db
    .from("vessel_positions")
    .select(
      "latitude, longitude, speed_knots, course_deg, reported_at, atd_at, ata_at, last_port_id, departure_port_id, arrival_port_id, event_departure_id",
    )
    .eq("mmsi", mmsi)
    .maybeSingle();

  if (!acceptableReport(position, previous, now)) return false;
  const event = observePortEvent(position, previous, context.ports, now);
  if (event.atd_at && event.departure_port_id) {
    const vessel = context.vessels.find((v) => v.mmsi === mmsi);
    const routeIds = context.routes
      .filter((r) => r.departure_port_id === event.departure_port_id)
      .map((r) => r.id);
    if (vessel && routeIds.length) {
      const instant = Date.parse(event.atd_at);
      const { data: candidates } = await db
        .from("departures")
        .select("id")
        .eq("vessel_id", vessel.id)
        .neq("status", "cancelled")
        .in("route_id", routeIds)
        .gte("departure_at", new Date(instant - 6 * 3600_000).toISOString())
        .lte("departure_at", new Date(instant + 6 * 3600_000).toISOString());
      if (candidates?.length === 1) event.event_departure_id = candidates[0]?.id ?? null;
    }
  }
  // Une observation horodatée ne se remplace pas par le timestamp de la tentative.
  await db.from("vessel_position_observations").upsert(
    {
      mmsi,
      reported_at: position.reportedAt ?? "",
      latitude: position.latitude,
      longitude: position.longitude,
      speed_knots: position.speedKnots,
      course_deg: position.courseDeg,
    },
    { onConflict: "mmsi,reported_at", ignoreDuplicates: true },
  );
  const { error } = await db
    .from("vessel_positions")
    .update({
      ...event,
      last_error: null,
      vessel_name: position.vesselName,
      status: position.status,
      latitude: position.latitude,
      longitude: position.longitude,
      // Ne pas conserver l'ancienne vitesse sous le nouvel horodatage.
      speed_knots: position.speedKnots,
      course_deg: position.courseDeg,
      reported_at: position.reportedAt,
      fetched_at: new Date(now).toISOString(),
    })
    .eq("mmsi", mmsi);
  if (error) console.error("[tracking] position non enregistrée", error.code);
  return !error;
}

/** L'écoute ciblée a-t-elle donné signe de vie récemment ? */
export const COLLECTOR_KEY = "ais_collector";
export async function collectorAlive(db: SupabaseClient, maxAgeMinutes = 10) {
  const { data, error } = await db
    .from("bw_admin_settings")
    .select("value")
    .eq("key", COLLECTOR_KEY)
    .maybeSingle();
  if (error || !data) return false;
  const lastSeen = Date.parse(String((data.value as { last_seen?: string }).last_seen ?? ""));
  return Number.isFinite(lastSeen) && Date.now() - lastSeen < maxAgeMinutes * 60_000;
}
