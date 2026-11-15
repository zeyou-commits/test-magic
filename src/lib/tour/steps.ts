// Visite guidée de l'accueil : les étapes sont des données, la logique est pure (testable sans navigateur).
// Chaque étape vise un repère `data-tour="…"` posé sur l'élément, jamais une classe de style qui peut changer.
// Les étapes répondent aux questions du visiteur, pas à « voici nos boutons ».
import type { MessageKey } from "@/lib/i18n";

export type TourTarget = "book" | "filters" | "salons" | "nav" | "profile";

export type TourStep = {
  /** null : bulle centrée, sans rien éclairer (accueil). */
  target: TourTarget | null;
  title: MessageKey;
  body: MessageKey;
};

/** Identifiant versionné : changer la visite (v2) la remontre une fois à tout le monde. */
export const WELCOME_TOUR_ID = "accueil-v2";
export const TOUR_STORAGE_PREFIX = "bledway:tour:";
/** Lancer la visite depuis n'importe où (menu « Revoir la visite »). */
export const START_TOUR_EVENT = "bledway:tour:start";

export const WELCOME_TOUR: readonly TourStep[] = [
  { target: null, title: "tour.welcome.title", body: "tour.welcome.body" },
  { target: "filters", title: "tour.filters.title", body: "tour.filters.body" },
  { target: "salons", title: "tour.salons.title", body: "tour.salons.body" },
  { target: "nav", title: "tour.nav.title", body: "tour.nav.body" },
  { target: "profile", title: "tour.profile.title", body: "tour.profile.body" },
  // La dernière étape mène à une action : chercher sa traversée.
  { target: "book", title: "tour.book.title", body: "tour.book.body" },
];

/**
 * Garde les étapes dont la cible est visible à l'écran, avec l'élément retenu (null pour l'accueil).
 * Le téléphone et l'ordinateur ont chacun leur élément pour une même cible : on prend le premier visible.
 */
export function resolveSteps<E>(
  steps: readonly TourStep[],
  candidates: (target: TourTarget) => E[],
  isVisible: (element: E) => boolean,
): { step: TourStep; element: E | null }[] {
  const out: { step: TourStep; element: E | null }[] = [];
  for (const step of steps) {
    if (step.target === null) {
      out.push({ step, element: null });
      continue;
    }
    const element = candidates(step.target).find(isVisible);
    if (element !== undefined) out.push({ step, element });
  }
  return out;
}

/** La visite s'ouvre seule une fois : jamais si elle a été vue, ni hors de l'accueil, ni sans au moins deux étapes. */
export function shouldAutoStart(opts: { seen: boolean; pathname: string; stepCount: number }): boolean {
  return !opts.seen && opts.pathname === "/" && opts.stepCount >= 2;
}
