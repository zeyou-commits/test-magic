// E-mail de bienvenue, envoyé une seule fois quand un compte est confirmé (Google : tout de suite ;
// e-mail : au clic sur le lien de confirmation). Déclenché par la base (pg_net), secret des tâches
// planifiées. Envoi par Resend depuis contact@bledway.com (domaine vérifié chez Resend).
// Secrets Supabase requis : RESEND_API_KEY.
// Voix : la 504 parle au tu, comme dans ses bulles sur le site (décision du 17/11/2026).
// Textes : modèle partagé (_shared/welcomeTemplate.ts), modifiable dans l'admin, rubrique « E-mails ».
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { welcomeEmail } from "../_shared/welcomeTemplate.ts";
import { CORS, staffTester } from "../_shared/staffTester.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const FROM = "BledWay <contact@bledway.com>";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const { data: allowed } = await db.rpc("bw_cron_secret_ok", { p_token: token });
  const body = (await request.json().catch(() => null)) as
    | { user_id?: string; test?: boolean; texts?: unknown }
    | null;
  const key = Deno.env.get("RESEND_API_KEY");

  // Essai depuis la rubrique « E-mails » : à sa propre adresse, avec les textes en cours d'écriture.
  if (allowed !== true && body?.test === true) {
    const tester = await staffTester(db, token);
    if (!tester) return json({ error: "Réservé à l'équipe" }, 403);
    if (!key) return json({ error: "RESEND_API_KEY manquante" }, 500);
    const mail = welcomeEmail(tester.name, body.texts);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [tester.email],
        subject: `[Essai] ${mail.subject}`,
        html: mail.html,
        text: mail.text,
        reply_to: "contact@bledway.com",
      }),
    });
    return json({ sent: response.ok, to: tester.email }, response.ok ? 200 : 502);
  }
  if (allowed !== true) return new Response("Unauthorized", { status: 401, headers: CORS });
  if (!key) return json({ error: "RESEND_API_KEY manquante" }, 500);

  if (!body?.user_id) return json({ error: "user_id attendu" }, 400);
  // Une seule fois par compte : la ligne est réservée avant l'envoi.
  const { data: claimed } = await db.rpc("bw_welcome_claim", { p_user: body.user_id });
  if (!claimed) return json({ skipped: "déjà envoyé ou compte introuvable" });
  const { email, name } = claimed as { email: string; name: string };
  // Textes modifiés dans l'admin (rubrique « E-mails »), sinon ceux d'origine.
  const { data: setting } = await db
    .from("bw_admin_settings")
    .select("value")
    .eq("key", "email_welcome")
    .maybeSingle();
  const mail = welcomeEmail(name ?? "", (setting as { value?: unknown } | null)?.value);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      reply_to: "contact@bledway.com",
    }),
  });
  const result = await response.json().catch(() => ({}));
  await db.rpc("bw_welcome_done", {
    p_user: body.user_id,
    p_ok: response.ok,
    p_detail: JSON.stringify(result).slice(0, 300),
  });
  return json({ sent: response.ok, status: response.status });
});
