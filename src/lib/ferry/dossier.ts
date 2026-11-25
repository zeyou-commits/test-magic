import { formaliteSources, papersProgress } from "@/content/formalites";
import { defaultPlan, loadPlan, savePlan } from "./companion";
import { prepItems, type PrepItem } from "./preparation";
import { tr } from "@/lib/i18n/translate";

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
/**
 * Voiture importée (moins de 3 ans) : pas de TPD, qui ne vaut que pour l'admission temporaire.
 * À la place, l'export depuis l'Europe (DAE et MRN) et l'import en Algérie. Sources : douane
 * française (fiche véhicule, rappel LRN/CRN/MRN), centre d'aide Baleària, décret 23-74.
 */
export const importCarItems: PrepItem[] = [
  {
    id: "import-regime",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.impRegimeLabel"); },
    get tip() { return tr("ui.libFerryPreparation.impRegimeTip"); },
    href: "/guide/importer-voiture-moins-3-ans-algerie",
    get linkLabel() { return tr("ui.libFerryPreparation.impRegimeLink"); },
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "import-dae",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.impDaeLabel"); },
    get tip() { return tr("ui.libFerryPreparation.impDaeTip"); },
    get href() { return formaliteSources["douane-export-vehicule"].url; },
    get linkLabel() { return tr("ui.libFerryPreparation.impDaeLink"); },
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "import-send",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.impSendLabel"); },
    get tip() { return tr("ui.libFerryPreparation.impSendTip"); },
    get href() { return formaliteSources["balearia-export"].url; },
    get linkLabel() { return tr("ui.libFerryPreparation.impSendLink"); },
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "import-dossier",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.impDossierLabel"); },
    get tip() { return tr("ui.libFerryPreparation.impDossierTip"); },
    href: "/guide/documents-importation-voiture-algerie",
    get linkLabel() { return tr("ui.libFerryPreparation.impDossierLink"); },
    only: "vehicle",
    direction: "outbound",
  },
];

/** Les démarches de la voiture selon qu'elle revient (vacances) ou reste en Algérie (import). */
export function carItemsFor(importCar: boolean): PrepItem[] {
  if (!importCar) return carPrepItems;
  return [...importCarItems, ...carPrepItems.filter((item) => item.id !== "admission")];
}

const carIds = new Set([...carPrepItems, ...importCarItems].map((item) => item.id));

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
