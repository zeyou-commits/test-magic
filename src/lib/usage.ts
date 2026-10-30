import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

/** Table de mesure, pas encore dans les types générés. */
export const usageDb = typedSupabase as unknown as SupabaseClient;

export type UsageEvent = "page_view" | "search_results" | "search_choice" | "booking_click";

/** Mesure anonyme : ni compte, ni cookie. Un échec ne gêne jamais la navigation. */
export function track(event: UsageEvent, detail?: string) {
  if (typeof window === "undefined" || navigator.webdriver) return;
  const path = window.location.pathname.slice(0, 120);
  if (path.startsWith("/admin") || window.location.hostname === "localhost") return;
  void usageDb
    .from("bw_usage_events")
    .insert({ event, path, detail: detail?.slice(0, 60) ?? null })
    .then(
      () => undefined,
      () => undefined,
    );
}
