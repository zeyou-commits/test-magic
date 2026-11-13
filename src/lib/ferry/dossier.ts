import { papersProgress } from "@/content/formalites";
import { defaultPlan, loadPlan, savePlan } from "./companion";
import { prepItems } from "./preparation";

/**
 * Un seul dossier de voyage : ce qui est coché dans « Préparer mon voyage » l'est aussi dans
 * « Mon voyage », et inversement pour les démarches de la voiture.
 */

/** Les démarches voiture d'avant le départ : communes au compagnon et à « Mon voyage ». */
export const carPrepItems = prepItems.filter(
  (item) =>
    item.only === "vehicle" &&
    !item.itinerary &&
    item.direction !== "return" &&
    (item.phase === "papers" || item.phase === "bags"),
);
const carIds = new Set(carPrepItems.map((item) => item.id));

/** Les lignes de « Mon voyage » tenues par la liste « Mes papiers » (cochées quand elle est finie). */
export const PAPERS_ITEM_IDS = ["identity", "kids"] as const;

/** Ce que la préparation a déjà fait, à reprendre tel quel dans « Mon voyage ». */
export function preTripDone(): string[] {
  if (typeof window === "undefined") return [];
  const ids = new Set(loadPlan()?.carDone ?? []);
  const papers = papersProgress();
  if (papers && papers.total > 0 && papers.done === papers.total)
    for (const id of PAPERS_ITEM_IDS) ids.add(id);
  return [...ids];
}

/** Une démarche voiture cochée ou décochée dans « Mon voyage » : la préparation suit. */
export function setPreTripItem(id: string, done: boolean) {
  if (typeof window === "undefined" || !carIds.has(id)) return;
  const plan = loadPlan() ?? defaultPlan();
  const carDone = done
    ? [...new Set([...plan.carDone, id])]
    : plan.carDone.filter((item) => item !== id);
  savePlan({ ...plan, carDone });
}
