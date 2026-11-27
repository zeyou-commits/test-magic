// Réponses aux voyageurs qui signalent une erreur (« Signaler une erreur ») — 27/11/2026.
// Accusé de réception automatique, réponse de l'équipe selon l'issue, badge « Vigie ».
// Modifiables dans l'admin (Contenus → E-mails → Signalements), par langue, réglage
// « report_replies » ; seuls les champs changés sont enregistrés (voir emailTexts.ts).
// La base relit l'accusé et le badge (fonction private.bw_report_text) : garder les mêmes clés.
// {fiche} devient la fiche signalée (« Marseille → Alger du 27/11 »), {badge} le nom du badge,
// {n} le nombre de fiches corrigées. Au tu, comme les autres notifications de BledWay.

export const REPORT_LANGS = ["fr", "ar", "en"] as const;
export type ReportLang = (typeof REPORT_LANGS)[number];

export const REPORT_OUTCOMES = ["corrected", "forwarded", "already_right", "insufficient"] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

export const REPORT_LIMITS = {
  ackTitle: 80,
  ackBody: 300,
  correctedTitle: 80,
  correctedBody: 400,
  forwardedTitle: 80,
  forwardedBody: 400,
  already_rightTitle: 80,
  already_rightBody: 400,
  insufficientTitle: 80,
  insufficientBody: 400,
  badgeTitle: 80,
  badgeBody: 300,
} as const;
export type ReportTexts = Record<keyof typeof REPORT_LIMITS, string>;

export const REPORT_DEFAULTS: Record<ReportLang, ReportTexts> = {
  fr: {
    ackTitle: "Merci, on vérifie ton signalement",
    ackBody:
      "{fiche} : l'équipe regarde ce que tu as signalé. Tu recevras la réponse ici dès que c'est vérifié.",
    correctedTitle: "Grâce à toi, c'est corrigé ✅",
    correctedBody:
      "{fiche} : on a vérifié et corrigé la fiche. Merci, tous les voyageurs en profitent !",
    forwardedTitle: "Ton signalement est transmis à la compagnie",
    forwardedBody:
      "{fiche} : on a transmis ton signalement à la compagnie pour qu'elle vérifie. Merci de nous avoir prévenus !",
    already_rightTitle: "On a vérifié ton signalement",
    already_rightBody:
      "{fiche} : d'après nos sources, l'information affichée est juste. Merci quand même d'avoir pris le temps de nous prévenir !",
    insufficientTitle: "On n'a pas pu confirmer ton signalement",
    insufficientBody:
      "{fiche} : on n'a pas trouvé assez d'éléments pour corriger. Si tu as une photo ou une source, renvoie un signalement avec plus de détails.",
    badgeTitle: "Nouveau badge : {badge} 🏅",
    badgeBody:
      "Tes signalements ont déjà corrigé {n} fiche(s). Merci de rendre BledWay plus fiable pour tout le monde !",
  },
  ar: {
    ackTitle: "شكرًا، نحن نتحقق من بلاغك",
    ackBody: "{fiche}: فريقنا يراجع ما أبلغت عنه. ستصلك الإجابة هنا فور التحقق.",
    correctedTitle: "بفضلك، تم التصحيح ✅",
    correctedBody: "{fiche}: تحققنا من المعلومة وصححناها. شكرًا لك، كل المسافرين يستفيدون من ذلك!",
    forwardedTitle: "أرسلنا بلاغك إلى الشركة",
    forwardedBody: "{fiche}: أرسلنا بلاغك إلى الشركة لتتحقق منه. شكرًا لأنك نبهتنا!",
    already_rightTitle: "تحققنا من بلاغك",
    already_rightBody:
      "{fiche}: حسب مصادرنا، المعلومة المعروضة صحيحة. شكرًا على وقتك وعلى تنبيهنا!",
    insufficientTitle: "لم نتمكن من تأكيد بلاغك",
    insufficientBody:
      "{fiche}: لم نجد عناصر كافية للتصحيح. إذا كانت لديك صورة أو مصدر، أرسل بلاغًا جديدًا بتفاصيل أكثر.",
    badgeTitle: "شارة جديدة: {badge} 🏅",
    badgeBody: "بلاغاتك صحّحت حتى الآن {n} معلومة. شكرًا لأنك تجعل BledWay أكثر موثوقية للجميع!",
  },
  en: {
    ackTitle: "Thanks, we're checking your report",
    ackBody:
      "{fiche}: the team is looking into what you reported. You'll get the answer here as soon as it's checked.",
    correctedTitle: "Fixed, thanks to you ✅",
    correctedBody: "{fiche}: we checked and corrected it. Thank you, every traveller benefits!",
    forwardedTitle: "Your report was sent to the ferry company",
    forwardedBody:
      "{fiche}: we passed your report on to the company so they can check it. Thanks for letting us know!",
    already_rightTitle: "We checked your report",
    already_rightBody:
      "{fiche}: according to our sources, the information shown is correct. Thanks anyway for taking the time to tell us!",
    insufficientTitle: "We couldn't confirm your report",
    insufficientBody:
      "{fiche}: we didn't find enough to correct it. If you have a photo or a source, send a new report with more details.",
    badgeTitle: "New badge: {badge} 🏅",
    badgeBody:
      "Your reports have already fixed {n} listing(s). Thanks for making BledWay more reliable for everyone!",
  },
};

/** Paliers du badge « Vigie » : fiches corrigées grâce aux signalements (statut « Traité »). */
export const VIGIE_LEVELS = [
  { at: 1, code: "vigie", label: { fr: "Vigie", ar: "الحارس", en: "Lookout" } },
  {
    at: 5,
    code: "vigie_confirmee",
    label: { fr: "Vigie confirmée", ar: "حارس متمرّس", en: "Seasoned lookout" },
  },
  {
    at: 15,
    code: "vigie_or",
    label: { fr: "Vigie d'or", ar: "الحارس الذهبي", en: "Golden lookout" },
  },
  {
    at: 50,
    code: "capitaine_vigies",
    label: { fr: "Capitaine des vigies", ar: "قائد الحراس", en: "Lookout captain" },
  },
] as const;

/** Palier atteint pour un nombre de fiches corrigées (null avant la première). */
export function vigieLevel(fixes: number) {
  let level: (typeof VIGIE_LEVELS)[number] | null = null;
  for (const item of VIGIE_LEVELS) if (fixes >= item.at) level = item;
  return level;
}

/** Remplace {fiche}, {badge}, {n} dans un texte de réponse. */
export function fillReport(text: string, vars: { fiche?: string; badge?: string; n?: number }) {
  return text
    .replaceAll("{fiche}", vars.fiche ?? "")
    .replaceAll("{badge}", vars.badge ?? "")
    .replaceAll("{n}", vars.n == null ? "" : String(vars.n))
    .replace(/^\s*:\s*/, "")
    .trim();
}

/** Langue de réponse : celle du site au moment du signalement, sinon le français. */
export function reportLang(value: unknown): ReportLang {
  return REPORT_LANGS.includes(value as ReportLang) ? (value as ReportLang) : "fr";
}
