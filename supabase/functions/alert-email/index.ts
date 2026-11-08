// E-mail d'annulation ou de report : envoyé à chaque compte prévenu par un message de l'équipe
// « annulation » ou « nouvel horaire ». Les retards ne partent pas par e-mail.
// Appelée par la base (pg_net) dès que la file bw_alert_emails se remplit, secret des tâches.
// Envoi par Resend (lots de 100) depuis contact@bledway.com. Secret Supabase requis : RESEND_API_KEY.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SITE = "https://www.bledway.com";
const FROM = "BledWay <contact@bledway.com>";

type Item = {
  id: string;
  template: "cancel" | "reschedule";
  email: string;
  name: string;
  title: string;
  body: string;
  url: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Lien vers la traversée sur le site ; jamais vers un autre domaine. */
function link(url: string | null) {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return `${SITE}/`;
  return `${SITE}${url}`;
}

function alertHtml(item: Item) {
  const cancel = item.template === "cancel";
  const badge = cancel ? "Traversée annulée" : "Nouvel horaire";
  const color = cancel ? "#b42318" : "#b54708";
  const hello = item.name ? `Bonjour ${escape(item.name)},` : "Bonjour,";
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f1ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
      <tr><td style="background:#0d3b4f;padding:18px 24px" align="left">
        <img src="${SITE}/pwa-icon-192.png" width="40" height="40" alt="BledWay" style="border-radius:10px;vertical-align:middle"/>
        <span style="font:800 20px Arial,sans-serif;color:#ffffff;vertical-align:middle;margin-left:10px">BledWay</span>
      </td></tr>
      <tr><td style="padding:24px 24px 6px">
        <span style="display:inline-block;background:${color};color:#ffffff;font:700 13px Arial,sans-serif;padding:5px 12px;border-radius:999px">${badge}</span>
        <h1 style="margin:14px 0 8px;font:800 21px/1.3 Arial,sans-serif;color:#0d3b4f">${escape(item.title)}</h1>
        <p style="margin:0 0 6px;font:15px/1.6 Arial,sans-serif;color:#1f2a37">${hello}</p>
        <p style="margin:0;font:15px/1.6 Arial,sans-serif;color:#1f2a37">${escape(item.body)}</p>
      </td></tr>
      <tr><td align="center" style="padding:20px 24px 26px">
        <a href="${link(item.url)}" style="display:inline-block;background:#0e6b3b;color:#ffffff;text-decoration:none;font:700 16px Arial,sans-serif;padding:14px 26px;border-radius:999px">Voir ma traversée</a>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f7f5ef;font:12px/1.5 Arial,sans-serif;color:#6b7280">
        Vous recevez cet e-mail parce que vous suivez cette traversée sur
        <a href="${SITE}" style="color:#0e6b3b">bledway.com</a>. BledWay est un service d’information
        indépendant : confirmez toujours auprès de la compagnie. Pour ne plus être prévenu, retirez le
        suivi de la traversée depuis votre espace.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function alertText(item: Item) {
  return `${item.title}\n\n${item.body}\n\nVoir ma traversée : ${link(item.url)}\n\nBledWay est un service d’information indépendant : confirmez toujours auprès de la compagnie.`;
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

  let sent = 0;
  let failed = 0;
  // Au plus 5 lots de 100 par appel ; le reste part à l'appel suivant.
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc("bw_alert_email_claim", { p_limit: 100 });
    if (error) return json({ error: error.message }, 500);
    const items = (data ?? []) as Item[];
    if (!items.length) break;
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(
        items.map((item) => ({
          from: FROM,
          to: [item.email],
          subject: `${item.template === "cancel" ? "⚠️ " : "🕒 "}${item.title}`,
          html: alertHtml(item),
          text: alertText(item),
          reply_to: "contact@bledway.com",
        })),
      ),
    });
    const result = await response.json().catch(() => ({}));
    await db.rpc("bw_alert_email_done", {
      p_ids: items.map((item) => item.id),
      p_ok: response.ok,
      p_detail: JSON.stringify(response.ok ? { status: response.status } : result).slice(0, 300),
    });
    if (response.ok) sent += items.length;
    else {
      failed += items.length;
      break;
    }
    // Resend : 2 requêtes par seconde au plus.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return json({ sent, failed });
});
