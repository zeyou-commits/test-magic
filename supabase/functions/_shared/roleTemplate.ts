// E-mail « nouveau rôle » : envoyé quand un administrateur donne un rôle d'équipe à un compte
// existant (Réglages → Utilisateurs). Modifiable dans l'admin, rubrique « E-mails » (réglage
// bw_admin_settings « email_role »), en trois langues comme l'invitation.
// {prenom} = pseudo de la personne promue, {inviteur} = pseudo de l'administrateur, {role} = rôle.
import { SITE, escapeHtml, plain, rich, textsFor } from "./emailTexts.ts";
import { INVITE_LANGS, roleInfo, type InviteLang } from "./inviteTemplate.ts";

export const ROLE_LANGS = INVITE_LANGS;
export type StaffRole = "admin" | "editor" | "moderator";

export const ROLE_MAIL_LIMITS = {
  subject: 150,
  preheader: 200,
  tagline: 80,
  title: 120,
  hello: 120,
  helloAnon: 120,
  intro: 600,
  next: 400,
  button: 60,
  footer: 400,
} as const;
export type RoleMailTexts = Record<keyof typeof ROLE_MAIL_LIMITS, string>;

export const ROLE_MAIL_DEFAULTS: Record<InviteLang, RoleMailTexts> = {
  fr: {
    subject: "Vous êtes désormais {role} sur BledWay",
    preheader: "Votre nouveau rôle est actif : l'espace équipe vous attend.",
    tagline: "La route du bled, ensemble",
    title: "Votre rôle évolue !",
    hello: "Bonjour {prenom},",
    helloAnon: "Bonjour,",
    intro:
      "{inviteur} vient de vous donner le rôle {role} dans l'espace équipe de BledWay. Merci de nous aider à accompagner les voyageurs, du ferry jusqu'au bled.",
    next: "Le rôle est actif dès maintenant. L'espace équipe n'apparaît pas encore ? Déconnectez-vous puis reconnectez-vous.",
    button: "Ouvrir l'espace équipe",
    footer:
      "Ce changement vous surprend ? Répondez simplement à cet e-mail : nous vérifierons avec vous.",
  },
  en: {
    subject: "You are now {role} on BledWay",
    preheader: "Your new role is active: the team workspace is waiting for you.",
    tagline: "The road home, together",
    title: "Your role has changed!",
    hello: "Hello {prenom},",
    helloAnon: "Hello,",
    intro:
      "{inviteur} has just given you the {role} role in the BledWay team workspace. Thank you for helping travellers on their way home, from the ferry to the final mile.",
    next: "The role is active right away. Can't see the team workspace yet? Sign out and sign in again.",
    button: "Open the team workspace",
    footer: "Not expecting this change? Simply reply to this email and we will check it with you.",
  },
  ar: {
    subject: "أصبحت الآن {role} على BledWay",
    preheader: "دورك الجديد مفعّل: فضاء الفريق في انتظارك.",
    tagline: "طريق البلاد، معًا",
    title: "دورك يتطوّر!",
    hello: "مرحبًا {prenom}،",
    helloAnon: "مرحبًا،",
    intro:
      "منحك {inviteur} دور {role} في فضاء فريق BledWay. شكرًا لمساعدتنا في مرافقة المسافرين من العبّارة حتى البلاد.",
    next: "الدور مفعّل من الآن. لا يظهر فضاء الفريق بعد؟ سجّل الخروج ثم سجّل الدخول من جديد.",
    button: "افتح فضاء الفريق",
    footer: "هل فاجأك هذا التغيير؟ ردّ ببساطة على هذه الرسالة وسنتحقّق من الأمر معك.",
  },
};

export const roleMailTexts = (lang: InviteLang, overrides?: unknown) =>
  textsFor(ROLE_MAIL_DEFAULTS[lang], ROLE_MAIL_LIMITS, overrides, lang);

export function roleEmail(
  lang: InviteLang,
  role: StaffRole,
  name: string,
  inviter: string,
  overrides?: unknown,
) {
  const t = roleMailTexts(lang, overrides);
  const info = roleInfo(lang, role);
  const rtl = info.dir === "rtl";
  const align = rtl ? "right" : "left";
  const font = rtl ? "Tahoma,Arial,sans-serif" : "Arial,sans-serif";
  const vars = { prenom: name.trim(), inviteur: inviter.trim() || info.team, role: info.label };
  const r = (text: string, bold: string[] = []) => rich(text, lang, vars, bold);
  const hello = vars.prenom ? t.hello : t.helloAnon;
  const href = `${SITE}/admin`;
  const subject = plain(t.subject, vars);
  const html = `<!doctype html><html lang="${lang}" dir="${info.dir}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f1ea">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${r(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${info.dir}" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
    <tr><td style="background:#0d3b4f;padding:22px 24px;text-align:${align}">
      <img src="${SITE}/pwa-icon-192.png" width="48" height="48" alt="BledWay" style="border-radius:12px;vertical-align:middle"/>
      <span style="font:800 22px Arial,sans-serif;color:#ffffff;vertical-align:middle;margin:0 10px">BledWay</span>
      <div style="font:14px ${font};color:#cfe7dc;margin-top:6px">${r(t.tagline)}</div>
    </td></tr>
    <tr><td style="padding:26px 24px 6px;text-align:${align}">
      <h1 style="margin:0 0 10px;font:800 24px/1.3 ${font};color:#0d3b4f">${r(t.title)}</h1>
      <p style="margin:0 0 6px;font:15px/1.6 ${font};color:#1f2a37">${r(hello)}</p>
      <p style="margin:0;font:15px/1.6 ${font};color:#1f2a37">${r(t.intro, ["inviteur", "role"])}</p>
    </td></tr>
    <tr><td style="padding:14px 24px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f1;border:1px solid #cfe3d7;border-radius:14px">
        <tr><td style="padding:14px 16px;text-align:${align}">
          <div style="font:700 12px ${font};letter-spacing:.04em;text-transform:uppercase;color:#0e6b3b">${escapeHtml(info.roleTitle)}</div>
          <div style="font:800 19px/1.3 ${font};color:#0d3b4f;margin-top:4px">${escapeHtml(info.label)}</div>
          <div style="font:14px/1.5 ${font};color:#374151;margin-top:4px">${r(info.summary)}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:14px 24px 0;font:14px/1.6 ${font};color:#374151;text-align:${align}">${r(t.next)}</td></tr>
    <tr><td align="center" style="padding:18px 24px 24px">
      <a href="${href}" style="display:inline-block;background:#0e6b3b;color:#ffffff;text-decoration:none;font:700 16px ${font};padding:14px 28px;border-radius:999px">${r(t.button)}</a>
    </td></tr>
    <tr><td style="padding:16px 24px;background:#f7f5ef;font:12px/1.5 ${font};color:#6b7280;text-align:${align}">
      ${r(t.footer)}<br/><a href="${SITE}" style="color:#0e6b3b">bledway.com</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  const p = (s: string) => plain(s, vars);
  const text = [
    p(t.title),
    "",
    p(hello),
    p(t.intro),
    "",
    `${info.roleTitle} : ${info.label}. ${info.summary}`,
    "",
    p(t.next),
    "",
    `${p(t.button)} : ${href}`,
    "",
    p(t.footer),
  ].join("\n");
  return { subject, html, text };
}
