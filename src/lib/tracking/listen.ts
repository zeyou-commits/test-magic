// Écoute AIS ciblée, partagée par la route Vercel et la fonction Supabase « ais-listen » :
// seuls les navires proches d'un départ ou d'une arrivée sont écoutés, `listenMs` au plus.
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectPositions } from "./aisstream.server";
import { COLLECTOR_KEY, ingestPosition, loadIngestContext } from "./ingest";
import { aisTargets } from "./targets";

export async function listenToTargets(
  db: SupabaseClient,
  key: string,
  listenMs: number,
  host: "vercel" | "supabase",
) {
  const now = Date.now();
  const [departures, vessels, positions] = await Promise.all([
    db
      .from("departures")
      .select("vessel_id, departure_at, arrival_at, duration_minutes, status")
      .not("vessel_id", "is", null)
      .gte("departure_at", new Date(now - 48 * 3600_000).toISOString())
      .lte("departure_at", new Date(now + 3600_000).toISOString()),
    db.from("vessels").select("id, mmsi, status"),
    db.from("vessel_positions").select("mmsi, speed_knots"),
  ]);
  if (departures.error) throw new Error(departures.error.message);
  const targets = aisTargets(
    (departures.data ?? []) as Parameters<typeof aisTargets>[0],
    (vessels.data ?? []) as Parameters<typeof aisTargets>[1],
    now,
    new Set(
      ((positions.data ?? []) as { mmsi: number; speed_knots: number | null }[])
        .filter((position) => (position.speed_knots ?? 0) < 1.5)
        .map((position) => Number(position.mmsi)),
    ),
  );
  const heard: number[] = [];
  const startedAt = Date.now();
  if (targets.size && key) {
    const mmsis = [...targets.keys()];
    const statics = new Map<number, { destination: string | null; eta: string | null }>();
    const found = await collectPositions(key, mmsis, listenMs, statics);
    const context = await loadIngestContext(db);
    for (const mmsi of mmsis) {
      const declared = statics.get(mmsi);
      if (declared) await db.from("vessel_positions").update(declared).eq("mmsi", mmsi);
      const position = found.get(mmsi);
      if (position && (await ingestPosition(db, position, context, Date.now()))) heard.push(mmsi);
    }
  }
  const listenedMs = Date.now() - startedAt;
  // Signe de vie lu par le site (pas d'écoute en double) et par l'admin (santé du signal).
  await db.from("bw_admin_settings").upsert({
    key: COLLECTOR_KEY,
    value: {
      last_seen: new Date().toISOString(),
      mode: "ciblé",
      host,
      listened_ms: listenedMs,
      targeted: [...targets.entries()].map(([mmsi, reason]) => ({ mmsi, reason })),
      heard,
      key_missing: !key,
    },
    updated_at: new Date().toISOString(),
  });
  return {
    targeted: targets.size,
    heard: heard.length,
    listened_ms: listenedMs,
    key_missing: !key,
  };
}
