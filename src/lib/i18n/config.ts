// Langues de BledWay. Le français est la langue de référence : tout texte manquant ailleurs retombe sur lui.
export const LOCALES = ["fr", "ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/**
 * Langues ouvertes au public. Tant qu'il n'y a que le français, rien ne change à l'écran :
 * pas de sélecteur, pas de détection. Ajouter "ar" ici le jour où sa traduction est prête.
 */
export const ENABLED_LOCALES: readonly Locale[] = ["fr"];

/** Langues qui s'écrivent de droite à gauche. */
const RTL_LOCALES: readonly Locale[] = ["ar"];

export const dirOf = (locale: Locale): "rtl" | "ltr" =>
  RTL_LOCALES.includes(locale) ? "rtl" : "ltr";

export const STORAGE_KEY = "bledway:lang";

const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * La langue à afficher : d'abord le choix du visiteur (s'il est encore ouvert), puis la langue
 * du téléphone (« ar-DZ » donne « ar »), sinon le français.
 */
export function pickLocale(
  deviceLanguages: readonly string[] | undefined,
  saved: string | null | undefined,
  enabled: readonly Locale[] = ENABLED_LOCALES,
): Locale {
  if (isLocale(saved) && enabled.includes(saved)) return saved;
  for (const tag of deviceLanguages ?? []) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base) && enabled.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}
