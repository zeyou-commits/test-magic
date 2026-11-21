import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  isTunableRole,
  roleAllowsTab,
  LOCKED_TABS,
  type RoleConfig,
  type TunableRole,
} from "./permissions";

// Table pas encore présente dans les types générés.
const db = typedSupabase as unknown as SupabaseClient;

type Row = {
  role: string;
  removed_tabs: string[] | null;
  home_tab: string | null;
  updated_at: string;
};

export const roleConfigKey = ["admin", "role-config"] as const;

/**
 * Réglage des rôles fait par l'administrateur (table bw_staff_role_config). Lisible par toute
 * l'équipe ; si la table n'existe pas encore, chacun garde le cadre complet de son rôle.
 */
export function useRoleConfig() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...roleConfigKey, user?.id],
    enabled: Boolean(user),
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from("bw_staff_role_config")
        .select("role, removed_tabs, home_tab, updated_at");
      if (error) return { config: {} as RoleConfig, updatedAt: null, ready: false };
      const config: RoleConfig = {};
      let updatedAt: string | null = null;
      for (const row of (data ?? []) as Row[]) {
        if (!isTunableRole(row.role)) continue;
        config[row.role] = { removed: row.removed_tabs ?? [], home: row.home_tab };
        if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at;
      }
      return { config, updatedAt, ready: true };
    },
  });
}

/** Enregistre le réglage d'un rôle (administrateur seulement, contrôlé par la base). */
export function useSaveRoleSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      role,
      removed,
      home,
    }: {
      role: TunableRole;
      removed: string[];
      home: string | null;
    }) => {
      // Ne garder que des rubriques du cadre du rôle, jamais l'accueil.
      const clean = [...new Set(removed)].filter(
        (tab) => roleAllowsTab(role, tab) && !LOCKED_TABS.has(tab),
      );
      const { error } = await db.rpc("bw_admin_set_role_config", {
        p_role: role,
        p_removed: clean,
        p_home: home && !clean.includes(home) ? home : null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: roleConfigKey }),
  });
}
