// Modèle des e-mails d'alerte (fonction alert-email), modifiable dans l'admin, rubrique « E-mails »
// (réglage bw_admin_settings « email_alerts »). Le titre et le texte de chaque alerte viennent du
// message lui-même (équipe, veille, rappels) : ici, seul l'habillage autour se modifie.
// Voix (17/11/2026) : rappels et ouvertures viennent de la 504, au tu ; annulations et nouveaux
// horaires sont des messages de l'équipe, au vous. {prenom} = pseudo du voyageur.
import { SITE, escapeHtml, plain, rich, textsFor } from "./emailTexts.ts";

export const ALERT_LANGS = ["fr"] as const;
export const ALERT_KINDS = ["cancel", "reschedule", "deadline", "opening"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export type AlertItem = {
  template: AlertKind;
  name: string;
  title: string;
  body: string;
  url: string | null;
};

export const ALERT_LIMITS = {
  helloTu: 120,
  helloTuAnon: 120,
  helloVous: 120,
  helloVousAnon: 120,
  disclaimerTu: 300,
  disclaimerVous: 300,
  cancelEmoji: 8,
  cancelBadge: 40,
  cancelButton: 60,
  cancelWhy: 300,
  cancelStop: 300,
  rescheduleEmoji: 8,
  rescheduleBadge: 40,
  rescheduleButton: 60,
  rescheduleWhy: 300,
  rescheduleStop: 300,
  deadlineEmoji: 8,
  deadlineBadge: 40,
  deadlineButton: 60,
  deadlineWhy: 300,
  deadlineStop: 300,
  openingEmoji: 8,
  openingBadge: 40,
  openingButton: 60,
  openingWhy: 300,
  openingStop: 300,
} as const;
export type AlertTexts = Record<keyof typeof ALERT_LIMITS, string>;

const vousWhy = "Vous recevez cet e-mail parce que vous suivez cette traversée sur bledway.com.";
const vousStop = "Pour ne plus être prévenu, retirez le suivi de la traversée depuis votre espace.";

export const ALERT_DEFAULTS: Record<"fr", AlertTexts> = {
  fr: {
    helloTu: "Salam {prenom} !",
    helloTuAnon: "Salam !",
    helloVous: "Bonjour {prenom},",
    helloVousAnon: "Bonjour,",
    disclaimerTu:
      "BledWay est un service d’information indépendant : confirme toujours auprès de la compagnie ou du consulat.",
    disclaimerVous:
      "BledWay est un service d’information indépendant : confirmez toujours auprès de la compagnie ou du consulat.",
    cancelEmoji: "⚠️",
    cancelBadge: "Traversée annulée",
    cancelButton: "Voir ma traversée",
    cancelWhy: vousWhy,
    cancelStop: vousStop,
    rescheduleEmoji: "🕒",
    rescheduleBadge: "Nouvel horaire",
    rescheduleButton: "Voir ma traversée",
    rescheduleWhy: vousWhy,
    rescheduleStop: vousStop,
    deadlineEmoji: "📝",
    deadlineBadge: "Rappel de préparation",
    deadlineButton: "Voir ma préparation",
    deadlineWhy: "Tu reçois cet e-mail parce que tu prépares ton voyage sur bledway.com.",
    deadlineStop:
      "Pour ne plus recevoir ces rappels, coupe « Rappels » dans Mon compte, rubrique Notifications.",
    openingEmoji: "🎟️",
    openingBadge: "Ventes ouvertes",
    openingButton: "Voir les traversées",
    openingWhy:
      "Tu reçois cet e-mail parce que tu as demandé une alerte d’ouverture des ventes sur bledway.com.",
    openingStop:
      "Pour ne plus recevoir ces alertes, coupe « Ouverture des traversées » dans Mon compte, rubrique Notifications.",
  },
};

/** Exemples pour l'aperçu et l'essai de l'admin (le vrai titre et le vrai texte viennent du message). */
export const ALERT_SAMPLES: Record<AlertKind, { title: string; body: string; url: string }> = {
  cancel: {
    title: "Marseille → Alger du 12 juillet : traversée annulée",
    body: "La compagnie annonce l’annulation de ce départ. Les passagers sont reportés sur le départ du lendemain à la même heure.",
    url: "/horaires",
  },
  reschedule: {
    title: "Marseille → Alger du 12 juillet : départ décalé à 19 h",
    body: "Le départ prévu à 12 h partira à 19 h. L’embarquement ouvre trois heures avant.",
    url: "/horaires",
  },
  deadline: {
    title: "Rendez-vous consulaire : plus que 10 jours",
    body: "Pense à prendre rendez-vous pour le passeport de Sami avant le 2 juin.",
    url: "/preparer-mon-voyage",
  },
  opening: {
    title: "Les traversées de juillet sont en vente",
    body: "La compagnie vient d’ouvrir les ventes pour tes dates : du 5 au 20 juillet.",
    url: "/horaires",
  },
};

export const alertTexts = (overrides?: unknown) =>
  textsFor(ALERT_DEFAULTS.fr, ALERT_LIMITS, overrides, "fr");

/** Lien vers la page du site ; jamais vers un autre domaine. */
export function alertLink(url: string | null) {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return `${SITE}/`;
  return `${SITE}${url}`;
}

export function alertEmail(item: AlertItem, overrides?: unknown, texts?: AlertTexts) {
  const t = texts ?? alertTexts(overrides);
  const kind = item.template;
  const tu = kind === "deadline" || kind === "opening";
  const vars = { prenom: (item.name ?? "").trim() };
  const r = (text: string) => rich(text, "fr", vars);
  const color = tu ? "#0e6b3b" : kind === "cancel" ? "#b42318" : "#b54708";
  const hello = tu
    ? vars.prenom ? t.helloTu : t.helloTuAnon
    : vars.prenom ? t.helloVous : t.helloVousAnon;
  const disclaimer = tu ? t.disclaimerTu : t.disclaimerVous;
  const badge = t[`${kind}Badge`];
  const button = t[`${kind}Button`];
  const why = t[`${kind}Why`];
  const stop = t[`${kind}Stop`];
  const emoji = t[`${kind}Emoji`].trim();
  const href = escapeHtml(alertLink(item.url));
  const subject = `${emoji ? `${emoji} ` : ""}${item.title}`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f1ea">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
      <tr><td style="background:#0d3b4f;padding:18px 24px" align="left">
        <img src="${SITE}/pwa-icon-192.png" width="40" height="40" alt="BledWay" style="border-radius:10px;vertical-align:middle"/>
        <span style="font:800 20px Arial,sans-serif;color:#ffffff;vertical-align:middle;margin-left:10px">BledWay</span>
      </td></tr>
      <tr><td style="padding:24px 24px 6px">
        <span style="display:inline-block;background:${color};color:#ffffff;font:700 13px Arial,sans-serif;padding:5px 12px;border-radius:999px">${r(badge)}</span>
        <h1 style="margin:14px 0 8px;font:800 21px/1.3 Arial,sans-serif;color:#0d3b4f">${escapeHtml(item.title)}</h1>
        <p style="margin:0 0 6px;font:15px/1.6 Arial,sans-serif;color:#1f2a37">${r(hello)}</p>
        <p style="margin:0;font:15px/1.6 Arial,sans-serif;color:#1f2a37">${escapeHtml(item.body)}</p>
      </td></tr>
      <tr><td align="center" style="padding:20px 24px 26px">
        <a href="${href}" style="display:inline-block;background:#0e6b3b;color:#ffffff;text-decoration:none;font:700 16px Arial,sans-serif;padding:14px 26px;border-radius:999px">${r(button)}</a>
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f7f5ef;font:12px/1.5 Arial,sans-serif;color:#6b7280">
        ${r(why)} ${r(disclaimer)} ${r(stop)}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const p = (s: string) => plain(s, vars);
  const text = `${item.title}\n\n${p(hello)}\n${item.body}\n\n${p(button)} : ${alertLink(item.url)}\n\n${p(disclaimer)} ${p(stop)}`;
  return { subject, html, text };
}
