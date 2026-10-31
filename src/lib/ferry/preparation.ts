import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Table du script du 22/11/2026, absente des types générés.
const db = typedSupabase as unknown as SupabaseClient;

export type TripProfile = { vehicle: boolean; kids: boolean; pet: boolean; cabin: boolean };
export type Preparation = { profile: TripProfile; done: string[] };
export type PrepPhase = "papers" | "bags" | "eve" | "arrival";
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
  { id: "papers", title: "Les papiers", when: "dès maintenant", startDays: Infinity },
  { id: "bags", title: "Budget et valises", when: "la semaine d’avant", startDays: 7 },
  { id: "eve", title: "La veille", when: "la veille du départ", startDays: 1 },
  { id: "arrival", title: "L’arrivée", when: "avant de débarquer", startDays: -1 },
];

export type PrepItem = {
  id: string;
  phase: PrepPhase;
  label: string;
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
  { id: "tickets", phase: "papers", label: "Billets et confirmation de réservation" },
  {
    id: "identity",
    phase: "papers",
    label: "Passeports, titres et documents d’entrée",
    href: "/guide/arrivee-algerie-port-formalites",
    linkLabel: "Les formalités",
    direction: "outbound",
  },
  {
    id: "vehicle",
    phase: "papers",
    label: "Carte grise, assurance et documents du véhicule",
    href: "/guide/voyage-algerie-voiture-checklist",
    linkLabel: "La checklist voiture",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "admission",
    phase: "papers",
    label: "Comprendre l’admission temporaire du véhicule",
    href: "/guide/voiture-vacances-admission-temporaire",
    linkLabel: "Lire le guide",
    only: "vehicle",
    direction: "outbound",
  },
  {
    id: "cash-dz",
    phase: "papers",
    label: "Vérifier les règles de la douane algérienne sur les devises et les dinars",
    href: "https://www.douane.gov.dz/",
    linkLabel: "Douane algérienne",
    direction: "outbound",
  },
  {
    id: "cash-eu",
    phase: "papers",
    label: "Déclarer mes espèces si j’ai 10 000 € ou plus en quittant ou en rejoignant l’Union européenne",
    href: "https://taxation-customs.ec.europa.eu/customs/prohibitions-restrictions/eu-cash-controls_en",
    linkLabel: "La règle européenne",
  },
  {
    id: "kids",
    phase: "papers",
    label: "Papiers et organisation pour les enfants",
    href: "/guide/ferry-algerie-enfants-famille",
    linkLabel: "Lire le guide",
    only: "kids",
    direction: "outbound",
  },
  {
    id: "pet",
    phase: "papers",
    label: "Règles et documents de l’animal",
    href: "/guide/ferry-algerie-animaux",
    linkLabel: "Lire le guide",
    only: "pet",
  },
  {
    id: "return-papers",
    phase: "papers",
    label: "Passeports et billet retour à portée de main",
    direction: "return",
  },
  {
    id: "return-vehicle",
    phase: "papers",
    label: "Retrouver les papiers remis à l’entrée pour le véhicule",
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
    label: "Vérifier ce que je peux ressortir d’Algérie en dinars et en devises",
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
  { id: "luggage", phase: "bags", label: "Bagages, médicaments et essentiels à bord" },
  {
    id: "cabin",
    phase: "bags",
    label: "Préparer un petit sac pour la nuit en cabine",
    href: "/guide/cabine-ou-fauteuil-ferry",
    linkLabel: "Lire le guide",
    only: "cabin",
  },
  { id: "call", phase: "eve", label: "Vérifier l’heure de convocation sur mon billet" },
  {
    id: "route",
    phase: "eve",
    label: "Préparer la route jusqu’au port",
    linkLabel: "Voir la route",
    only: "vehicle",
    itinerary: true,
  },
  {
    id: "landing",
    phase: "arrival",
    label: "Revoir le déroulé de l’arrivée au port",
    href: "/guide/arrivee-algerie-port-formalites",
    linkLabel: "Lire le guide",
    direction: "outbound",
  },
  { id: "family", phase: "arrival", label: "Prévenir mes proches de mon arrivée" },
];

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
