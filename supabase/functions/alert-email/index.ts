// E-mail d'annulation ou de report : envoyé à chaque compte prévenu par un message de l'équipe
// « annulation » ou « nouvel horaire ». Les retards ne partent pas par e-mail.
// Aussi : les rappels d'échéance de « Préparer mon voyage » (modèle « deadline », 14/11/2026) et
// l'ouverture des ventes d'une compagnie pour les dates d'une alerte (modèle « opening », 16/11/2026).
// Voix (17/11/2026) : rappels et ouvertures viennent de la 504, au tu ; annulations et nouveaux
// horaires sont des messages de l'équipe, au vous (les compagnies parleront ainsi à leur tour).
// Appelée par la base (pg_net) dès que la file bw_alert_emails se remplit, secret des tâches.
// Envoi par Resend (lots de 100) depuis contact@bledway.com. Secret Supabase requis : RESEND_API_KEY.
// Textes autour du message : modèle partagé (_shared/alertTemplate.ts), modifiable dans l'admin,
// rubrique « E-mails » (réglage « email_alerts »). Essai possible depuis l'admin ({ test: true }).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ALERT_KINDS,
  ALERT_SAMPLES,
  alertEmail,
  alertTexts,
  type AlertItem,
  type AlertKind,
} from "../_shared/alertTemplate.ts";
import { CORS, staffTester } from "../_shared/staffTester.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const FROM = "BledWay <contact@bledway.com>";

type Item = AlertItem & { id: string; email: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const { data: allowed } = await db.rpc("bw_cron_secret_ok", { p_token: token });
  const key = Deno.env.get("RESEND_API_KEY");

  // Essai depuis la rubrique « E-mails » : un exemple du modèle choisi, à sa propre adresse.
  if (allowed !== true) {
    const body = (await request.json().catch(() => null)) as
      | { test?: boolean; kind?: string; texts?: unknown }
      | null;
    if (body?.test !== true) return new Response("Unauthorized", { status: 401, headers: CORS });
    const tester = await staffTester(db, token);
    if (!tester) return json({ error: "Réservé à l'équipe" }, 403);
    if (!key) return json({ error: "RESEND_API_KEY manquante" }, 500);
    const kind: AlertKind = ALERT_KINDS.includes(body.kind as AlertKind)
      ? (body.kind as AlertKind)
      : "cancel";
    const mail = alertEmail({ template: kind, name: tester.name, ...ALERT_SAMPLES[kind] }, body.texts);
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
  if (!key) return json({ error: "RESEND_API_KEY manquante" }, 500);
  // Textes modifiés dans l'admin, lus une fois par appel (sinon ceux d'origine).
  const { data: setting } = await db
    .from("bw_admin_settings")
    .select("value")
    .eq("key", "email_alerts")
    .maybeSingle();
  const texts = alertTexts((setting as { value?: unknown } | null)?.value);

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
        items.map((item) => {
          const mail = alertEmail(item, undefined, texts);
          return {
            from: FROM,
            to: [item.email],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            reply_to: "contact@bledway.com",
          };
        }),
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
