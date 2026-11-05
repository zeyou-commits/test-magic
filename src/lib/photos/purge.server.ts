import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Efface les fichiers de la corbeille et les dépôts abandonnés, puis vide la corbeille. */
export async function purgePhotos() {
  const db = supabaseAdmin as unknown as SupabaseClient;
  // Billets échus (script « billets ») : leurs fichiers rejoignent la corbeille, vidée juste après.
  const tickets = await db.rpc("bw_ticket_purge");
  const orphans = await db.rpc("bw_ticket_orphans");
  if (!orphans.error && orphans.data?.length) {
    const paths = (orphans.data as { path: string }[]).map((row) => row.path);
    for (let i = 0; i < paths.length; i += 100)
      await db.storage.from("bledway-billets").remove(paths.slice(i, i + 100));
  }
  const { data, error } = await db.rpc("bw_photo_purge_list");
  if (error) throw new Error(error.message);
  const byBucket = new Map<string, string[]>();
  for (const row of (data ?? []) as { bucket: string; path: string }[])
    byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);
  let removed = 0;
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const result = await db.storage.from(bucket).remove(chunk);
      if (result.error) throw new Error(result.error.message);
      await db.rpc("bw_photo_purge_done", { p_bucket: bucket, p_paths: chunk });
      removed += chunk.length;
    }
  }
  return { removed, ticketsExpired: tickets.error ? null : tickets.data };
}
