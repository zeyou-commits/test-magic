import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Table absente des types générés.
const supabase = typedSupabase as unknown as SupabaseClient;

export const ILLUSTRATIONS_BUCKET = "bledway-illustrations";
const CACHE_KEY = "bw-illustrations";

export type IllustrationRow = {
  src: string;
  storage_path: string | null;
  label: string | null;
  updated_at: string;
};

export const illustrationFileUrl = (path: string) =>
  supabase.storage.from(ILLUSTRATIONS_BUCKET).getPublicUrl(path).data.publicUrl;

let rows = new Map<string, IllustrationRow>();
const listeners = new Set<() => void>();

function publish(next: IllustrationRow[]) {
  rows = new Map(next.map((row) => [row.src, row]));
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** L'image choisie dans l'admin, sinon celle d'origine. */
export function illustrationUrl(src: string) {
  const path = rows.get(src)?.storage_path;
  return path ? illustrationFileUrl(path) : src;
}

// Le serveur rend toujours l'image d'origine : le remplacement arrive après l'hydratation.
export const useIllustrationUrl = (src: string) =>
  useSyncExternalStore(
    subscribe,
    () => illustrationUrl(src),
    () => src,
  );

export const useIllustrationName = (src: string, fallback: string) =>
  useSyncExternalStore(
    subscribe,
    () => rows.get(src)?.label ?? fallback,
    () => fallback,
  );

export async function fetchIllustrations() {
  const { data, error } = await supabase
    .from("bw_illustrations")
    .select("src,storage_path,label,updated_at");
  if (error) throw new Error(error.message);
  const list = data as IllustrationRow[];
  publish(list);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // Stockage indisponible : le prochain chargement repartira de la base.
  }
  return list;
}

/** Au démarrage : la dernière liste connue tout de suite, pour éviter de revoir l'ancienne image. */
export function loadIllustrations() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) publish(JSON.parse(cached) as IllustrationRow[]);
  } catch {
    // Cache illisible : on attend la base.
  }
  void fetchIllustrations().catch(() => {
    // Table pas encore créée ou réseau coupé : les images d'origine restent affichées.
  });
}
