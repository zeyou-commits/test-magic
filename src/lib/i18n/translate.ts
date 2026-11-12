import { fr, type MessageKey, type PartialMessages } from "./messages/fr";
import { DEFAULT_LOCALE, type Locale } from "./config";

/** Les traductions disponibles. Une langue sans dictionnaire s'affiche entièrement en français. */
export const CATALOGS: Partial<Record<Locale, PartialMessages>> = { fr };

export type TranslateVars = Record<string, string | number>;

function lookup(dict: PartialMessages | undefined, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node !== "" ? node : undefined;
}

/** Le texte d'une clé dans la langue voulue, sinon en français ; « {year} » est remplacé par vars.year. */
export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const text = lookup(CATALOGS[locale], key) ?? lookup(CATALOGS[DEFAULT_LOCALE], key) ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
