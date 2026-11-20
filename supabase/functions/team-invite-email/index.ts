// E-mail d'invitation dans l'équipe BledWay, au même habillage que la bienvenue et les alertes.
// Appelée par le serveur du site (route /api/admin-users) avec la session de l'administrateur :
// la fonction revérifie elle-même que l'appelant est administrateur avant d'envoyer.
// Le lien vient de auth.admin.generateLink (Supabase n'envoie alors rien de lui-même).
// Textes : modèle partagé (_shared/inviteTemplate.ts) + modifications de l'admin, rubrique
// « E-mails » (réglage bw_admin_settings « email_invite »).
// Essai ({ test: true }) : envoyé à l'adresse de la personne connectée (admin ou éditeur), avec
// les textes en cours d'écriture, sans créer de compte.
// Aussi l'e-mail « nouveau rôle » ({ kind: "role" }) : quand un administrateur donne un rôle
// d'équipe à un compte existant (textes : _shared/roleTemplate.ts, réglage « email_role »).
// Envoi par Resend depuis contact@bledway.com. Secrets Supabase requis : RESEND_API_KEY.
// Déploiement : verify_jwt false (la session est vérifiée ici, comme pour les autres fonctions).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { inviteEmail, type InviteLang, type InviteRole } from "../_shared/inviteTemplate.ts";
import { roleEmail, type StaffRole } from "../_shared/roleTemplate.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SITE = "https://www.bledway.com";
const FROM = "BledWay <contact@bledway.com>";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;
  // L'appelant doit être connecté (jeton de sa session, vérifié par Auth).
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!who?.user) return json({ error: "Session requise" }, 401);

  const body = (await request.json().catch(() => null)) as {
    to?: string;
    link?: string;
    role?: string;
    lang?: string;
    test?: boolean;
    texts?: unknown;
    kind?: string;
    name?: string;
  } | null;
  const test = body?.test === true;
  const promotion = body?.kind === "role";
  // Envoi réel : administrateurs seulement. Essai : administrateurs et éditeurs (rubrique E-mails).
  const { data: roles } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", who.user.id)
    .in("role", test ? ["admin", "editor"] : ["admin"]);
  if (!roles?.length) return json({ error: "Réservé à l'équipe" }, 403);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "RESEND_API_KEY manquante" }, 500);
  const lang: InviteLang = body?.lang === "ar" || body?.lang === "en" ? body.lang : "fr";
  const role: InviteRole = (["admin", "editor", "moderator"] as const).includes(body?.role as never)
    ? (body!.role as InviteRole)
    : "none";
  if (promotion && role === "none") return json({ error: "Rôle attendu" }, 400);
  const to = test ? String(who.user.email ?? "") : String(body?.to ?? "").trim();
  const link = test ? `${SITE}/admin?tab=emails` : String(body?.link ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 255)
    return json({ error: "Adresse invalide" }, 400);
  // Seuls les liens d'invitation de ce projet Supabase sont acceptés.
  if (!test && !promotion && (!url || !link.startsWith(`${url}/auth/v1/verify?`)))
    return json({ error: "Lien refusé" }, 400);

  // Textes : ceux en cours d'écriture pour un essai, sinon ceux enregistrés dans l'admin.
  let overrides: unknown = undefined;
  if (test && body?.texts) overrides = body.texts;
  else {
    const { data: setting } = await db
      .from("bw_admin_settings")
      .select("value")
      .eq("key", promotion ? "email_role" : "email_invite")
      .maybeSingle();
    overrides = (setting as { value?: unknown } | null)?.value;
  }

  // Nom affiché de l'administrateur qui invite : pseudo du profil, sinon « L'équipe BledWay ».
  const { data: profile } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", who.user.id)
    .maybeSingle();
  const inviter = String((profile as { display_name?: string } | null)?.display_name ?? "")
    .trim()
    .slice(0, 60);

  // Prénom de la personne promue : donné par le serveur du site ; pour un essai, le sien.
  const name = String(test ? inviter : (body?.name ?? "")).trim().slice(0, 60);
  const mail = promotion
    ? roleEmail(lang, role as StaffRole, name, inviter, overrides)
    : inviteEmail(lang, role, inviter, link, overrides);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: test ? `[Essai] ${mail.subject}` : mail.subject,
      html: mail.html,
      text: mail.text,
      reply_to: "contact@bledway.com",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json({ sent: false, status: response.status, detail: result }, 502);
  return json({ sent: true, to: test ? to : undefined });
});
