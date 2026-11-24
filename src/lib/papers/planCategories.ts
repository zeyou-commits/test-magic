import { isPaperToDo, paperKind, type Task } from "@/content/formalites";
import { tr } from "@/lib/i18n/translate";

/**
 * Le bilan de « Mes papiers » rangé en quatre rubriques, dans l'ordre où on s'en occupe :
 * - steps : les démarches à lancer avant le départ (rendez-vous, dossiers, inscriptions) ;
 * - documents : les papiers à faire établir avant le départ (certificat, lettre…) ;
 * - pack : ce qu'on emporte dans la pochette du voyage (passeports, livret de famille…) ;
 * - attention : les règles à connaître et les conseils (devises, sur place, au retour).
 */
export type PlanCategory = "steps" | "documents" | "pack" | "attention";

export const planCategoryOrder: PlanCategory[] = ["steps", "documents", "pack", "attention"];

export const planCategoryLabels: Record<
  PlanCategory,
  { title: string; short: string; empty: string; hint: string }
> = {
  steps: {
    get title() { return tr("ui.libPapersPlanCategories.demarchesAFaireAvant"); },
    get short() { return tr("ui.libPapersPlanCategories.demarches"); },
    get empty() { return tr("ui.libPapersPlanCategories.aucuneDemarcheAFaire"); },
    get hint() { return tr("ui.libPapersPlanCategories.rendezVousDossiersInscriptionsA"); },
  },
  documents: {
    get title() { return tr("ui.libPapersPlanCategories.documentsAPreparer"); },
    get short() { return tr("ui.libPapersPlanCategories.aPreparer"); },
    get empty() { return tr("ui.libPapersPlanCategories.rienAFaireEtablir"); },
    get hint() { return tr("ui.libPapersPlanCategories.desPapiersADemanderOu"); },
  },
  pack: {
    get title() { return tr("ui.libPapersPlanCategories.aEmporterLeJourJ"); },
    get short() { return tr("ui.libPapersPlanCategories.aEmporter"); },
    get empty() { return tr("ui.libPapersPlanCategories.justeVosPiecesDIdentite"); },
    get hint() { return tr("ui.libPapersPlanCategories.dansLaPochetteDuVoyage"); },
  },
  attention: {
    get title() { return tr("ui.libPapersPlanCategories.pointsDAttention"); },
    get short() { return tr("ui.libPapersPlanCategories.attention"); },
    get empty() { return tr("ui.libPapersPlanCategories.rienDeParticulier"); },
    get hint() { return tr("ui.libPapersPlanCategories.lesReglesAConnaitreAu"); },
  },
};

export function planCategory(task: Task): PlanCategory {
  const kind = paperKind(task);
  if (kind === "tip") return "attention";
  if (isPaperToDo(task)) return kind === "document" ? "documents" : "steps";
  return kind === "document" ? "pack" : "attention";
}

/** Tâche qui concerne ce voyageur (une tâche sans voyageur nommé vaut pour tout le groupe). */
export const concerns = (task: Task, who: string | null) =>
  !who || task.who.length === 0 || task.who.includes(who);

/** Une rubrique se coche (démarches, documents, pochette) ; les points d'attention se lisent. */
export const isCheckable = (category: PlanCategory) => category !== "attention";

/**
 * Une démarche identique pour tous les enfants : « Les 3 enfants » plutôt que trois prénoms.
 * Les adultes restent nommés.
 */
export function groupWho(who: string[], childNames: string[]): string[] {
  if (childNames.length < 2 || !childNames.every((name) => who.includes(name))) return who;
  const label = childNames.length === 2 ? tr("ui.libPapersPlanCategories.les2Enfants") : tr("ui.libPapersPlanCategories.lesEnfants", { length: childNames.length });
  return [...who.filter((name) => !childNames.includes(name)), label];
}
