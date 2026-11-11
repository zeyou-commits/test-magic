import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

/** Table de mesure, pas encore dans les types générés. */
export const usageDb = typedSupabase as unknown as SupabaseClient;

/** Événements gardés aussi dans notre base (la table n'accepte que ceux-là). */
const STORED = ["page_view", "search_results", "search_choice", "booking_click"] as const;

/**
 * Les étapes du parcours, visibles dans Umami (Événements, Entonnoirs) :
 * suivi-demande → connexion-demandee → inscription-envoyee / connexion-google → suivi-enregistre
 * → billet-ajoute ; message-salon pour l'entraide.
 */
export type FunnelEvent =
  | "suivi-demande"
  | "connexion-demandee"
  | "inscription-envoyee"
  | "connexion-google"
  | "suivi-enregistre"
  | "billet-ajoute"
  | "message-salon"
  // « Une question ? » : recherche restée sans réponse (pour enrichir la FAQ), et sortie choisie.
  | "question-sans-reponse"
  | "question-sortie";

export type UsageEvent = (typeof STORED)[number] | FunnelEvent;

type UmamiWindow = Window & {
  umami?: { track: (event: string, data?: Record<string, string>) => void };
};

/** Mesure anonyme : ni compte, ni cookie. Un échec ne gêne jamais la navigation. */
export function track(event: UsageEvent, detail?: string) {
  if (typeof window === "undefined" || navigator.webdriver) return;
  const path = window.location.pathname.slice(0, 120);
  const host = window.location.hostname;
  if (path.startsWith("/admin") || host === "localhost" || host === "127.0.0.1") return;
  // Umami compte lui-même les pages vues ; on lui envoie les étapes.
  if (event !== "page_view") {
    try {
      (window as UmamiWindow).umami?.track(event, detail ? { detail: detail.slice(0, 60) } : undefined);
    } catch {
      /* mesure facultative */
    }
  }
  if (!(STORED as readonly string[]).includes(event)) return;
  void usageDb
    .from("bw_usage_events")
    .insert({ event, path, detail: detail?.slice(0, 60) ?? null })
    .then(
      () => undefined,
      () => undefined,
    );
}
