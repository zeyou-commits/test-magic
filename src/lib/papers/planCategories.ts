import { isPaperToDo, paperKind, type Task } from "@/content/formalites";

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
    title: "Démarches à faire avant",
    short: "Démarches",
    empty: "Aucune démarche à faire",
    hint: "Rendez-vous, dossiers, inscriptions : à lancer avant d'acheter le billet.",
  },
  documents: {
    title: "Documents à préparer",
    short: "À préparer",
    empty: "Rien à faire établir",
    hint: "Des papiers à demander ou faire signer avant le départ.",
  },
  pack: {
    title: "À emporter le jour J",
    short: "À emporter",
    empty: "Juste vos pièces d'identité",
    hint: "Dans la pochette du voyage : présentés au port, à l'aller comme au retour.",
  },
  attention: {
    title: "Points d'attention",
    short: "Attention",
    empty: "Rien de particulier",
    hint: "Les règles à connaître au port, sur place et au retour.",
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
  const label = childNames.length === 2 ? "Les 2 enfants" : `Les ${childNames.length} enfants`;
  return [...who.filter((name) => !childNames.includes(name)), label];
}
