// E-mail d'invitation dans l'équipe BledWay, au même habillage que la bienvenue et les alertes.
// Appelée par le serveur du site (route /api/admin-users) avec la session de l'administrateur :
// la fonction revérifie elle-même que l'appelant est administrateur avant d'envoyer.
// Le lien vient de auth.admin.generateLink (Supabase n'envoie alors rien de lui-même).
// Envoi par Resend depuis contact@bledway.com. Secrets Supabase requis : RESEND_API_KEY.
// Déploiement : verify_jwt false (la session est vérifiée ici, comme pour les autres fonctions).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const SITE = "https://www.bledway.com";
const FROM = "BledWay <contact@bledway.com>";

type Lang = "fr" | "ar" | "en";
type Role = "admin" | "editor" | "moderator" | "none";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Textes des trois langues. Français : apostrophe droite et espaces insécables avant : ? ! */
const TEXT = {
  fr: {
    dir: "ltr",
    team: "L'équipe BledWay",
    tagline: "La route du bled, ensemble",
    subject: (who: string, staff: boolean) =>
      staff ? `${who} vous invite dans l'équipe BledWay` : "Votre invitation sur BledWay",
    preheader: "Créez votre mot de passe en un clic : l'invitation est valable 24 heures.",
    title: (staff: boolean) =>
      staff ? "Bienvenue dans l'équipe&nbsp;!" : "Bienvenue sur BledWay&nbsp;!",
    intro: (who: string, staff: boolean) =>
      staff
        ? `<b>${who}</b> vous invite à rejoindre l'espace équipe de BledWay, l'appli qui accompagne les voyageurs, du ferry jusqu'au bled.`
        : `<b>${who}</b> vous invite à créer votre compte BledWay, l'appli qui accompagne les voyageurs, du ferry jusqu'au bled.`,
    roleTitle: "Votre rôle",
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
    steps: (staff: boolean) => [
      ["Acceptez l'invitation", "Le bouton ci-dessous ouvre BledWay sur votre compte."],
      [
        "Choisissez votre mot de passe",
        "Il vous servira à chaque connexion, sur téléphone comme sur ordinateur.",
      ],
      staff
        ? ["Ouvrez l'espace équipe", "Depuis le menu, ou directement sur bledway.com/admin."]
        : [
            "Préparez votre traversée",
            "Horaires, alertes de retard et salons des voyageurs, au même endroit.",
          ],
    ],
    button: "Accepter l'invitation",
    expiry: (who: string) =>
      `Ce lien est personnel et valable 24 heures. Il a expiré&nbsp;? Demandez à ${who} de vous renvoyer une invitation.`,
    fallback: "Le bouton ne marche pas&nbsp;? Copiez ce lien dans votre navigateur&nbsp;:",
    footer:
      "Vous n'attendiez pas cette invitation&nbsp;? Ignorez simplement ce message : aucun accès ne sera ouvert sans votre clic. Une question&nbsp;? Répondez à cet e-mail.",
  },
  en: {
    dir: "ltr",
    team: "The BledWay team",
    tagline: "The road home, together",
    subject: (who: string, staff: boolean) =>
      staff ? `${who} invited you to join the BledWay team` : "Your invitation to BledWay",
    preheader: "Set your password in one click: this invitation is valid for 24 hours.",
    title: (staff: boolean) => (staff ? "Welcome to the team!" : "Welcome to BledWay!"),
    intro: (who: string, staff: boolean) =>
      staff
        ? `<b>${who}</b> invited you to join the BledWay team workspace. BledWay helps travellers on their way home, from the ferry to the final mile.`
        : `<b>${who}</b> invited you to create your BledWay account. BledWay helps travellers on their way home, from the ferry to the final mile.`,
    roleTitle: "Your role",
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
    steps: (staff: boolean) => [
      ["Accept the invitation", "The button below opens BledWay on your account."],
      [
        "Choose your password",
        "You will use it every time you sign in, on your phone or your computer.",
      ],
      staff
        ? ["Open the team workspace", "From the menu, or directly at bledway.com/admin."]
        : [
            "Plan your crossing",
            "Timetables, delay alerts and traveller lounges, all in one place.",
          ],
    ],
    button: "Accept the invitation",
    expiry: (who: string) =>
      `This link is personal and valid for 24 hours. Has it expired? Ask ${who} to send you a new invitation.`,
    fallback: "Button not working? Copy this link into your browser:",
    footer:
      "Not expecting this invitation? Just ignore this message: no access is opened without your click. Any question? Simply reply to this email.",
  },
  ar: {
    dir: "rtl",
    team: "فريق BledWay",
    tagline: "طريق البلاد، معًا",
    subject: (who: string, staff: boolean) =>
      staff ? `${who} يدعوك للانضمام إلى فريق BledWay` : "دعوتك إلى BledWay",
    preheader: "أنشئ كلمة المرور بنقرة واحدة: الدعوة صالحة لمدة 24 ساعة.",
    title: (staff: boolean) => (staff ? "مرحبًا بك في الفريق!" : "مرحبًا بك في BledWay!"),
    intro: (who: string, staff: boolean) =>
      staff
        ? `يدعوك <b>${who}</b> للانضمام إلى فضاء فريق BledWay، التطبيق الذي يرافق المسافرين من العبّارة حتى البلاد.`
        : `يدعوك <b>${who}</b> لإنشاء حسابك على BledWay، التطبيق الذي يرافق المسافرين من العبّارة حتى البلاد.`,
    roleTitle: "دورك",
    roles: {
      admin: ["مدير", "كامل فضاء الفريق، بما في ذلك الحسابات والأدوار وإرسال الإشعارات."],
      editor: [
        "محرّر",
        "المحتوى: الرحلات والأسطول والموانئ والخطوط والاستيراد والصور ونشرة Flash info.",
      ],
      moderator: ["مشرف", "مساهمات المسافرين: الآراء والصور والبلاغات والأخطاء المُبلَّغ عنها."],
      none: ["مسافر", "حساب مسافر، دون الوصول إلى فضاء الفريق."],
    },
    steps: (staff: boolean) => [
      ["اقبل الدعوة", "يفتح الزر أدناه تطبيق BledWay على حسابك."],
      ["اختر كلمة المرور", "ستستخدمها في كل مرة تسجّل فيها الدخول، على الهاتف أو الحاسوب."],
      staff
        ? ["افتح فضاء الفريق", "من القائمة، أو مباشرة على bledway.com/admin."]
        : ["حضّر رحلتك", "مواعيد العبّارات وتنبيهات التأخير وصالونات المسافرين في مكان واحد."],
    ],
    button: "قبول الدعوة",
    expiry: (who: string) =>
      `هذا الرابط شخصي وصالح لمدة 24 ساعة. انتهت صلاحيته؟ اطلب من ${who} إرسال دعوة جديدة.`,
    fallback: "الزر لا يعمل؟ انسخ هذا الرابط في متصفحك:",
    footer:
      "لم تكن تنتظر هذه الدعوة؟ تجاهل هذه الرسالة ببساطة: لن يُفتح أي وصول دون نقرتك. لديك سؤال؟ ردّ على هذه الرسالة.",
  },
} as const;

export function inviteEmail(lang: Lang, role: Role, inviter: string, link: string) {
  const t = TEXT[lang];
  const staff = role !== "none";
  const who = escape(inviter || t.team);
  const href = escape(link);
  const rtl = t.dir === "rtl";
  const align = rtl ? "right" : "left";
  const font = rtl ? "Tahoma,Arial,sans-serif" : "Arial,sans-serif";
  const [roleLabel, roleSummary] = t.roles[role];
  const steps = t
    .steps(staff)
    .map(
      ([title, text], i) => `
      <tr><td style="padding:9px 0;vertical-align:top;width:38px">
        <div style="width:26px;height:26px;border-radius:13px;background:#0e6b3b;color:#fff;font:700 14px/26px Arial,sans-serif;text-align:center">${i + 1}</div>
      </td><td style="padding:9px 0;font:15px/1.5 ${font};color:#1f2a37;text-align:${align}">
        <b>${title}</b><br/>${text}
      </td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="${lang}" dir="${t.dir}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escape(t.subject(inviter || t.team, staff))}</title></head>
<body style="margin:0;background:#f4f1ea">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${t.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${t.dir}" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
    <tr><td style="background:#0d3b4f;padding:22px 24px;text-align:${align}">
      <img src="${SITE}/pwa-icon-192.png" width="48" height="48" alt="BledWay" style="border-radius:12px;vertical-align:middle"/>
      <span style="font:800 22px Arial,sans-serif;color:#ffffff;vertical-align:middle;margin:0 10px">BledWay</span>
      <div style="font:14px ${font};color:#cfe7dc;margin-top:6px">${t.tagline}</div>
    </td></tr>
    <tr><td style="padding:26px 24px 6px;text-align:${align}">
      <h1 style="margin:0 0 10px;font:800 24px/1.3 ${font};color:#0d3b4f">${t.title(staff)}</h1>
      <p style="margin:0;font:15px/1.6 ${font};color:#1f2a37">${t.intro(who, staff)}</p>
    </td></tr>
    <tr><td style="padding:14px 24px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f1;border:1px solid #cfe3d7;border-radius:14px">
        <tr><td style="padding:14px 16px;text-align:${align}">
          <div style="font:700 12px ${font};letter-spacing:.04em;text-transform:uppercase;color:#0e6b3b">${t.roleTitle}</div>
          <div style="font:800 19px/1.3 ${font};color:#0d3b4f;margin-top:4px">${roleLabel}</div>
          <div style="font:14px/1.5 ${font};color:#374151;margin-top:4px">${roleSummary}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:8px 24px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${t.dir}">${steps}</table>
    </td></tr>
    <tr><td align="center" style="padding:18px 24px 10px">
      <a href="${href}" style="display:inline-block;background:#0e6b3b;color:#ffffff;text-decoration:none;font:700 16px ${font};padding:14px 28px;border-radius:999px">${t.button}</a>
    </td></tr>
    <tr><td style="padding:8px 24px 24px;font:13px/1.6 ${font};color:#4b5563;text-align:${align}">
      ${t.expiry(who)}<br/><br/>${t.fallback}<br/>
      <a href="${href}" dir="ltr" style="color:#0e6b3b;word-break:break-all">${href}</a>
    </td></tr>
    <tr><td style="padding:16px 24px;background:#f7f5ef;font:12px/1.5 ${font};color:#6b7280;text-align:${align}">
      ${t.footer}<br/><a href="${SITE}" style="color:#0e6b3b">bledway.com</a>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
  // Version texte : certains filtres anti-spam pénalisent un e-mail sans texte brut.
  const plain = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  const text = [
    plain(t.title(staff)),
    "",
    plain(t.intro(who, staff)),
    "",
    `${t.roleTitle} : ${roleLabel}. ${roleSummary}`,
    "",
    ...t.steps(staff).map(([a, b], i) => `${i + 1}. ${a} : ${b}`),
    "",
    `${t.button} : ${link}`,
    "",
    plain(t.expiry(who)),
    "",
    plain(t.footer),
  ].join("\n");
  return { subject: t.subject(inviter || t.team, staff), html, text };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false },
  }) as unknown as SupabaseClient;
  // L'appelant doit être un administrateur connecté (jeton de sa session, vérifié par Auth).
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = token ? await db.auth.getUser(token) : { data: { user: null } };
  if (!who?.user) return json({ error: "Session requise" }, 401);
  const { data: isAdmin } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", who.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!isAdmin) return json({ error: "Réservé aux administrateurs" }, 403);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "RESEND_API_KEY manquante" }, 500);
  const body = (await request.json().catch(() => null)) as {
    to?: string;
    link?: string;
    role?: string;
    lang?: string;
  } | null;
  const to = String(body?.to ?? "").trim();
  const link = String(body?.link ?? "");
  const lang: Lang = body?.lang === "ar" || body?.lang === "en" ? body.lang : "fr";
  const role: Role = (["admin", "editor", "moderator"] as const).includes(body?.role as never)
    ? (body!.role as Role)
    : "none";
  // Seuls les liens d'invitation de ce projet Supabase sont acceptés.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || to.length > 255)
    return json({ error: "Adresse invalide" }, 400);
  if (!url || !link.startsWith(`${url}/auth/v1/verify?`))
    return json({ error: "Lien refusé" }, 400);

  // Nom affiché de l'administrateur qui invite : pseudo du profil, sinon « L'équipe BledWay ».
  const { data: profile } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", who.user.id)
    .maybeSingle();
  const inviter = String((profile as { display_name?: string } | null)?.display_name ?? "")
    .trim()
    .slice(0, 60);

  const mail = inviteEmail(lang, role, inviter, link);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      reply_to: "contact@bledway.com",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return json({ sent: false, status: response.status, detail: result }, 502);
  return json({ sent: true });
});
