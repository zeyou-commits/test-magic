// Essais d'e-mails depuis l'admin (rubrique « E-mails ») : l'appelant doit être connecté et
// administrateur ou éditeur. Partagé par welcome-email et alert-email (fonctions Edge seulement).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

/** Essai depuis l'admin : personne connectée, administrateur ou éditeur. Renvoie son adresse. */
export async function staffTester(db: SupabaseClient, token: string) {
  if (!token) return null;
  const { data: who } = await db.auth.getUser(token);
  if (!who?.user?.email) return null;
  const { data: roles } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", who.user.id)
    .in("role", ["admin", "editor"]);
  if (!roles?.length) return null;
  const { data: profile } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", who.user.id)
    .maybeSingle();
  return {
    email: who.user.email,
    name: String((profile as { display_name?: string } | null)?.display_name ?? "").trim(),
  };
}
