import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { preparationFromTravelProfile } from "./travelProfile";
import { tr } from "@/lib/i18n/translate";

// Table du script du 22/11/2026, absente des types générés.
const db = typedSupabase as unknown as SupabaseClient;

export type TripProfile = { vehicle: boolean; kids: boolean; pet: boolean; cabin: boolean };
export type Preparation = { profile: TripProfile; done: string[] };
export type PrepPhase = "papers" | "bags" | "eve" | "port" | "arrival";
/** Départ d'Algérie : c'est un retour, ce qui a été vérifié à l'aller ne se redemande pas. */
export type TripDirection = "outbound" | "return";
export const tripDirection = (from: { country_code?: string | null } | null | undefined): TripDirection =>
  from?.country_code === "DZ" ? "return" : "outbound";

export const defaultProfile: TripProfile = { vehicle: true, kids: false, pet: false, cabin: false };
export const profileLabels: { key: keyof TripProfile; label: string }[] = [
  { key: "vehicle", get label() { return tr("ui.libFerryPreparation.avecUnVehicule"); } },
  { key: "kids", get label() { return tr("ui.libFerryPreparation.avecDesEnfants"); } },
  { key: "pet", get label() { return tr("ui.libFerryPreparation.avecUnAnimal"); } },
  { key: "cabin", get label() { return tr("ui.libFerryPreparation.enCabine"); } },
];
export const phases: { id: PrepPhase; title: string; when: string; startDays: number }[] = [
  { id: "papers", get title() { return tr("ui.libFerryPreparation.lesPapiers"); }, get when() { return tr("ui.libFerryPreparation.desLaReservation"); }, startDays: Infinity },
  { id: "bags", get title() { return tr("ui.libFerryPreparation.budgetEtValises"); }, get when() { return tr("ui.libFerryPreparation.laSemaineDAvant"); }, startDays: 7 },
  { id: "eve", get title() { return tr("ui.libFerryPreparation.t48HAvant"); }, get when() { return tr("ui.libFerryPreparation.dansLes48HeuresAvant"); }, startDays: 2 },
  { id: "port", get title() { return tr("ui.libFerryPreparation.auPort"); }, get when() { return tr("ui.libFerryPreparation.leJourDuDepart"); }, startDays: 0 },
  { id: "arrival", get title() { return tr("ui.libFerryPreparation.lArrivee"); }, get when() { return tr("ui.libFerryPreparation.aBordEtAuDebarquement"); }, startDays: -1 },
];

export type PrepItem = {
  id: string;
  phase: PrepPhase;
  label: string;
  /** Le conseil pratique, tiré de la réalité du voyage. */
  tip?: string;
  /** Article du guide, ou page de l'application. */
  href?: string;
  linkLabel?: string;
  only?: keyof TripProfile;
  /** Sans précision : aller et retour. */
  direction?: TripDirection;
  /** Ouvre l'itinéraire de la carte. */
  itinerary?: boolean;
};

export const prepItems: PrepItem[] = [
  {
    id: "tickets",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jeVerifieMonBillet"); },
    get tip() { return tr("ui.libFerryPreparation.nomsDateVehiculeEtCabine"); },
  },
  {
    id: "identity",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jePrepareLesPapiersDe"); },
    get tip() { return tr("ui.libFerryPreparation.visaPasseportsAutorisationPourLes"); },
    href: "/papiers-voyage-algerie",
    get linkLabel() { return tr("ui.libFerryPreparation.faireMaListeDePapiers"); },
    direction: "outbound",
  },
  {
    id: "vehicle",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jePrendsCarteGriseEt"); },
    get tip() { return tr("ui.libFerryPreparation.demandezALAssureurUne"); },
    href: "/guide/voyage-algerie-voiture-checklist",
    get linkLabel() { return tr("ui.libFerryPreparation.laChecklistVoiture"); },
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "admission",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jeFaisMonTpd"); },
    // Première fois qu'on croise le sigle : on dit ce que c'est.
    get tip() { return tr("ui.libFerryPreparation.leTitreDePassageEn"); },
    href: "https://alces.douane.gov.dz",
    get linkLabel() { return tr("ui.libFerryPreparation.portailAlces"); },
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "dimensions",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jeMesureMaVoitureChargee"); },
    get tip() { return tr("ui.libFerryPreparation.hauteurEtLongueurAvecGalerie"); },
    href: "/guide/voyage-algerie-voiture-checklist",
    get linkLabel() { return tr("ui.libFerryPreparation.laChecklistVoiture"); },
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "cash-dz",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jeVerifieLesReglesSur"); },
    get tip() { return tr("ui.libFerryPreparation.declarationPossibleEnLigneSur"); },
    href: "https://www.douane.gov.dz/",
    get linkLabel() { return tr("ui.libFerryPreparation.douaneAlgerienne"); },
    direction: "outbound",
  },
  {
    id: "cash-eu",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jeDeclareMesEspecesDes"); },
    get tip() { return tr("ui.libFerryPreparation.obligatoireEnQuittantOuEn"); },
    href: "https://taxation-customs.ec.europa.eu/customs/prohibitions-restrictions/eu-cash-controls_en",
    get linkLabel() { return tr("ui.libFerryPreparation.laRegleEuropeenne"); },
  },
  {
    id: "kids",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jePrepareLesPapiersDes"); },
    get tip() { return tr("ui.libFerryPreparation.chaqueEnfantASesPropres"); },
    href: "/guide/ferry-algerie-enfants-famille",
    get linkLabel() { return tr("ui.libFerryPreparation.lireLeGuide"); },
    only: "kids",
    direction: "outbound",
  },
  {
    id: "pet",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jePrepareLesPapiersDe2"); },
    get tip() { return tr("ui.libFerryPreparation.certainesDemarchesPrennentDuTemps"); },
    href: "/guide/ferry-algerie-animaux",
    get linkLabel() { return tr("ui.libFerryPreparation.lireLeGuide"); },
    only: "pet",
  },
  {
    id: "return-papers",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jeGardePasseportsEtBillet"); },
    direction: "return",
  },
  {
    id: "return-vehicle",
    phase: "papers",
    get label() { return tr("ui.libFerryPreparation.jeRetrouveMonTpd"); },
    get tip() { return tr("ui.libFerryPreparation.ilSeRendALa"); },
    href: "/guide/voiture-vacances-admission-temporaire",
    get linkLabel() { return tr("ui.libFerryPreparation.lireLeGuide"); },
    only: "vehicle",
    direction: "return",
  },
  {
    id: "dinars",
    phase: "bags",
    get label() { return tr("ui.libFerryPreparation.jeCompteMesDinarsEt"); },
    direction: "outbound",
    href: "/mes-dinars",
    get linkLabel() { return tr("ui.libFerryPreparation.ouvrirMesDinars"); },
  },
  {
    id: "return-dinars",
    phase: "bags",
    get label() { return tr("ui.libFerryPreparation.jeVerifieCeQueJe"); },
    get tip() { return tr("ui.libFerryPreparation.enDinarsCommeEnDevises"); },
    href: "https://www.douane.gov.dz/",
    get linkLabel() { return tr("ui.libFerryPreparation.douaneAlgerienne"); },
    direction: "return",
  },
  {
    id: "return-gifts",
    phase: "bags",
    get label() { return tr("ui.libFerryPreparation.jeVerifieCeQueJe2"); },
    direction: "return",
  },
  {
    id: "car-service",
    phase: "bags",
    get label() { return tr("ui.libFerryPreparation.jeFaisVerifierMaVoiture"); },
    get tip() { return tr("ui.libFerryPreparation.niveauxFreinsPneusEtRoue"); },
    only: "vehicle",
  },
  {
    id: "luggage",
    phase: "bags",
    get label() { return tr("ui.libFerryPreparation.jePrepareMonSacDe"); },
    get tip() { return tr("ui.libFerryPreparation.medicamentsChargeursEauChangeLe"); },
  },
  {
    id: "cabin",
    phase: "bags",
    get label() { return tr("ui.libFerryPreparation.jePrepareMesAffairesDe"); },
    href: "/guide/cabine-ou-fauteuil-ferry",
    get linkLabel() { return tr("ui.libFerryPreparation.lireLeGuide"); },
    only: "cabin",
  },
  {
    id: "checkin",
    phase: "eve",
    get label() { return tr("ui.libFerryPreparation.jeMEnregistre"); },
  },
  {
    id: "call",
    phase: "eve",
    get label() { return tr("ui.libFerryPreparation.jeNoteMonHeureDe"); },
    get tip() { return tr("ui.libFerryPreparation.elleEstSurLeBillet"); },
  },
  {
    id: "offline",
    phase: "eve",
    get label() { return tr("ui.libFerryPreparation.jeTelechargeBilletEtDocuments"); },
    get tip() { return tr("ui.libFerryPreparation.leReseauManqueSouventAu"); },
  },
  {
    id: "route",
    phase: "eve",
    get label() { return tr("ui.libFerryPreparation.jePrepareMaRoute"); },
    get tip() { return tr("ui.libFerryPreparation.laBonneEntreeDuPort"); },
    get linkLabel() { return tr("ui.libFerryPreparation.voirLaRoute"); },
    only: "vehicle",
    itinerary: true,
  },
  {
    id: "boarding-pass",
    phase: "port",
    get label() { return tr("ui.libFerryPreparation.jeRecupereMaCarteD"); },
    get tip() { return tr("ui.libFerryPreparation.auGuichetAvecPieceD"); },
  },
  {
    id: "controls",
    phase: "port",
    get label() { return tr("ui.libFerryPreparation.jePasseLesControles"); },
    get tip() { return tr("ui.libFerryPreparation.tousLesPapiersDansUne"); },
  },
  {
    id: "landing",
    phase: "arrival",
    get label() { return tr("ui.libFerryPreparation.jeRevoisLArriveeAu"); },
    get tip() { return tr("ui.libFerryPreparation.laSortiePrendDuTemps"); },
    href: "/guide/arrivee-algerie-port-formalites",
    get linkLabel() { return tr("ui.libFerryPreparation.lireLeGuide"); },
    direction: "outbound",
  },
  {
    id: "tpd-keep",
    phase: "arrival",
    get label() { return tr("ui.libFerryPreparation.jeGardeMonTpd"); },
    get tip() { return tr("ui.libFerryPreparation.ilSeRendALa2"); },
    only: "vehicle",
    direction: "outbound",
  },
  { id: "family", phase: "arrival", get label() { return tr("ui.libFerryPreparation.jePreviensMesProches"); } },
  {
    id: "fuel-dz",
    phase: "arrival",
    get label() { return tr("ui.libFerryPreparation.jeGardeDesDinarsPour"); },
    get tip() { return tr("ui.libFerryPreparation.pleinEnSortantDuPort"); },
    href: "/mes-dinars",
    get linkLabel() { return tr("ui.libFerryPreparation.ouvrirMesDinars"); },
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "rest-stop",
    phase: "arrival",
    get label() { return tr("ui.libFerryPreparation.jePrevoisDesPauses"); },
    get tip() { return tr("ui.libFerryPreparation.apresUneNuitEnMer"); },
    only: "vehicle",
  },
];

/** Enregistrement : chaque compagnie a ses règles, et la carte n'est pas toujours délivrée à distance. */
const CHECKIN_ADVICE: { match: RegExp; tip: string; href: string; linkLabel: string }[] = [
  {
    match: /gnv/i,
    get tip() { return tr("ui.libFerryPreparation.pensezAVousEnregistrerEn"); },
    href: "https://www.gnv.it/fr/avant-de-partir/conseils-de-voyage/check-in-online",
    get linkLabel() { return tr("ui.libFerryPreparation.enregistrementGnv"); },
  },
  {
    match: /bale/i,
    get tip() { return tr("ui.libFerryPreparation.pensezAuCheckInEn"); },
    href: "https://www.balearia.com/fr/balearia-booking/mis-reservas",
    get linkLabel() { return tr("ui.libFerryPreparation.mesReservations"); },
  },
  {
    match: /corsica/i,
    get tip() { return tr("ui.libFerryPreparation.lHeureLimiteFigureSur"); },
    href: "https://www.corsicalinea.com/informations/embarquement/",
    get linkLabel() { return tr("ui.libFerryPreparation.embarquementCorsicaLinea"); },
  },
  {
    match: /alg[eé]rie ferries/i,
    get tip() { return tr("ui.libFerryPreparation.lEnregistrementSeFaitAu"); },
    href: "https://algerieferries.com/embarquement",
    get linkLabel() { return tr("ui.libFerryPreparation.guideAlgerieFerries"); },
  },
];
const CHECKIN_DEFAULT =
  "Regardez sur votre confirmation si la compagnie propose un enregistrement en ligne et où retirer la carte d’embarquement.";

/** La ligne telle qu'elle s'affiche pour la compagnie de ce voyage. */
export function itemForCompany(item: PrepItem, company?: string | null): PrepItem {
  if (item.id !== "checkin") return item;
  const advice = company ? CHECKIN_ADVICE.find((entry) => entry.match.test(company)) : undefined;
  return advice
    ? { ...item, tip: advice.tip, href: advice.href, linkLabel: advice.linkLabel }
    : { ...item, tip: CHECKIN_DEFAULT };
}

/** Les lignes qui concernent ce voyage. */
export const itemsFor = (profile: TripProfile, direction: TripDirection = "outbound") =>
  prepItems.filter(
    (item) =>
      (!item.only || profile[item.only]) && (!item.direction || item.direction === direction),
  );

export function prepProgress(preparation: Preparation, direction: TripDirection = "outbound") {
  const items = itemsFor(preparation.profile, direction);
  const done = items.filter((item) => preparation.done.includes(item.id)).length;
  return { done, total: items.length, next: items.find((item) => !preparation.done.includes(item.id)) ?? null };
}

/** La phase à ouvrir : la plus avancée que le calendrier permet d'atteindre. */
export function currentPhase(daysLeft: number): PrepPhase {
  return [...phases].reverse().find((phase) => daysLeft <= phase.startDays)?.id ?? "papers";
}

/** Un seul voyage, une seule liste, sur tous les appareils du compte. */
const localKey = (departureId: string) => `bw-checklist:${departureId}`;
function readLocal(departureId: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(localKey(departureId)) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Depuis l'encart Ma traversée : la fiche s'ouvre directement sur le parcours. */
const FOCUS_KEY = "bledway:prep-focus";
export const PREP_FOCUS_EVENT = "bledway:prep-focus";
export function requestPrepFocus(departureId: string) {
  window.sessionStorage.setItem(FOCUS_KEY, departureId);
  window.dispatchEvent(new Event(PREP_FOCUS_EVENT));
}
export function takePrepFocus(departureId: string) {
  if (window.sessionStorage.getItem(FOCUS_KEY) !== departureId) return false;
  window.sessionStorage.removeItem(FOCUS_KEY);
  return true;
}

export const preparationKey = ["trip-preparation"] as const;
export const preparationQuery = (departureId: string | undefined, userId: string | undefined) =>
  queryOptions({
    queryKey: [...preparationKey, departureId, userId],
    enabled: Boolean(departureId && userId),
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<Preparation> => {
      const local = readLocal(departureId!);
      const { data, error } = await db
        .from("bw_trip_preparation")
        .select("profile,done")
        .eq("departure_id", departureId!)
        .eq("user_id", userId!)
        .maybeSingle();
      // Cases déjà cochées sur cet appareil avec l'ancienne checklist : conservées.
      // Pas encore de préparation : elle part du profil saisi dans la recherche (à pied, enfants…).
      if (error || !data)
        return { profile: { ...defaultProfile, ...preparationFromTravelProfile() }, done: local };
      return {
        profile: { ...defaultProfile, ...(data.profile as Partial<TripProfile>) },
        done: [...new Set([...(data.done as string[]), ...local])],
      };
    },
  });

export async function savePreparation(departureId: string, userId: string, value: Preparation) {
  try {
    localStorage.setItem(localKey(departureId), JSON.stringify(value.done));
  } catch {
    /* stockage facultatif */
  }
  const { error } = await db.from("bw_trip_preparation").upsert({
    user_id: userId,
    departure_id: departureId,
    profile: value.profile,
    done: value.done,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Votre préparation n’a pas pu être enregistrée.");
}
