import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Efface les fichiers de la corbeille et les dépôts abandonnés, puis vide la corbeille. */
export async function purgePhotos() {
  const db = supabaseAdmin as unknown as SupabaseClient;
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
  return { removed };
}
