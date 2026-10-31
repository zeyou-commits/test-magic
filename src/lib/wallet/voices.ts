import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Table du script du 23/11/2026, absente des types générés.
export const voiceDb = supabase as unknown as SupabaseClient;
export const VOICE_BUCKET = "bledway-voices";
export type DinarVoice = { said: string; storage_path: string };

/** Null tant que le script n'est pas appliqué : aucun bouton d'écoute, sans erreur. */
export const dinarVoicesQuery = queryOptions({
  queryKey: ["dinar-voices"],
  staleTime: 10 * 60_000,
  retry: false,
  queryFn: async (): Promise<DinarVoice[] | null> => {
    const { data, error } = await voiceDb.from("bw_dinar_voices").select("said,storage_path");
    return error ? null : (data as DinarVoice[]);
  },
});

export function playVoice(path: string) {
  const url = voiceDb.storage.from(VOICE_BUCKET).getPublicUrl(path).data.publicUrl;
  void new Audio(url).play().catch(() => undefined);
}
