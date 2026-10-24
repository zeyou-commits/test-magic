import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function jwtClaims(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
function projectOrigin(value?: string) {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}
/** Les claims non vérifiés ne servent qu'à détecter une incohérence, jamais à autoriser. */
export async function verifyAdminSession(request: Request, db: SupabaseClient<Database>) {
  const fail = (error: string, code: string, status: number) => ({
    user: null,
    response: Response.json({ error, code }, { status, headers: { "cache-control": "no-store" } }),
  });
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token)
    return fail("Connectez-vous pour accéder à l’administration.", "SESSION_REQUIRED", 401);
  const server = projectOrigin(process.env["SUPABASE_URL"]);
  const frontend = projectOrigin(import.meta.env["VITE_SUPABASE_URL"]);
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const keyClaims = key?.startsWith("ey") ? jwtClaims(key) : null;
  const serverRef = server ? new URL(server).hostname.split(".")[0] : null;
  if (
    (server && frontend && server !== frontend) ||
    (serverRef && keyClaims?.["ref"] && keyClaims["ref"] !== serverRef) ||
    (keyClaims?.["role"] && keyClaims["role"] !== "service_role")
  ) {
    return fail(
      "Configuration Supabase incohérente : les variables du site et du serveur doivent appartenir au même projet. Vérifiez-les dans Vercel puis redéployez.",
      "ADMIN_PROJECT_MISMATCH",
      503,
    );
  }
  const issuer = jwtClaims(token)?.["iss"];
  if (server && typeof issuer === "string" && projectOrigin(issuer) !== server) {
    return fail(
      "Cette session appartient à un autre projet Supabase. Reconnectez-vous ; si le problème persiste, vérifiez les variables Supabase du déploiement.",
      "SESSION_PROJECT_MISMATCH",
      401,
    );
  }
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    if (error && /api.?key|invalid.*key/i.test(error.message))
      return fail(
        "La clé serveur Supabase est refusée. Vérifiez SUPABASE_SERVICE_ROLE_KEY dans Vercel puis redéployez.",
        "ADMIN_AUTH_CONFIG",
        503,
      );
    if (
      error &&
      (error.status === 429 ||
        (error.status ?? 0) >= 500 ||
        error.name === "AuthRetryableFetchError")
    )
      return fail(
        "L’authentification est momentanément indisponible. Réessayez dans un instant.",
        "AUTH_UNAVAILABLE",
        503,
      );
    return fail("Votre session a expiré. Reconnectez-vous.", "SESSION_EXPIRED", 401);
  }
  return { user: data.user, response: null };
}
