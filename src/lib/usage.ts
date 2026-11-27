import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

/** Table de mesure, pas encore dans les types générés. */
export const usageDb = typedSupabase as unknown as SupabaseClient;

/** Événements gardés aussi dans notre base (la table n'accepte que ceux-là). */
const STORED = ["page_view", "search_results", "search_choice", "booking_click"] as const;

/**
 * Les étapes du parcours, visibles dans Umami (Événements, Entonnoirs) :
 * suivi-demande → connexion-demandee → inscription-envoyee / connexion-google → connexion-reussie
 * → suivi-enregistre → billet-ajoute ; message-salon pour l'entraide.
 */
export type FunnelEvent =
  | "suivi-demande"
  | "connexion-demandee"
  | "inscription-envoyee"
  | "connexion-google"
  | "connexion-reussie"
  | "suivi-enregistre"
  | "billet-ajoute"
  | "message-salon"
  // « Une question ? » : recherche restée sans réponse (pour enrichir la FAQ), et sortie choisie.
  | "question-sans-reponse"
  | "question-sortie"
  // Ce que les gens regardent et font sur la carte et dans l'appli.
  | "fiche-ouverte"
  | "mon-voyage-ouvert"
  | "signalement-envoye"
  | "partage"
  | "notifications-activees"
  | "langue-changee";

export type UsageEvent = (typeof STORED)[number] | FunnelEvent;

/** Précisions d'un événement, filtrables dans Umami (Événements → propriétés). */
export type UsageData = Record<string, string | number | boolean | null | undefined>;

type UmamiWindow = Window & {
  umami?: {
    track: (event: string, data?: Record<string, string | number | boolean>) => void;
    identify?: (data: Record<string, string | number | boolean>) => void;
  };
};

function measured() {
  if (typeof window === "undefined" || navigator.webdriver) return false;
  const host = window.location.hostname;
  if (window.location.pathname.startsWith("/admin")) return false;
  return host !== "localhost" && host !== "127.0.0.1";
}

/** Valeurs courtes et sans vide : Umami garde des propriétés lisibles, sans texte libre long. */
function clean(data: UsageData): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined || value === "") continue;
    out[key] = typeof value === "string" ? value.slice(0, 60) : value;
  }
  return out;
}

/** Mesure anonyme : ni compte, ni cookie. Un échec ne gêne jamais la navigation. */
export function track(event: UsageEvent, detail?: string, data: UsageData = {}) {
  if (!measured()) return;
  const path = window.location.pathname.slice(0, 120);
  // Umami compte lui-même les pages vues ; on lui envoie les étapes.
  if (event !== "page_view") {
    const props = clean({ detail, ...data });
    try {
      (window as UmamiWindow).umami?.track(event, Object.keys(props).length ? props : undefined);
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

/**
 * Profil de la visite, sans rien qui désigne la personne : inscrit ou non, appli installée,
 * langue, traversée suivie. Umami l'attache à la session (filtre « Propriétés de session »).
 * Envoyé une seule fois par état, pour ne pas consommer le quota.
 */
let lastProfile = "";
let pendingProfile = "";
export function describeVisit(data: UsageData, attempt = 0) {
  if (!measured()) return;
  const props = clean(data);
  const key = JSON.stringify(props);
  if (key === lastProfile) return;
  pendingProfile = key;
  const umami = (window as UmamiWindow).umami;
  if (!umami?.identify) {
    // Le script Umami se charge après la page : quelques essais, puis on abandonne (bloqueur).
    if (attempt < 5)
      window.setTimeout(() => {
        if (pendingProfile === key) describeVisit(data, attempt + 1);
      }, 2000);
    return;
  }
  try {
    umami.identify(props);
    lastProfile = key;
  } catch {
    /* mesure facultative */
  }
}

/** Appli ouverte depuis l'écran d'accueil (PWA) ou l'appli Android, plutôt que dans un navigateur. */
export function displayMode(): "appli-android" | "appli-installee" | "navigateur" {
  if (typeof window === "undefined") return "navigateur";
  if (document.referrer.startsWith("android-app://")) return "appli-android";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "appli-installee" : "navigateur";
}
