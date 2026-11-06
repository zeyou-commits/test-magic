// E-mail de bienvenue, envoyé une seule fois quand un compte est confirmé (Google : tout de suite ;
// e-mail : au clic sur le lien de confirmation). Déclenché par la base (pg_net), secret des tâches
// planifiées. Envoi par Resend depuis contact@bledway.com (domaine vérifié chez Resend).
// Secrets Supabase requis : RESEND_API_KEY.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SITE = "https://www.bledway.com";
const FROM = "BledWay <contact@bledway.com>";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function welcomeHtml(name: string) {
  const hello = name ? `Salam ${escape(name)} !` : "Salam et bienvenue !";
  const step = (n: number, title: string, text: string) => `
    <tr><td style="padding:10px 0;vertical-align:top;width:34px">
      <div style="width:26px;height:26px;border-radius:13px;background:#0e6b3b;color:#fff;font:700 14px/26px Arial,sans-serif;text-align:center">${n}</div>
    </td><td style="padding:10px 0;font:15px/1.5 Arial,sans-serif;color:#1f2a37">
      <b>${title}</b><br/>${text}
    </td></tr>`;
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f1ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
      <tr><td style="background:#0d3b4f;padding:22px 24px" align="left">
        <img src="${SITE}/pwa-icon-192.png" width="48" height="48" alt="BledWay" style="border-radius:12px;vertical-align:middle"/>
        <span style="font:800 22px Arial,sans-serif;color:#ffffff;vertical-align:middle;margin-left:10px">BledWay</span>
        <div style="font:14px Arial,sans-serif;color:#cfe7dc;margin-top:6px">La route du bled, ensemble</div>
      </td></tr>
      <tr><td style="padding:26px 24px 8px">
        <h1 style="margin:0 0 10px;font:800 24px/1.25 Arial,sans-serif;color:#0d3b4f">${hello}</h1>
        <p style="margin:0;font:15px/1.6 Arial,sans-serif;color:#1f2a37">
          Votre compte BledWay est prêt. Ferries, ports, salons de voyageurs : tout ce qu’il faut pour
          traverser entre l’Europe et l’Algérie sans mauvaise surprise. Voici les 3 réflexes à prendre :
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
          ${step(1, "Suivez votre traversée", "Touchez le cœur sur votre traversée : retards, reports et changements de navire vous arrivent directement.")}
          ${step(2, "Activez les notifications", "Sur votre téléphone, acceptez les notifications de BledWay pour être prévenu même l’application fermée.")}
          ${step(3, "Rejoignez le salon de votre bateau", "Échangez avec les autres passagers : la file au port, l’ambiance à bord, l’état de la mer.")}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:14px 24px 28px">
        <a href="${SITE}/" style="display:inline-block;background:#0e6b3b;color:#ffffff;text-decoration:none;font:700 16px Arial,sans-serif;padding:14px 26px;border-radius:999px">Trouver ma traversée</a>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f7f5ef;font:12px/1.5 Arial,sans-serif;color:#6b7280">
        Vous recevez ce message une seule fois, parce que vous venez de créer un compte sur
        <a href="${SITE}" style="color:#0e6b3b">bledway.com</a>. Bonne route, et à bientôt sur le bateau !
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

Deno.serve(async (request) => {
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const { data: allowed } = await db.rpc("bw_cron_secret_ok", { p_token: token });
  if (allowed !== true) return new Response("Unauthorized", { status: 401 });
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "RESEND_API_KEY manquante" }, 500);

  const body = (await request.json().catch(() => null)) as { user_id?: string } | null;
  if (!body?.user_id) return json({ error: "user_id attendu" }, 400);
  // Une seule fois par compte : la ligne est réservée avant l'envoi.
  const { data: claimed } = await db.rpc("bw_welcome_claim", { p_user: body.user_id });
  if (!claimed) return json({ skipped: "déjà envoyé ou compte introuvable" });
  const { email, name } = claimed as { email: string; name: string };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: "Bienvenue sur BledWay 🚢",
      html: welcomeHtml(name),
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
