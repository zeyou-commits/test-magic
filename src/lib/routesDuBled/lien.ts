import type { Lieu } from "./porteAPorte";

/**
 * Routes du bled est le seul outil de trajet du site : le menu, Préparer et l'accueil y mènent.
 * Quand on connaît déjà le départ et l'arrivée (Préparer), on les passe pour remplir les champs.
 */
export const ROUTES_SEED_KEY = "bledway:routes-seed:v1";

export function openRoutesDuBled(seed?: { from?: Lieu | null; to?: Lieu | null }) {
  try {
    if (seed) window.sessionStorage.setItem(ROUTES_SEED_KEY, JSON.stringify(seed));
  } catch {
    /* stockage indisponible : la page s'ouvre vide */
  }
  window.location.assign("/routes-du-bled");
}

/** Lu une seule fois à l'arrivée sur la page, puis effacé. */
export function takeRoutesSeed(): { from?: unknown; to?: unknown } | null {
  try {
    const raw = window.sessionStorage.getItem(ROUTES_SEED_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(ROUTES_SEED_KEY);
    return JSON.parse(raw) as { from?: unknown; to?: unknown };
  } catch {
    return null;
  }
}
