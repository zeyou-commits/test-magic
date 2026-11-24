import { fr, type MessageKey, type PartialMessages } from "./messages/fr";
import { DEFAULT_LOCALE, type Locale } from "./config";

/** Les traductions disponibles. Une langue sans dictionnaire s'affiche entièrement en français. */
export const CATALOGS: Partial<Record<Locale, PartialMessages>> = { fr };

/**
 * Charge le dictionnaire d'une langue au moment où le visiteur la choisit : les francophones
 * ne téléchargent pas les autres langues. Tant qu'il n'est pas chargé, tout s'affiche en français.
 */
export async function loadCatalog(locale: Locale): Promise<void> {
  if (CATALOGS[locale]) return;
  if (locale === "ar") CATALOGS.ar = (await import("./messages/ar")).ar;
}

export type TranslateVars = Record<string, string | number>;

function lookup(dict: PartialMessages | undefined, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node !== "" ? node : undefined;
}

let current: Locale = DEFAULT_LOCALE;

/** Langue utilisée par tr(). Le fournisseur la règle avant de dessiner l'interface. */
export function setCurrentLocale(locale: Locale) {
  current = locale;
}

/**
 * tr("ui.sailingCard.reserver") : utilisable partout pendant le rendu, même hors d'un composant.
 * Changer de langue redessine toute l'interface, donc ces textes suivent.
 */
export function tr(key: MessageKey, vars?: TranslateVars): string {
  return translate(current, key, vars);
}

/** Code Intl de la langue affichée : dates et nombres. L'arabe d'Algérie garde les chiffres 0-9. */
const INTL: Record<Locale, string> = { fr: "fr-FR", ar: "ar-DZ", en: "en-GB" };
export function intlLocale(): string {
  return INTL[current];
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
/**
 * Un format de date qui suit la langue affichée. S'utilise comme un Intl.DateTimeFormat,
 * y compris déclaré une seule fois en haut d'un fichier.
 */
export function lazyDateFormat(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const get = () => {
    const key = current + JSON.stringify(options ?? {});
    let f = dateCache.get(key);
    if (!f) dateCache.set(key, (f = new Intl.DateTimeFormat(INTL[current], options)));
    return f;
  };
  return {
    format: (d?: Date | number) => get().format(d),
    formatToParts: (d?: Date | number) => get().formatToParts(d),
    formatRange: (a: Date | number, b: Date | number) => get().formatRange(a, b),
    formatRangeToParts: (a: Date | number, b: Date | number) => get().formatRangeToParts(a, b),
    resolvedOptions: () => get().resolvedOptions(),
  } as Intl.DateTimeFormat;
}

const numberCache = new Map<string, Intl.NumberFormat>();
/** Même principe pour les nombres. */
export function lazyNumberFormat(options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const get = () => {
    const key = current + JSON.stringify(options ?? {});
    let f = numberCache.get(key);
    if (!f) numberCache.set(key, (f = new Intl.NumberFormat(INTL[current], options)));
    return f;
  };
  return {
    format: (n: number | bigint) => get().format(n),
    formatToParts: (n?: number | bigint) => get().formatToParts(n),
    resolvedOptions: () => get().resolvedOptions(),
  } as Intl.NumberFormat;
}

/** Le texte d'une clé dans la langue voulue, sinon en français ; « {year} » est remplacé par vars.year. */
export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const text = lookup(CATALOGS[locale], key) ?? lookup(CATALOGS[DEFAULT_LOCALE], key) ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
