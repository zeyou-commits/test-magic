import { supabase } from "@/integrations/supabase/client";

export type ManagedUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
};
export type UsersPage = {
  total: number;
  members: ManagedUser[];
  audit: {
    actor_id: string | null;
    target_id: string | null;
    action: string;
    created_at: string;
  }[];
};
export async function userAdminAction<T>(input: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Votre session a expiré. Reconnectez-vous.");
  const response = await fetch("/api/admin-users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(input),
  });
  const result = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !result)
    throw new Error(result?.error ?? "La gestion des utilisateurs est indisponible.");
  return result;
}
