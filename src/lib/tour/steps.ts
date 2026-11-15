// Visite guidée de l'accueil : la 504 compagnon suit l'ordre du voyage, préparer, réserver, suivre.
// Les étapes sont des données, la logique est pure (testable sans navigateur).
// Chaque étape vise un repère `data-tour="…"` posé sur l'élément, jamais une classe de style qui peut changer.
import type { MessageKey } from "@/lib/i18n";

export type TourTarget = "prepare" | "book" | "filters";

export type TourStep = {
  target: TourTarget;
  /** Petite icône devant le titre. */
  icon: "cabas" | "ticket" | "anchor";
  title: MessageKey;
  body: MessageKey;
  action: MessageKey;
};

/** Identifiant versionné : changer la visite (v3) la remontre une fois à tout le monde. */
export const WELCOME_TOUR_ID = "accueil-v3";
export const TOUR_STORAGE_PREFIX = "bledway:tour:";
/** Lancer la visite depuis n'importe où (menu « Revoir la visite »). */
export const START_TOUR_EVENT = "bledway:tour:start";

export const WELCOME_TOUR: readonly TourStep[] = [
  { target: "prepare", icon: "cabas", title: "tour.prepare.title", body: "tour.prepare.body", action: "tour.prepare.action" },
  { target: "book", icon: "ticket", title: "tour.book.title", body: "tour.book.body", action: "tour.book.action" },
  { target: "filters", icon: "anchor", title: "tour.follow.title", body: "tour.follow.body", action: "tour.follow.action" },
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

export type Rect = { left: number; top: number; width: number; height: number };
export type CompanionLayout = {
  /** Position de la 504 (coin haut gauche) et sens : elle regarde vers le centre de l'écran. */
  car: { left: number; top: number; facingRight: boolean };
  bubble: { left: number; top: number; tailX: number; tailSide: "top" | "bottom" };
};

/**
 * Place la 504 et sa bulle autour de la cible, sans jamais la couvrir :
 * cible dans la moitié basse → 504 juste au-dessus, bulle au-dessus de la 504 ;
 * cible dans la moitié haute → 504 juste en dessous, bulle en dessous de la 504.
 */
export function layoutCompanion(
  target: Rect,
  viewport: { width: number; height: number },
  sizes: { car: number; carHeight: number; bubbleWidth: number; bubbleHeight: number; margin: number },
): CompanionLayout {
  const { car, carHeight, bubbleWidth, bubbleHeight, margin } = sizes;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const centerX = target.left + target.width / 2;
  const carLeft = clamp(centerX - car / 2, margin, viewport.width - car - margin);
  const below = target.top + target.height / 2 < viewport.height / 2;
  const carTop = below ? target.top + target.height + 6 : target.top - carHeight - 2;
  const bubbleLeft = clamp(carLeft + car / 2 - bubbleWidth / 2, margin, viewport.width - bubbleWidth - margin);
  const bubbleTop = below ? carTop + carHeight + 8 : carTop - bubbleHeight - 8;
  const tailX = clamp(carLeft + car / 2 - bubbleLeft, 24, bubbleWidth - 24);
  return {
    car: { left: carLeft, top: carTop, facingRight: carLeft + car / 2 < viewport.width / 2 },
    bubble: { left: bubbleLeft, top: bubbleTop, tailX, tailSide: below ? "top" : "bottom" },
  };
}
