// Écoute AIS ciblée, appelée toutes les 10 minutes par Supabase (pg_cron + pg_net, gratuit).
// Seuls les navires proches d'un départ ou d'une arrivée sont écoutés, 40 secondes au plus.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { collectPositions } from "./aisstream.server";
import { COLLECTOR_KEY, ingestPosition, loadIngestContext } from "./ingest";
import { aisTargets } from "./targets";

const db = supabaseAdmin as unknown as SupabaseClient;
const LISTEN_MS = 40_000;

export async function targetedRefresh() {
  const now = Date.now();
  const [departures, vessels] = await Promise.all([
    db
      .from("departures")
      .select("vessel_id, departure_at, arrival_at, duration_minutes, status")
      .not("vessel_id", "is", null)
      .gte("departure_at", new Date(now - 48 * 3600_000).toISOString())
      .lte("departure_at", new Date(now + 3600_000).toISOString()),
    db.from("vessels").select("id, mmsi, status"),
  ]);
  if (departures.error) throw new Error(departures.error.message);
  const targets = aisTargets(
    (departures.data ?? []) as Parameters<typeof aisTargets>[0],
    (vessels.data ?? []) as Parameters<typeof aisTargets>[1],
    now,
  );
  const key = process.env["AISSTREAM_API_KEY"] ?? "";
  const heard: number[] = [];
  if (targets.size && key) {
    const mmsis = [...targets.keys()];
    const statics = new Map<number, { destination: string | null; eta: string | null }>();
    const found = await collectPositions(key, mmsis, LISTEN_MS, statics);
    const context = await loadIngestContext(db);
    for (const mmsi of mmsis) {
      const declared = statics.get(mmsi);
      if (declared) await db.from("vessel_positions").update(declared).eq("mmsi", mmsi);
      const position = found.get(mmsi);
      if (position && (await ingestPosition(db, position, context, Date.now()))) heard.push(mmsi);
    }
  }
  // Signe de vie lu par le site (pas d'écoute en double) et par l'admin (santé du signal).
  await db.from("bw_admin_settings").upsert({
    key: COLLECTOR_KEY,
    value: {
      last_seen: new Date().toISOString(),
      mode: "ciblé",
      targeted: [...targets.entries()].map(([mmsi, reason]) => ({ mmsi, reason })),
      heard,
      key_missing: !key,
    },
    updated_at: new Date().toISOString(),
  });
  return { targeted: targets.size, heard: heard.length };
}
