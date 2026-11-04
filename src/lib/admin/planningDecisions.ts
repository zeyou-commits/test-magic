import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";

// Table du script « decisions_planning », pas encore dans les types générés.
const db = typedSupabase as unknown as SupabaseClient;

/** Ancien stockage, propre à chaque navigateur : repris une fois dans la table commune. */
const LOCAL_KEY = "bw-admin-ignored-issues";
const readLocal = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const writeLocal = (keys: string[]) => {
  try {
    if (keys.length) localStorage.setItem(LOCAL_KEY, JSON.stringify(keys));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* stockage indisponible : la décision vaut pour cette visite */
  }
};

const decisionsKey = ["admin", "planning-decisions"] as const;

/**
 * Les points du planning écartés par l'équipe (escale courte acceptée, « ce sont deux départs »,
 * « ignorer ») : communs à toute l'équipe, dans Aujourd'hui comme dans le planning.
 * Sans le script, ils restent gardés dans ce navigateur comme avant.
 */
export function usePlanningDecisions() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: decisionsKey,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from("bw_planning_decisions").select("key");
      if (error) return { shared: false, keys: readLocal() };
      return { shared: true, keys: (data as { key: string }[]).map((row) => row.key) };
    },
  });
  const shared = query.data?.shared ?? false;
  const keys = query.data?.keys ?? [];

  // Les décisions prises avant, dans ce navigateur, rejoignent la table commune une fois.
  useEffect(() => {
    if (!shared) return;
    const local = readLocal();
    if (!local.length) return;
    void db
      .from("bw_planning_decisions")
      .upsert(local.map((key) => ({ key })), { onConflict: "key", ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) return;
        writeLocal([]);
        void client.invalidateQueries({ queryKey: decisionsKey });
      });
  }, [shared, client]);

  const decide = useMutation({
    mutationFn: async (next: string[]) => {
      if (!shared) {
        writeLocal([...new Set([...readLocal(), ...next])]);
        return;
      }
      const { error } = await db
        .from("bw_planning_decisions")
        .upsert(next.map((key) => ({ key })), { onConflict: "key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: decisionsKey }),
  });
  const reset = useMutation({
    mutationFn: async () => {
      writeLocal([]);
      if (!shared) return;
      const { error } = await db.from("bw_planning_decisions").delete().neq("key", "");
      if (error) throw new Error(error.message);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: decisionsKey }),
  });
  return {
    ignored: keys,
    shared,
    ignore: (next: string[]) => decide.mutate(next),
    reset: () => reset.mutate(),
  };
}
