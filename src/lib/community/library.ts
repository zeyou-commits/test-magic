import { queryOptions, useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { avatarKinds, avatarsQuery, type AvatarKind, type AvatarRow } from "./avatars";

// Tables du script « bibliotheque_categories », absentes des types générés.
const db = typedSupabase as unknown as SupabaseClient;

/**
 * La bibliothèque d'emojis et d'avatars : une seule liste d'images (table bw_avatars), rangée par
 * catégories. Les catégories servent à naviguer, jamais à restreindre : toute image active se
 * choisit comme avatar, comme humeur et dans les salons.
 */
export type LibraryCategory = { id: string; label: string; sort: number };
export type LibraryLink = { category_id: string; item_id: string; sort: number };
export type LibraryGroup = { id: string; label: string; rows: AvatarRow[] };

/** Rangement des images qui ne sont dans aucune catégorie (après suppression d'une catégorie). */
export const UNSORTED = "sans-categorie";
export const UNSORTED_LABEL = "Sans catégorie";

export const libraryCategoriesKey = ["library-categories"] as const;
export const libraryCategoriesQuery = queryOptions({
  queryKey: libraryCategoriesKey,
  staleTime: 10 * 60_000,
  retry: false,
  queryFn: async (): Promise<{
    categories: LibraryCategory[];
    links: LibraryLink[];
    managed: boolean;
  }> => {
    const [categories, links] = await Promise.all([
      db.from("bw_library_categories").select("id,label,sort").order("sort").order("label"),
      db.from("bw_library_category_items").select("category_id,item_id,sort").limit(5000),
    ]);
    if (categories.error || links.error) return { categories: [], links: [], managed: false };
    return {
      categories: categories.data as LibraryCategory[],
      links: links.data as LibraryLink[],
      managed: true,
    };
  },
});

/** Regroupe les images par catégorie, puis « Sans catégorie » pour celles qui n'en ont aucune. */
export function groupLibrary(
  rows: AvatarRow[],
  categories: LibraryCategory[],
  links: LibraryLink[],
): LibraryGroup[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const placed = new Set<string>();
  const groups: LibraryGroup[] = categories.map((category) => {
    const items = links
      .filter((link) => link.category_id === category.id && byId.has(link.item_id))
      .sort((a, b) => a.sort - b.sort || byId.get(a.item_id)!.sort - byId.get(b.item_id)!.sort)
      .map((link) => {
        placed.add(link.item_id);
        return byId.get(link.item_id)!;
      });
    return { id: category.id, label: category.label, rows: items };
  });
  const rest = rows.filter((row) => !placed.has(row.id));
  if (rest.length) groups.push({ id: UNSORTED, label: UNSORTED_LABEL, rows: rest });
  return groups;
}

/** Déplace l'élément `from` à la place `to` (glisser-déposer, flèches) ; renvoie une copie. */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/**
 * Nouvel ordre → valeurs `sort` 10, 20, 30… ; ne renvoie que celles qui changent (moins
 * d'écritures, et deux éléments ne gardent jamais le même rang).
 */
export function renumber<T extends { sort: number }>(
  ordered: readonly T[],
): { item: T; sort: number }[] {
  return ordered
    .map((item, index) => ({ item, sort: (index + 1) * 10 }))
    .filter(({ item, sort }) => item.sort !== sort);
}

/** Sans le script des catégories : l'ancien rangement par type, sans aucune restriction non plus. */
function groupByKind(rows: AvatarRow[]): LibraryGroup[] {
  return (Object.keys(avatarKinds) as AvatarKind[]).map((kind) => ({
    id: kind,
    label: avatarKinds[kind],
    rows: rows.filter((row) => row.kind === kind),
  }));
}

/** Recherche sans accents ni majuscules, sur le nom, l'identifiant et les catégories. */
export const normalizeSearch = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** La bibliothèque proposée aux voyageurs : toutes les images actives, rangées par catégories. */
export function useLibrary() {
  const avatars = useQuery(avatarsQuery);
  const categories = useQuery(libraryCategoriesQuery);
  const rows = (avatars.data?.rows ?? []).filter((row) => row.active);
  const managed = categories.data?.managed ?? false;
  const groups = (
    managed
      ? groupLibrary(rows, categories.data!.categories, categories.data!.links)
      : groupByKind(rows)
  ).filter((group) => group.rows.length);
  const categoriesOf = new Map<string, string[]>();
  for (const group of groups)
    for (const row of group.rows)
      categoriesOf.set(row.id, [...(categoriesOf.get(row.id) ?? []), group.label]);
  return {
    rows,
    groups,
    /** Noms des catégories d'une image (pour la recherche). */
    categoriesOf,
    /** Le script des catégories est en place (humeur depuis la bibliothèque possible). */
    managed,
    pending: avatars.isPending || categories.isPending,
  };
}
