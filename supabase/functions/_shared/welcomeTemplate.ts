// Modèle de l'e-mail de bienvenue (fonction welcome-email), modifiable dans l'admin, rubrique
// « E-mails » (réglage bw_admin_settings « email_welcome »). Voix : la 504, au tu.
// {prenom} est remplacé par le pseudo du voyageur.
import { SITE, escapeHtml, plain, rich, textsFor } from "./emailTexts.ts";

export const WELCOME_LANGS = ["fr"] as const;

export const WELCOME_LIMITS = {
  subject: 150,
  preheader: 200,
  tagline: 80,
  hello: 120,
  helloAnon: 120,
  intro: 600,
  step1Title: 80,
  step1: 400,
  step1Link: 60,
  step2Title: 80,
  step2: 400,
  step3Title: 80,
  step3: 400,
  step4Title: 80,
  step4: 400,
  button: 60,
  booked: 80,
  bookedLink: 80,
  footer: 400,
} as const;
export type WelcomeTexts = Record<keyof typeof WELCOME_LIMITS, string>;

export const WELCOME_DEFAULTS: Record<"fr", WelcomeTexts> = {
  fr: {
    subject: "Bienvenue sur BledWay 🚢",
    preheader: "Ton compte est prêt : voici comment on fait la route ensemble.",
    tagline: "La route du bled, ensemble",
    hello: "Salam {prenom} !",
    helloAnon: "Salam et bienvenue !",
    intro:
      "Moi, c’est la 504. Ton compte BledWay est prêt : du choix du ferry jusqu’à l’arrivée au port, voici comment on fait la route ensemble, sans mauvaise surprise.",
    step1Title: "Avant de partir : trouve et réserve",
    step1:
      "Compare les départs et les prix indicatifs de chaque compagnie, puis réserve directement chez elle depuis BledWay.",
    step1Link: "Voir les départs",
    step2Title: "Une fois réservé : suis et prépare",
    step2:
      "Touche le cœur sur ta traversée et accepte les notifications : je te préviens des retards, reports et changements de navire signalés. Coche au fur et à mesure tes papiers, la voiture et les bagages.",
    step3Title: "Le jour J : signale",
    step3:
      "File au port, attente à l’embarquement, retard au départ : partage en un geste ce que tu vois sur place, et profite de ce que signalent les autres voyageurs.",
    step4Title: "À bord : le salon de ta traversée",
    step4:
      "Échange avec ceux qui font la même traversée : état de la mer, ambiance à bord, heure d’arrivée.",
    button: "Trouver ma traversée",
    booked: "Déjà réservé ?",
    bookedLink: "Suis ta traversée sur la carte",
    footer:
      "Tu reçois ce message une seule fois, parce que tu viens de créer un compte sur bledway.com. Bonne route, et à bientôt sur le navire !",
  },
};

export const welcomeTexts = (overrides?: unknown) =>
  textsFor(WELCOME_DEFAULTS.fr, WELCOME_LIMITS, overrides, "fr");

export function welcomeEmail(name: string, overrides?: unknown) {
  const t = welcomeTexts(overrides);
  const vars = { prenom: name.trim() };
  const r = (text: string) => rich(text, "fr", vars);
  const hello = vars.prenom ? t.hello : t.helloAnon;
  const step = (n: number, title: string, text: string, href?: string, label?: string) => `
    <tr><td style="padding:10px 0;vertical-align:top;width:34px">
      <div style="width:26px;height:26px;border-radius:13px;background:#0e6b3b;color:#fff;font:700 14px/26px Arial,sans-serif;text-align:center">${n}</div>
    </td><td style="padding:10px 0;font:15px/1.5 Arial,sans-serif;color:#1f2a37">
      <b>${r(title)}</b><br/>${r(text)}${href && label ? `<br/><a href="${SITE}${href}" style="color:#0e6b3b;font-weight:700">${r(label)} →</a>` : ""}
    </td></tr>`;
  const subject = plain(t.subject, vars);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f1ea">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${r(t.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
      <tr><td style="background:#0d3b4f;padding:22px 24px" align="left">
        <img src="${SITE}/pwa-icon-192.png" width="48" height="48" alt="BledWay" style="border-radius:12px;vertical-align:middle"/>
        <span style="font:800 22px Arial,sans-serif;color:#ffffff;vertical-align:middle;margin-left:10px">BledWay</span>
        <div style="font:14px Arial,sans-serif;color:#cfe7dc;margin-top:6px">${r(t.tagline)}</div>
      </td></tr>
      <tr><td style="padding:26px 24px 8px">
        <h1 style="margin:0 0 10px;font:800 24px/1.25 Arial,sans-serif;color:#0d3b4f">${r(hello)}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:12px">
            <img src="${SITE}/email/voiture_504.png" width="72" height="72" alt="" style="display:block"/>
          </td>
          <td style="vertical-align:middle;font:15px/1.6 Arial,sans-serif;color:#1f2a37">${r(t.intro)}</td>
        </tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
          ${step(1, t.step1Title, t.step1, "/horaires", t.step1Link)}
          ${step(2, t.step2Title, t.step2)}
          ${step(3, t.step3Title, t.step3)}
          ${step(4, t.step4Title, t.step4)}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:14px 24px 28px">
        <a href="${SITE}/horaires" style="display:inline-block;background:#0e6b3b;color:#ffffff;text-decoration:none;font:700 16px Arial,sans-serif;padding:14px 26px;border-radius:999px">${r(t.button)}</a>
        <div style="margin-top:14px;font:14px Arial,sans-serif;color:#1f2a37">
          ${r(t.booked)} <a href="${SITE}/" style="color:#0e6b3b;font-weight:700">${r(t.bookedLink)}</a>
        </div>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f7f5ef;font:12px/1.5 Arial,sans-serif;color:#6b7280">
        ${r(t.footer)}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const p = (s: string) => plain(s, vars);
  const text = [
    p(hello),
    "",
    p(t.intro),
    "",
    `1. ${p(t.step1Title)} : ${p(t.step1)} ${SITE}/horaires`,
    `2. ${p(t.step2Title)} : ${p(t.step2)}`,
    `3. ${p(t.step3Title)} : ${p(t.step3)}`,
    `4. ${p(t.step4Title)} : ${p(t.step4)}`,
    "",
    `${p(t.button)} : ${SITE}/horaires`,
    `${p(t.booked)} ${p(t.bookedLink)} : ${SITE}/`,
    "",
    p(t.footer),
  ].join("\n");
  return { subject, html, text };
}
