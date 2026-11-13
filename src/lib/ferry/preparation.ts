import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { preparationFromTravelProfile } from "./travelProfile";

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
  { key: "vehicle", label: "Avec un véhicule" },
  { key: "kids", label: "Avec des enfants" },
  { key: "pet", label: "Avec un animal" },
  { key: "cabin", label: "En cabine" },
];
export const phases: { id: PrepPhase; title: string; when: string; startDays: number }[] = [
  { id: "papers", title: "Les papiers", when: "dès la réservation", startDays: Infinity },
  { id: "bags", title: "Budget et valises", when: "la semaine d’avant", startDays: 7 },
  { id: "eve", title: "48 h avant", when: "dans les 48 heures avant le départ", startDays: 2 },
  { id: "port", title: "Au port", when: "le jour du départ", startDays: 0 },
  { id: "arrival", title: "L’arrivée", when: "à bord et au débarquement", startDays: -1 },
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
    label: "Je vérifie mon billet",
    tip: "Noms, date, véhicule et cabine : tout doit correspondre aux passeports.",
  },
  {
    id: "identity",
    phase: "papers",
    label: "Je prépare les papiers de chacun",
    tip: "Visa, passeports, autorisation pour les enfants, livret de famille : la liste se fait en une minute.",
    href: "/papiers-voyage-algerie",
    linkLabel: "Faire ma liste de papiers",
    direction: "outbound",
  },
  {
    id: "vehicle",
    phase: "papers",
    label: "Je prends carte grise et assurance",
    tip: "Demandez à l’assureur une attestation qui couvre l’Algérie.",
    href: "/guide/voyage-algerie-voiture-checklist",
    linkLabel: "La checklist voiture",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "admission",
    phase: "papers",
    label: "Je fais mon TPD",
    tip: "En ligne sur ALCES avant le voyage, pour un véhicule immatriculé à l’étranger.",
    href: "https://alces.douane.gov.dz",
    linkLabel: "Portail ALCES",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "dimensions",
    phase: "papers",
    label: "Je mesure ma voiture chargée",
    tip: "Hauteur et longueur avec galerie : elles doivent correspondre au billet.",
    href: "/guide/voyage-algerie-voiture-checklist",
    linkLabel: "La checklist voiture",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "cash-dz",
    phase: "papers",
    label: "Je vérifie les règles sur les devises",
    tip: "Déclaration possible en ligne sur ALCES.",
    href: "https://www.douane.gov.dz/",
    linkLabel: "Douane algérienne",
    direction: "outbound",
  },
  {
    id: "cash-eu",
    phase: "papers",
    label: "Je déclare mes espèces dès 10 000 €",
    tip: "Obligatoire en quittant ou en rejoignant l’Union européenne.",
    href: "https://taxation-customs.ec.europa.eu/customs/prohibitions-restrictions/eu-cash-controls_en",
    linkLabel: "La règle européenne",
  },
  {
    id: "kids",
    phase: "papers",
    label: "Je prépare les papiers des enfants",
    tip: "Chaque enfant a ses propres documents.",
    href: "/guide/ferry-algerie-enfants-famille",
    linkLabel: "Lire le guide",
    only: "kids",
    direction: "outbound",
  },
  {
    id: "pet",
    phase: "papers",
    label: "Je prépare les papiers de l’animal",
    tip: "Certaines démarches prennent du temps : vérifiez tôt.",
    href: "/guide/ferry-algerie-animaux",
    linkLabel: "Lire le guide",
    only: "pet",
  },
  {
    id: "return-papers",
    phase: "papers",
    label: "Je garde passeports et billet à portée de main",
    direction: "return",
  },
  {
    id: "return-vehicle",
    phase: "papers",
    label: "Je retrouve mon TPD",
    tip: "Il se rend à la douane à la sortie.",
    href: "/guide/voiture-vacances-admission-temporaire",
    linkLabel: "Lire le guide",
    only: "vehicle",
    direction: "return",
  },
  {
    id: "dinars",
    phase: "bags",
    label: "Je compte mes dinars et devises",
    direction: "outbound",
    href: "/mes-dinars",
    linkLabel: "Ouvrir Mes dinars",
  },
  {
    id: "return-dinars",
    phase: "bags",
    label: "Je vérifie ce que je peux ressortir",
    tip: "En dinars comme en devises.",
    href: "https://www.douane.gov.dz/",
    linkLabel: "Douane algérienne",
    direction: "return",
  },
  {
    id: "return-gifts",
    phase: "bags",
    label: "Je vérifie ce que je peux rapporter",
    direction: "return",
  },
  {
    id: "car-service",
    phase: "bags",
    label: "Je fais vérifier ma voiture",
    tip: "Niveaux, freins, pneus et roue de secours.",
    only: "vehicle",
  },
  {
    id: "luggage",
    phase: "bags",
    label: "Je prépare mon sac de traversée",
    tip: "Médicaments, chargeurs, eau, change : le garage est fermé pendant la traversée.",
  },
  {
    id: "cabin",
    phase: "bags",
    label: "Je prépare mes affaires de nuit",
    href: "/guide/cabine-ou-fauteuil-ferry",
    linkLabel: "Lire le guide",
    only: "cabin",
  },
  {
    id: "checkin",
    phase: "eve",
    label: "Je m’enregistre",
  },
  {
    id: "call",
    phase: "eve",
    label: "Je note mon heure de convocation",
    tip: "Elle est sur le billet, avant l’heure de départ : c’est le vrai rendez-vous.",
  },
  {
    id: "offline",
    phase: "eve",
    label: "Je télécharge billet et documents",
    tip: "Le réseau manque souvent au port. Originaux dans une pochette.",
  },
  {
    id: "route",
    phase: "eve",
    label: "Je prépare ma route",
    tip: "La bonne entrée du port, et une marge pour les bouchons.",
    linkLabel: "Voir la route",
    only: "vehicle",
    itinerary: true,
  },
  {
    id: "boarding-pass",
    phase: "port",
    label: "Je récupère ma carte d’embarquement",
    tip: "Au guichet, avec pièce d’identité et billet.",
  },
  {
    id: "controls",
    phase: "port",
    label: "Je passe les contrôles",
    tip: "Tous les papiers dans une pochette, sac de traversée sorti du coffre.",
  },
  {
    id: "landing",
    phase: "arrival",
    label: "Je revois l’arrivée au port",
    tip: "La sortie prend du temps : prévenez par message plutôt qu’à heure fixe.",
    href: "/guide/arrivee-algerie-port-formalites",
    linkLabel: "Lire le guide",
    direction: "outbound",
  },
  {
    id: "tpd-keep",
    phase: "arrival",
    label: "Je garde mon TPD",
    tip: "Il se rend à la douane au retour.",
    only: "vehicle",
    direction: "outbound",
  },
  { id: "family", phase: "arrival", label: "Je préviens mes proches" },
  {
    id: "fuel-dz",
    phase: "arrival",
    label: "Je garde des dinars pour l’essence",
    tip: "Plein en sortant du port, en espèces : la carte n’est pas toujours acceptée.",
    href: "/mes-dinars",
    linkLabel: "Ouvrir Mes dinars",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "rest-stop",
    phase: "arrival",
    label: "Je prévois des pauses",
    tip: "Après une nuit en mer, arrêtez-vous toutes les 2 h.",
    only: "vehicle",
  },
];

/** Enregistrement : chaque compagnie a ses règles, et la carte n'est pas toujours délivrée à distance. */
const CHECKIN_ADVICE: { match: RegExp; tip: string; href: string; linkLabel: string }[] = [
  {
    match: /gnv/i,
    tip: "Pensez à vous enregistrer en ligne depuis votre espace GNV. Hors Sicile, Sardaigne et Baléares, la carte d’embarquement se retire ensuite au guichet.",
    href: "https://www.gnv.it/fr/avant-de-partir/conseils-de-voyage/check-in-online",
    linkLabel: "Enregistrement GNV",
  },
  {
    match: /bale/i,
    tip: "Pensez au check-in en ligne dans « Mes réservations ». Sur les lignes internationales, la carte d’embarquement se retire au guichet.",
    href: "https://www.balearia.com/fr/balearia-booking/mis-reservas",
    linkLabel: "Mes réservations",
  },
  {
    match: /corsica/i,
    tip: "L’heure limite figure sur votre document de voyage. Vos documents d’embarquement sont remis au comptoir.",
    href: "https://www.corsicalinea.com/informations/embarquement/",
    linkLabel: "Embarquement Corsica Linea",
  },
  {
    match: /alg[eé]rie ferries/i,
    tip: "L’enregistrement se fait au port : arrivez à l’heure indiquée sur votre billet, en vous présentant plus tôt avec un véhicule.",
    href: "https://algerieferries.com/embarquement",
    linkLabel: "Guide Algérie Ferries",
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
