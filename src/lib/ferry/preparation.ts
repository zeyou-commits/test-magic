import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

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
    label: "Vérifier mon billet",
    tip: "Noms identiques aux passeports, date, véhicule et cabine : une erreur se corrige bien plus facilement avant le départ.",
  },
  {
    id: "identity",
    phase: "papers",
    label: "Vérifier passeports, titres et documents d’entrée",
    tip: "Contrôlez les dates de validité de chaque voyageur, et le visa s’il en faut un.",
    href: "/guide/arrivee-algerie-port-formalites",
    linkLabel: "Les formalités",
    direction: "outbound",
  },
  {
    id: "vehicle",
    phase: "papers",
    label: "Réunir la carte grise et l’assurance du véhicule",
    tip: "Demandez à votre assureur une confirmation écrite que l’Algérie est couverte.",
    href: "/guide/voyage-algerie-voiture-checklist",
    linkLabel: "La checklist voiture",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "admission",
    phase: "papers",
    label: "Faire mon TPD (titre de passage en douane)",
    tip: "Pour un véhicule immatriculé à l’étranger. La douane algérienne permet de le souscrire à distance sur son portail ALCES, avant le voyage.",
    href: "https://alces.douane.gov.dz",
    linkLabel: "Portail ALCES",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "dimensions",
    phase: "papers",
    label: "Mesurer mon véhicule chargé",
    tip: "Avec galerie et coffre de toit : la hauteur et la longueur doivent correspondre à votre billet.",
    href: "/guide/voyage-algerie-voiture-checklist",
    linkLabel: "La checklist voiture",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "cash-dz",
    phase: "papers",
    label: "Vérifier les règles sur les devises et les dinars",
    tip: "La douane algérienne annonce aussi une déclaration des devises en ligne sur ALCES.",
    href: "https://www.douane.gov.dz/",
    linkLabel: "Douane algérienne",
    direction: "outbound",
  },
  {
    id: "cash-eu",
    phase: "papers",
    label: "Déclarer mes espèces si j’ai 10 000 € ou plus",
    tip: "Obligatoire en quittant ou en rejoignant l’Union européenne.",
    href: "https://taxation-customs.ec.europa.eu/customs/prohibitions-restrictions/eu-cash-controls_en",
    linkLabel: "La règle européenne",
  },
  {
    id: "kids",
    phase: "papers",
    label: "Réunir les papiers des enfants",
    tip: "Chaque enfant a besoin de ses propres documents, à vérifier selon sa situation.",
    href: "/guide/ferry-algerie-enfants-famille",
    linkLabel: "Lire le guide",
    only: "kids",
    direction: "outbound",
  },
  {
    id: "pet",
    phase: "papers",
    label: "Réunir les documents de l’animal",
    tip: "Les règles dépendent du pays et de la compagnie : vérifiez-les tôt, certaines démarches prennent du temps.",
    href: "/guide/ferry-algerie-animaux",
    linkLabel: "Lire le guide",
    only: "pet",
  },
  {
    id: "return-papers",
    phase: "papers",
    label: "Mettre passeports et billet retour à portée de main",
    direction: "return",
  },
  {
    id: "return-vehicle",
    phase: "papers",
    label: "Retrouver mon TPD",
    tip: "Il doit être restitué à la douane à la sortie du territoire.",
    href: "/guide/voiture-vacances-admission-temporaire",
    linkLabel: "Lire le guide",
    only: "vehicle",
    direction: "return",
  },
  {
    id: "dinars",
    phase: "bags",
    label: "Compter mes dinars et mes devises",
    direction: "outbound",
    href: "/mes-dinars",
    linkLabel: "Ouvrir Mes dinars",
  },
  {
    id: "return-dinars",
    phase: "bags",
    label: "Vérifier ce que je peux ressortir d’Algérie",
    tip: "En dinars comme en devises.",
    href: "https://www.douane.gov.dz/",
    linkLabel: "Douane algérienne",
    direction: "return",
  },
  {
    id: "return-gifts",
    phase: "bags",
    label: "Vérifier ce que je peux rapporter en Europe",
    direction: "return",
  },
  {
    id: "luggage",
    phase: "bags",
    label: "Préparer un sac de traversée à garder avec moi",
    tip: "Médicaments, chargeurs, eau, change et affaires des enfants : ne comptez pas accéder au garage pendant la traversée.",
  },
  {
    id: "cabin",
    phase: "bags",
    label: "Prévoir mes affaires pour la nuit en cabine",
    href: "/guide/cabine-ou-fauteuil-ferry",
    linkLabel: "Lire le guide",
    only: "cabin",
  },
  {
    id: "checkin",
    phase: "eve",
    label: "M’enregistrer et savoir où récupérer ma carte d’embarquement",
  },
  {
    id: "call",
    phase: "eve",
    label: "Relever mon heure de convocation",
    tip: "Elle figure sur votre document de voyage et passe avant l’heure de départ : c’est votre vrai rendez-vous.",
  },
  {
    id: "offline",
    phase: "eve",
    label: "Garder billet et documents hors connexion",
    tip: "Le réseau peut manquer au port : téléchargez-les, et gardez les originaux dans une pochette.",
  },
  {
    id: "route",
    phase: "eve",
    label: "Préparer la route jusqu’au port",
    tip: "Repérez la bonne entrée du port, et gardez une marge pour les bouchons.",
    linkLabel: "Voir la route",
    only: "vehicle",
    itinerary: true,
  },
  {
    id: "boarding-pass",
    phase: "port",
    label: "Récupérer ma carte d’embarquement",
    tip: "Au guichet si vous ne l’avez pas déjà : présentez pièce d’identité et billet.",
  },
  {
    id: "controls",
    phase: "port",
    label: "Passer les contrôles, pochette en main",
    tip: "Papiers des passagers et du véhicule ensemble, sac de traversée sorti du coffre.",
  },
  {
    id: "landing",
    phase: "arrival",
    label: "Revoir le déroulé de l’arrivée au port",
    tip: "La sortie du port prend du temps : convenez d’un message plutôt que d’une heure précise avec ceux qui vous attendent.",
    href: "/guide/arrivee-algerie-port-formalites",
    linkLabel: "Lire le guide",
    direction: "outbound",
  },
  {
    id: "tpd-keep",
    phase: "arrival",
    label: "Garder mon TPD pour le retour",
    tip: "Il doit être restitué à la douane à la sortie du territoire.",
    only: "vehicle",
    direction: "outbound",
  },
  { id: "family", phase: "arrival", label: "Prévenir mes proches de mon arrivée" },
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
      if (error || !data) return { profile: defaultProfile, done: local };
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
