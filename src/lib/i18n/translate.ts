import { fr, type MessageKey, type PartialMessages } from "./messages/fr";
import { DEFAULT_LOCALE, dirOf, type Locale } from "./config";
import { localizePlace } from "./places";

/** Les traductions disponibles. Une langue sans dictionnaire s'affiche entièrement en français. */
export const CATALOGS: Partial<Record<Locale, PartialMessages>> = { fr };

/**
 * Charge le dictionnaire d'une langue au moment où le visiteur la choisit : les francophones
 * ne téléchargent pas les autres langues. Tant qu'il n'est pas chargé, tout s'affiche en français.
 */
export async function loadCatalog(locale: Locale): Promise<void> {
  if (CATALOGS[locale]) return;
  if (locale === "ar") {
    const [{ ar }, { arContent }, { setContentDict }] = await Promise.all([
      import("./messages/ar"),
      import("./messages/ar.content"),
      import("./content"),
    ]);
    setContentDict("ar", arContent);
    CATALOGS.ar = ar;
  }
}

export type TranslateVars = Record<string, string | number | boolean | null | undefined>;

function lookup(dict: PartialMessages | undefined, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node !== "" ? node : undefined;
}

let current: Locale = DEFAULT_LOCALE;

/** La langue affichée en ce moment. */
export function currentLocale(): Locale {
  return current;
}

/** Langue utilisée par tr(). Le fournisseur la règle avant de dessiner l'interface. */
export function setCurrentLocale(locale: Locale) {
  current = locale;
}

/**
 * Une liste ou un objet de libellés déclaré une seule fois en haut d'un fichier, mais relu dans la
 * langue affichée : `const WORDS = lazyConst(() => [tr("…"), tr("…")])`. Une copie par langue.
 */
export function lazyConst<T extends object>(make: () => T): T {
  const cache = new Map<Locale, T>();
  const get = (): T => {
    let value = cache.get(current);
    if (!value) cache.set(current, (value = make()));
    return value;
  };
  const target = (Array.isArray(get()) ? [] : {}) as T;
  return new Proxy(target, {
    get: (_t, prop) => {
      const value = get();
      const out = Reflect.get(value, prop, value);
      return typeof out === "function" ? out.bind(value) : out;
    },
    has: (_t, prop) => Reflect.has(get(), prop),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, prop): PropertyDescriptor | undefined => {
      const d = Reflect.getOwnPropertyDescriptor(get(), prop);
      return d ? { ...d, configurable: prop === "length" ? Boolean(d.configurable) : true } : undefined;
    },
  });
}

/**
 * tr("ui.sailingCard.reserver") : utilisable partout pendant le rendu, même hors d'un composant.
 * Changer de langue redessine toute l'interface, donc ces textes suivent.
 */
export function tr(key: MessageKey, vars?: TranslateVars): string {
  return translate(current, key, vars);
}

/** Code Intl de la langue affichée : dates et nombres. L'arabe d'Algérie garde les chiffres 0-9. */
// Arabe : heures sur 24 h (« -u-hc-h23 »), comme les horaires des compagnies, pas « 11:00 م ».
const INTL: Record<Locale, string> = { fr: "fr-FR", ar: "ar-DZ-u-hc-h23", en: "en-GB" };
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
  let text = lookup(CATALOGS[locale], key) ?? lookup(CATALOGS[DEFAULT_LOCALE], key) ?? key;
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, name: string) => {
      if (!(name in vars)) return match;
      const value = String(vars[name]);
      if (locale === DEFAULT_LOCALE) return value;
      // « traversée{v} » : la marque du pluriel français (s, x, es, e) n'a pas de sens dans les autres langues.
      if (/^(s|x|es|e)$/.test(value)) return "";
      // Un nom de port ou de pays passé en variable s'affiche dans la langue du visiteur.
      return localizePlace(locale, value);
    });
  }
  // En arabe, la flèche d'un trajet pointe dans le sens de la lecture (de droite à gauche).
  return dirOf(locale) === "rtl" ? text.replace(/→/g, "←") : text;
}

/** {placeName(port.name)} : le nom d'un lieu dans la langue affichée ; les données restent en français. */
export function placeName(name: string): string;
export function placeName(name: string | null | undefined): string | null | undefined;
export function placeName(name: string | null | undefined) {
  return name ? localizePlace(current, name) : name;
}
