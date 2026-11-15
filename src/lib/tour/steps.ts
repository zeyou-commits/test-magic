// Visite guidée de l'accueil : les étapes sont des données, la logique est pure (testable sans navigateur).
// Chaque étape vise un repère `data-tour="…"` posé sur l'élément, jamais une classe de style qui peut changer.
import type { MessageKey } from "@/lib/i18n";

export type TourTarget = "book" | "filters" | "salons" | "nav" | "profile";

export type TourStep = {
  target: TourTarget;
  title: MessageKey;
  body: MessageKey;
};

/** Identifiant versionné : changer la visite (v2) la remontre une fois à tout le monde. */
export const WELCOME_TOUR_ID = "accueil-v1";
export const TOUR_STORAGE_PREFIX = "bledway:tour:";
/** Lancer la visite depuis n'importe où (menu « Revoir la visite »). */
export const START_TOUR_EVENT = "bledway:tour:start";

export const WELCOME_TOUR: readonly TourStep[] = [
  { target: "book", title: "tour.book.title", body: "tour.book.body" },
  { target: "filters", title: "tour.filters.title", body: "tour.filters.body" },
  { target: "salons", title: "tour.salons.title", body: "tour.salons.body" },
  { target: "nav", title: "tour.nav.title", body: "tour.nav.body" },
  { target: "profile", title: "tour.profile.title", body: "tour.profile.body" },
];

/**
 * Garde les étapes dont la cible est visible à l'écran, avec l'élément retenu.
 * Le téléphone et l'ordinateur ont chacun leur élément pour une même cible : on prend le premier visible.
 */
export function resolveSteps<E>(
  steps: readonly TourStep[],
  candidates: (target: TourTarget) => E[],
  isVisible: (element: E) => boolean,
): { step: TourStep; element: E }[] {
  const out: { step: TourStep; element: E }[] = [];
  for (const step of steps) {
    const element = candidates(step.target).find(isVisible);
    if (element !== undefined) out.push({ step, element });
  }
  return out;
}

/** La visite s'ouvre seule une fois : jamais si elle a été vue, ni hors de l'accueil, ni sans au moins deux étapes. */
export function shouldAutoStart(opts: { seen: boolean; pathname: string; stepCount: number }): boolean {
  return !opts.seen && opts.pathname === "/" && opts.stepCount >= 2;
}
