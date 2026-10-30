// Écoute AIS ciblée côté Vercel, appelée toutes les 10 minutes par Supabase (pg_cron + pg_net, gratuit).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { listenToTargets } from "./listen";

const LISTEN_MS = 40_000;

export async function targetedRefresh() {
  return listenToTargets(
    supabaseAdmin as unknown as SupabaseClient,
    process.env["AISSTREAM_API_KEY"] ?? "",
    LISTEN_MS,
    "vercel",
  );
}
