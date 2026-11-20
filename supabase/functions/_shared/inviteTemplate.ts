// Modèle de l'e-mail d'invitation dans l'équipe, partagé par la fonction d'envoi
// (team-invite-email) et l'aperçu de la rubrique « E-mails » de l'admin.
// Les textes sont modifiables dans l'admin (réglage « email_invite ») ; un champ vide reprend
// le texte d'origine ci-dessous. Aucun import : le fichier tourne sous Deno comme dans le site.

export const INVITE_LANGS = ["fr", "ar", "en"] as const;
export type InviteLang = (typeof INVITE_LANGS)[number];
export type InviteRole = "admin" | "editor" | "moderator" | "none";

/** Les textes modifiables. {inviteur} est remplacé par le pseudo de l'administrateur qui invite. */
export type InviteTexts = {
  subject: string;
  subjectTraveller: string;
  preheader: string;
  tagline: string;
  title: string;
  titleTraveller: string;
  intro: string;
  introTraveller: string;
  step1Title: string;
  step1: string;
  step2Title: string;
  step2: string;
  step3Title: string;
  step3: string;
  step3TitleTraveller: string;
  step3Traveller: string;
  button: string;
  expiry: string;
  footer: string;
};
export type InviteTextKey = keyof InviteTexts;
export type InviteOverrides = Partial<Record<InviteLang, Partial<InviteTexts>>>;

/** Longueur maximale de chaque champ (objet et titres courts, paragraphes plus longs). */
export const INVITE_LIMITS: Record<InviteTextKey, number> = {
  subject: 150,
  subjectTraveller: 150,
  preheader: 200,
  tagline: 80,
  title: 120,
  titleTraveller: 120,
  intro: 600,
  introTraveller: 600,
  step1Title: 80,
  step1: 300,
  step2Title: 80,
  step2: 300,
  step3Title: 80,
  step3: 300,
  step3TitleTraveller: 80,
  step3Traveller: 300,
  button: 60,
  expiry: 400,
  footer: 400,
};

export const INVITE_DEFAULTS: Record<InviteLang, InviteTexts> = {
  fr: {
    subject: "{inviteur} vous invite dans l'équipe BledWay",
    subjectTraveller: "Votre invitation sur BledWay",
    preheader: "Créez votre mot de passe en un clic : l'invitation est valable 24 heures.",
    tagline: "La route du bled, ensemble",
    title: "Bienvenue dans l'équipe !",
    titleTraveller: "Bienvenue sur BledWay !",
    intro:
      "{inviteur} vous invite à rejoindre l'espace équipe de BledWay, l'appli qui accompagne les voyageurs, du ferry jusqu'au bled.",
    introTraveller:
      "{inviteur} vous invite à créer votre compte BledWay, l'appli qui accompagne les voyageurs, du ferry jusqu'au bled.",
    step1Title: "Acceptez l'invitation",
    step1: "Le bouton ci-dessous ouvre BledWay sur votre compte.",
    step2Title: "Choisissez votre mot de passe",
    step2: "Il vous servira à chaque connexion, sur téléphone comme sur ordinateur.",
    step3Title: "Ouvrez l'espace équipe",
    step3: "Depuis le menu, ou directement sur bledway.com/admin.",
    step3TitleTraveller: "Préparez votre traversée",
    step3Traveller: "Horaires, alertes de retard et salons des voyageurs, au même endroit.",
    button: "Accepter l'invitation",
    expiry:
      "Ce lien est personnel et valable 24 heures. Il a expiré ? Demandez à {inviteur} de vous renvoyer une invitation.",
    footer:
      "Vous n'attendiez pas cette invitation ? Ignorez simplement ce message : aucun accès ne sera ouvert sans votre clic. Une question ? Répondez à cet e-mail.",
  },
  en: {
    subject: "{inviteur} invited you to join the BledWay team",
    subjectTraveller: "Your invitation to BledWay",
    preheader: "Set your password in one click: this invitation is valid for 24 hours.",
    tagline: "The road home, together",
    title: "Welcome to the team!",
    titleTraveller: "Welcome to BledWay!",
    intro:
      "{inviteur} invited you to join the BledWay team workspace. BledWay helps travellers on their way home, from the ferry to the final mile.",
    introTraveller:
      "{inviteur} invited you to create your BledWay account. BledWay helps travellers on their way home, from the ferry to the final mile.",
    step1Title: "Accept the invitation",
    step1: "The button below opens BledWay on your account.",
    step2Title: "Choose your password",
    step2: "You will use it every time you sign in, on your phone or your computer.",
    step3Title: "Open the team workspace",
    step3: "From the menu, or directly at bledway.com/admin.",
    step3TitleTraveller: "Plan your crossing",
    step3Traveller: "Timetables, delay alerts and traveller lounges, all in one place.",
    button: "Accept the invitation",
    expiry:
      "This link is personal and valid for 24 hours. Has it expired? Ask {inviteur} to send you a new invitation.",
    footer:
      "Not expecting this invitation? Just ignore this message: no access is opened without your click. Any question? Simply reply to this email.",
  },
  ar: {
    subject: "{inviteur} يدعوك للانضمام إلى فريق BledWay",
    subjectTraveller: "دعوتك إلى BledWay",
    preheader: "أنشئ كلمة المرور بنقرة واحدة: الدعوة صالحة لمدة 24 ساعة.",
    tagline: "طريق البلاد، معًا",
    title: "مرحبًا بك في الفريق!",
    titleTraveller: "مرحبًا بك في BledWay!",
    intro:
      "يدعوك {inviteur} للانضمام إلى فضاء فريق BledWay، التطبيق الذي يرافق المسافرين من العبّارة حتى البلاد.",
    introTraveller:
      "يدعوك {inviteur} لإنشاء حسابك على BledWay، التطبيق الذي يرافق المسافرين من العبّارة حتى البلاد.",
    step1Title: "اقبل الدعوة",
    step1: "يفتح الزر أدناه تطبيق BledWay على حسابك.",
    step2Title: "اختر كلمة المرور",
    step2: "ستستخدمها في كل مرة تسجّل فيها الدخول، على الهاتف أو الحاسوب.",
    step3Title: "افتح فضاء الفريق",
    step3: "من القائمة، أو مباشرة على bledway.com/admin.",
    step3TitleTraveller: "حضّر رحلتك",
    step3Traveller: "مواعيد العبّارات وتنبيهات التأخير وصالونات المسافرين في مكان واحد.",
    button: "قبول الدعوة",
    expiry:
      "هذا الرابط شخصي وصالح لمدة 24 ساعة. انتهت صلاحيته؟ اطلب من {inviteur} إرسال دعوة جديدة.",
    footer:
      "لم تكن تنتظر هذه الدعوة؟ تجاهل هذه الرسالة ببساطة: لن يُفتح أي وصول دون نقرتك. لديك سؤال؟ ردّ على هذه الرسالة.",
  },
};

/** Ce qui suit les rôles du site : pas modifiable ici (libellés tenus par le catalogue des rôles). */
const FIXED = {
  fr: {
    dir: "ltr",
    team: "L'équipe BledWay",
    roleTitle: "Votre rôle",
    fallback: "Le bouton ne marche pas ? Copiez ce lien dans votre navigateur :",
    roles: {
      admin: [
        "Administrateur",
        "Tout l'espace équipe, dont les comptes, les rôles et l'envoi de notifications.",
      ],
      editor: [
        "Éditeur",
        "Le contenu : traversées, flotte, ports, liaisons, imports, illustrations et Flash info.",
      ],
      moderator: [
        "Modérateur",
        "Les contributions des voyageurs : avis, photos, signalements et erreurs signalées.",
      ],
      none: ["Voyageur", "Un compte voyageur, sans accès à l'espace équipe."],
    },
  },
  en: {
    dir: "ltr",
    team: "The BledWay team",
    roleTitle: "Your role",
    fallback: "Button not working? Copy this link into your browser:",
    roles: {
      admin: [
        "Administrator",
        "The whole team workspace, including accounts, roles and notifications.",
      ],
      editor: [
        "Editor",
        "Content: crossings, fleet, ports, routes, imports, illustrations and Flash info.",
      ],
      moderator: [
        "Moderator",
        "Traveller contributions: reviews, photos, reports and flagged errors.",
      ],
      none: ["Traveller", "A traveller account, without access to the team workspace."],
    },
  },
  ar: {
    dir: "rtl",
    team: "فريق BledWay",
    roleTitle: "دورك",
    fallback: "الزر لا يعمل؟ انسخ هذا الرابط في متصفحك:",
    roles: {
      admin: ["مدير", "كامل فضاء الفريق، بما في ذلك الحسابات والأدوار وإرسال الإشعارات."],
      editor: [
        "محرّر",
        "المحتوى: الرحلات والأسطول والموانئ والخطوط والاستيراد والصور ونشرة Flash info.",
      ],
      moderator: ["مشرف", "مساهمات المسافرين: الآراء والصور والبلاغات والأخطاء المُبلَّغ عنها."],
      none: ["مسافر", "حساب مسافر، دون الوصول إلى فضاء الفريق."],
    },
  },
} as const;

const SITE = "https://www.bledway.com";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * Textes à utiliser : ceux de l'admin quand ils sont remplis et valides, sinon ceux d'origine.
 * Accepte n'importe quelle valeur lue en base (jamais d'erreur sur une donnée inattendue).
 */
export function inviteTexts(lang: InviteLang, overrides?: unknown): InviteTexts {
  const base = INVITE_DEFAULTS[lang];
  const source =
    overrides && typeof overrides === "object"
      ? (overrides as Record<string, unknown>)[lang]
      : undefined;
  const custom = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  const out = { ...base };
  for (const key of Object.keys(base) as InviteTextKey[]) {
    const value = custom[key];
    if (typeof value === "string" && value.trim() && value.length <= INVITE_LIMITS[key])
      out[key] = value.trim();
  }
  return out;
}

/** Ne garde que les champs qui diffèrent du texte d'origine (ce qui est enregistré en base). */
export function inviteOverridesOnly(all: Record<InviteLang, InviteTexts>): InviteOverrides {
  const result: InviteOverrides = {};
  for (const lang of INVITE_LANGS) {
    const changed: Partial<InviteTexts> = {};
    for (const key of Object.keys(INVITE_DEFAULTS[lang]) as InviteTextKey[]) {
      const value = all[lang][key].trim();
      if (value && value !== INVITE_DEFAULTS[lang][key]) changed[key] = value;
    }
    if (Object.keys(changed).length) result[lang] = changed;
  }
  return result;
}

/** Texte brut → HTML : échappé, {inviteur} remplacé, espaces insécables du français. */
function rich(text: string, lang: InviteLang, who: string, bold: boolean) {
  let html = escapeHtml(text).replace(/\{inviteur\}/g, bold ? `<b>${who}</b>` : who);
  if (lang === "fr") html = html.replace(/ ([:;?!»])/g, "&nbsp;$1").replace(/« /g, "«&nbsp;");
  return html;
}

export function inviteEmail(
  lang: InviteLang,
  role: InviteRole,
  inviter: string,
  link: string,
  overrides?: unknown,
) {
  const t = inviteTexts(lang, overrides);
  const f = FIXED[lang];
  const staff = role !== "none";
  const name = inviter.trim() || f.team;
  const who = escapeHtml(name);
  const href = escapeHtml(link);
  const rtl = f.dir === "rtl";
  const align = rtl ? "right" : "left";
  const font = rtl ? "Tahoma,Arial,sans-serif" : "Arial,sans-serif";
  const [roleLabel, roleSummary] = f.roles[role];
  const r = (text: string, bold = false) => rich(text, lang, who, bold);
  const stepList: [string, string][] = [
    [t.step1Title, t.step1],
    [t.step2Title, t.step2],
    staff ? [t.step3Title, t.step3] : [t.step3TitleTraveller, t.step3Traveller],
  ];
  const subject = (staff ? t.subject : t.subjectTraveller).replace(/\{inviteur\}/g, name);
  const title = staff ? t.title : t.titleTraveller;
  const intro = staff ? t.intro : t.introTraveller;
  const steps = stepList
    .map(
      ([stepTitle, text], i) => `
      <tr><td style="padding:9px 0;vertical-align:top;width:38px">
        <div style="width:26px;height:26px;border-radius:13px;background:#0e6b3b;color:#fff;font:700 14px/26px Arial,sans-serif;text-align:center">${i + 1}</div>
      </td><td style="padding:9px 0;font:15px/1.5 ${font};color:#1f2a37;text-align:${align}">
        <b>${r(stepTitle)}</b><br/>${r(text)}
      </td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="${lang}" dir="${f.dir}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f1ea">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${r(t.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${f.dir}" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
    <tr><td style="background:#0d3b4f;padding:22px 24px;text-align:${align}">
      <img src="${SITE}/pwa-icon-192.png" width="48" height="48" alt="BledWay" style="border-radius:12px;vertical-align:middle"/>
      <span style="font:800 22px Arial,sans-serif;color:#ffffff;vertical-align:middle;margin:0 10px">BledWay</span>
      <div style="font:14px ${font};color:#cfe7dc;margin-top:6px">${r(t.tagline)}</div>
    </td></tr>
    <tr><td style="padding:26px 24px 6px;text-align:${align}">
      <h1 style="margin:0 0 10px;font:800 24px/1.3 ${font};color:#0d3b4f">${r(title)}</h1>
      <p style="margin:0;font:15px/1.6 ${font};color:#1f2a37">${r(intro, true)}</p>
    </td></tr>
    <tr><td style="padding:14px 24px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f1;border:1px solid #cfe3d7;border-radius:14px">
        <tr><td style="padding:14px 16px;text-align:${align}">
          <div style="font:700 12px ${font};letter-spacing:.04em;text-transform:uppercase;color:#0e6b3b">${f.roleTitle}</div>
          <div style="font:800 19px/1.3 ${font};color:#0d3b4f;margin-top:4px">${roleLabel}</div>
          <div style="font:14px/1.5 ${font};color:#374151;margin-top:4px">${r(roleSummary)}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:8px 24px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${f.dir}">${steps}</table>
    </td></tr>
    <tr><td align="center" style="padding:18px 24px 10px">
      <a href="${href}" style="display:inline-block;background:#0e6b3b;color:#ffffff;text-decoration:none;font:700 16px ${font};padding:14px 28px;border-radius:999px">${r(t.button)}</a>
    </td></tr>
    <tr><td style="padding:8px 24px 24px;font:13px/1.6 ${font};color:#4b5563;text-align:${align}">
      ${r(t.expiry)}<br/><br/>${r(f.fallback)}<br/>
      <a href="${href}" dir="ltr" style="color:#0e6b3b;word-break:break-all">${href}</a>
    </td></tr>
    <tr><td style="padding:16px 24px;background:#f7f5ef;font:12px/1.5 ${font};color:#6b7280;text-align:${align}">
      ${r(t.footer)}<br/><a href="${SITE}" style="color:#0e6b3b">bledway.com</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  // Version texte : certains filtres anti-spam pénalisent un e-mail sans texte brut.
  const plain = (s: string) => s.replace(/\{inviteur\}/g, name);
  const text = [
    plain(title),
    "",
    plain(intro),
    "",
    `${f.roleTitle} : ${roleLabel}. ${roleSummary}`,
    "",
    ...stepList.map(([a, b], i) => `${i + 1}. ${plain(a)} : ${plain(b)}`),
    "",
    `${plain(t.button)} : ${link}`,
    "",
    plain(t.expiry),
    "",
    plain(t.footer),
  ].join("\n");
  return { subject, html, text };
}
