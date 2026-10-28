import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Fonctions de la communauté pas encore présentes dans les types générés.
const db = typedSupabase as unknown as SupabaseClient;

/** Les 12 cabas personnages (banque BledWay). */
export const personas = [
  { id: "jeddi", name: "Jeddi" },
  { id: "jedda", name: "Jedda" },
  { id: "papa", name: "Papa" },
  { id: "maman", name: "Maman" },
  { id: "lina", name: "Lina" },
  { id: "ilyes", name: "Ilyes" },
  { id: "ammi", name: "Ammi" },
  { id: "amastan", name: "Amastan" },
  { id: "tata_houria", name: "Tata Houria" },
  { id: "ammi_tayeb", name: "Ammi Tayeb" },
  { id: "maalem", name: "Mâalem" },
  { id: "lalla", name: "Lalla" },
] as const;
export type PersonaId = (typeof personas)[number]["id"];
export const personaImage = (id: string) => `/cabas/persos/${id}.webp`;

export const avatarColors = {
  menthe: "#d9f2e6",
  ciel: "#dcecfb",
  peche: "#ffe3d3",
  lilas: "#ebe2fb",
  citron: "#fff3c4",
  rose: "#fbe0ea",
} as const;
export type AvatarColor = keyof typeof avatarColors;

export const reactions = [
  { code: "merci", label: "Merci" },
  { code: "courage", label: "Courage" },
  { code: "bon_voyage", label: "Bon voyage" },
  { code: "bien_vu", label: "Bien vu" },
] as const;
export type ReactionCode = (typeof reactions)[number]["code"];
export const reactionImage = (code: string) => `/cabas/reactions/${code}.webp`;

export type Mood = { code: string; label: string; emoji: string; image: string };
/** Ce que tout le monde peut voir d'un voyageur : rien qui permette de l'identifier. */
export type TravellerCard = {
  handle: string;
  pseudo: string;
  avatar: PersonaId;
  color: AvatarColor;
  mood: Mood | null;
};
export type MyTraveller = TravellerCard & { show_on_trip: boolean; mood_until: string | null };
export type TripTraveller = TravellerCard & { step: string | null; me: boolean };
export type PublicProfile = TravellerCard & {
  since: number | null;
  contributions: number;
  confirmed: number;
  confirmations: number;
  reviews: number;
  trips: number;
  favorite_vessel: string | null;
  favorite_port: string | null;
  badges: { code: string; label: string }[];
  me: boolean;
};
export type MoodRow = Mood & { moments: string[]; sort: number; active: boolean };
export type ReactionCounts = Record<
  string,
  Partial<Record<ReactionCode, { n: number; mine: boolean }>>
>;

/** Script SQL du 05/11/2026 pas encore exécuté : la communauté reste masquée, sans erreur. */
const missing = (code?: string) => ["PGRST202", "PGRST205", "42883", "42P01"].includes(code ?? "");
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    if (missing(error.code)) return null;
    throw new Error(error.message);
  }
  return data as T;
}

export const communityKey = ["bw-travellers"] as const;
export const myTravellerQuery = (userId?: string) =>
  queryOptions({
    queryKey: [...communityKey, "me", userId],
    enabled: Boolean(userId),
    queryFn: () => rpc<MyTraveller>("bw_my_traveller"),
    staleTime: 60_000,
    retry: false,
  });
export const moodsQuery = queryOptions({
  queryKey: [...communityKey, "moods"],
  queryFn: async (): Promise<MoodRow[] | null> => {
    const { data, error } = await db.from("bw_moods").select("*").order("sort");
    if (error) {
      if (missing(error.code)) return null;
      throw new Error(error.message);
    }
    return data as MoodRow[];
  },
  staleTime: 10 * 60_000,
});
export const tripTravellersQuery = (departureId: string, viewer?: string) =>
  queryOptions({
    queryKey: [...communityKey, "trip", departureId, viewer ?? "public"],
    queryFn: () =>
      rpc<{ total: number; travellers: TripTraveller[] }>("bw_trip_travellers", {
        p_departure: departureId,
      }),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    retry: false,
  });
export const publicProfileQuery = (handle: string | null) =>
  queryOptions({
    queryKey: [...communityKey, "profile", handle],
    enabled: Boolean(handle),
    queryFn: () => rpc<PublicProfile | null>("bw_public_profile", { p_handle: handle }),
    staleTime: 60_000,
    retry: false,
  });
export type ContributionKind = "alert" | "port_review" | "vessel_review";
export const authorsQuery = (kind: ContributionKind, ids: string[]) =>
  queryOptions({
    queryKey: [...communityKey, "authors", kind, [...ids].sort().join(",")],
    enabled: ids.length > 0,
    queryFn: () =>
      rpc<Record<string, TravellerCard>>("bw_contribution_authors", {
        p_kind: kind,
        p_ids: ids.slice(0, 200),
      }),
    staleTime: 60_000,
    retry: false,
  });
export const reactionsQuery = (kind: ContributionKind, ids: string[], viewer?: string) =>
  queryOptions({
    queryKey: [...communityKey, "reactions", kind, [...ids].sort().join(","), viewer ?? "public"],
    enabled: ids.length > 0,
    queryFn: () =>
      rpc<ReactionCounts>("bw_reaction_counts", { p_kind: kind, p_ids: ids.slice(0, 200) }),
    staleTime: 30_000,
    retry: false,
  });

export const saveTraveller = (input: {
  pseudo: string;
  avatar: PersonaId;
  color: AvatarColor;
  showOnTrip: boolean;
}) =>
  rpc<MyTraveller>("bw_save_traveller", {
    p_pseudo: input.pseudo,
    p_avatar: input.avatar,
    p_color: input.color,
    p_show_on_trip: input.showOnTrip,
  });
export const setMood = (code: string | null) => rpc<MyTraveller>("bw_set_mood", { p_code: code });
export const react = (kind: ContributionKind, id: string, code: ReactionCode) =>
  rpc<boolean>("bw_react", { p_kind: kind, p_target: id, p_code: code });

/** Pseudo : 3 à 24 caractères, lettres, chiffres, espaces, point, tiret, apostrophe. */
export function pseudoError(value: string) {
  const pseudo = value.trim().replace(/\s+/g, " ");
  if (pseudo.length < 3) return "3 caractères minimum.";
  if (pseudo.length > 24) return "24 caractères maximum.";
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(pseudo))
    return "Lettres, chiffres, espaces, . _ ' - uniquement.";
  if (/@|https?:|www\./i.test(pseudo)) return "Pas d’adresse ni de lien dans le pseudo.";
  return null;
}

/** Humeurs suggérées en premier selon le moment du voyage. */
export function moodsFor(moods: MoodRow[], moment: string | null) {
  const active = moods.filter((mood) => mood.active);
  if (!moment) return active;
  const score = (mood: MoodRow) =>
    mood.moments.includes(moment) ? 0 : mood.moments.includes("toujours") ? 1 : 2;
  return [...active].sort((a, b) => score(a) - score(b) || a.sort - b.sort);
}

/** Ouvrir le profil public d'un voyageur depuis n'importe quel écran. */
export const OPEN_PROFILE_EVENT = "bledway:open-profile";
export function openTravellerProfile(handle: string) {
  window.dispatchEvent(new CustomEvent(OPEN_PROFILE_EVENT, { detail: { handle } }));
}
