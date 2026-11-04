import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { personas, rememberAvatarImages } from "./travellers";

// Table du script « avatars_admin », pas encore dans les types générés.
const db = typedSupabase as unknown as SupabaseClient;

export type AvatarKind = "persona" | "mood" | "other";
export type AvatarRow = {
  id: string;
  label: string;
  kind: AvatarKind;
  /** Image du site (/cabas/…) ou image envoyée par l'équipe. */
  image: string;
  storage_path: string | null;
  sort: number;
  active: boolean;
};

export const avatarKinds: Record<AvatarKind, string> = {
  persona: "Personnages",
  mood: "Humeurs",
  other: "Ajoutés par l'équipe",
};

/** Sans le script : les 15 personnages d'avant, comme aujourd'hui. */
const fallback: AvatarRow[] = personas.map((persona, index) => ({
  id: persona.id,
  label: persona.name,
  kind: "persona",
  image: `/cabas/persos/${persona.id}.webp`,
  storage_path: null,
  sort: (index + 1) * 10,
  active: true,
}));

export const avatarsKey = ["avatars"] as const;

/** Tous les avatars (retirés compris, pour afficher ceux déjà choisis) ; le choix filtre `active`. */
export const avatarsQuery = queryOptions({
  queryKey: avatarsKey,
  staleTime: 10 * 60_000,
  retry: false,
  queryFn: async (): Promise<{ rows: AvatarRow[]; managed: boolean }> => {
    const { data, error } = await db
      .from("bw_avatars")
      .select("id,label,kind,image,storage_path,sort,active")
      .order("sort")
      .order("label");
    const result = error
      ? { rows: fallback, managed: false }
      : { rows: data as AvatarRow[], managed: true };
    rememberAvatarImages(result.rows);
    return result;
  },
});

/** Les avatars proposés au voyageur, regroupés : personnages, humeurs, ajouts. */
export function useAvatarChoices() {
  const query = useQuery(avatarsQuery);
  const rows = (query.data?.rows ?? fallback).filter((row) => row.active);
  const groups = (Object.keys(avatarKinds) as AvatarKind[])
    .map((kind) => ({
      kind,
      label: avatarKinds[kind],
      rows: rows.filter((row) => row.kind === kind),
    }))
    .filter((group) => group.rows.length);
  return { groups, pending: query.isPending, managed: query.data?.managed ?? false };
}

/** L'image d'un avatar (avant remplacement éventuel dans « Illustrations »). */
export function useAvatarImage(id: string) {
  const query = useQuery(avatarsQuery);
  return query.data?.rows.find((row) => row.id === id)?.image ?? `/cabas/persos/${id}.webp`;
}
