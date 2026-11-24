import { tr } from "@/lib/i18n/translate";
import { intlLocale } from "@/lib/i18n";
export type ReviewKind = "port" | "vessel" | "company";
export const reviewCriteria: Record<ReviewKind, { code: string; label: string }[]> = {
  vessel: [
    { code: "cleanliness", get label() { return tr("ui.libFerryReviewCriteria.propreteABord"); } },
    { code: "comfort", get label() { return tr("ui.libFerryReviewCriteria.confortDesEspaces"); } },
    { code: "rest", get label() { return tr("ui.libFerryReviewCriteria.calmeEtRepos"); } },
    { code: "food", get label() { return tr("ui.libFerryReviewCriteria.restauration"); } },
    { code: "facilities", get label() { return tr("ui.libFerryReviewCriteria.equipementsEtServices"); } },
  ],
  port: [
    { code: "access", get label() { return tr("ui.libFerryReviewCriteria.accesAuTerminal"); } },
    { code: "signage", get label() { return tr("ui.libFerryReviewCriteria.orientationEtSignaletique"); } },
    { code: "cleanliness", get label() { return tr("ui.libFerryReviewCriteria.propreteDesLieux"); } },
    { code: "waiting", get label() { return tr("ui.libFerryReviewCriteria.confortPendantLAttente"); } },
    { code: "services", get label() { return tr("ui.libFerryReviewCriteria.servicesPratiques"); } },
  ],
  company: [
    { code: "information", get label() { return tr("ui.libFerryReviewCriteria.clarteDesInformations"); } },
    { code: "boarding", get label() { return tr("ui.libFerryReviewCriteria.organisationDeLEmbarquement"); } },
    { code: "changes", get label() { return tr("ui.libFerryReviewCriteria.gestionDesChangements"); } },
    { code: "support", get label() { return tr("ui.libFerryReviewCriteria.serviceClient"); } },
    { code: "value", get label() { return tr("ui.libFerryReviewCriteria.rapportQualitePrix"); } },
  ],
};
export type ReviewScores = Record<string, number | null>;
export function reviewScore(kind: ReviewKind, scores: ReviewScores): number | null {
  const keys = reviewCriteria[kind].map((c) => c.code);
  if (Object.keys(scores).some((k) => !keys.includes(k))) return null;
  const rated = Object.values(scores).filter((v): v is number => v !== null);
  if (rated.length < 3 || rated.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) return null;
  return rated.reduce((a, b) => a + b, 0) / rated.length;
}

export const reviewNumber = (score: number) =>
  score.toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Brouillon de note relu par le formulaire (clé partagée avec EntityReviews). */
export const ratingDraftKey = (kind: ReviewKind, target: string) => `bledway:rating:${kind}:${target}`;

/**
 * Un clic sur l'étoile n pré-remplit tous les critères à n : le formulaire s'ouvre prêt à envoyer,
 * le voyageur ajuste ensuite chaque critère s'il le souhaite.
 */
export function presetRating(kind: ReviewKind, target: string, score: number) {
  const scores = Object.fromEntries(reviewCriteria[kind].map((c) => [c.code, score]));
  try {
    window.sessionStorage.setItem(ratingDraftKey(kind, target), JSON.stringify(scores));
  } catch {
    /* stockage indisponible : le formulaire s'ouvre vide */
  }
}
