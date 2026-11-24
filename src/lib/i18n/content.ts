// Contenus éditoriaux (Papiers, guides, photos, sources) dans la langue affichée.
// Les fichiers de src/content restent écrits en français ; leur traduction est un dictionnaire
// « texte français → texte traduit », chargé avec la langue. Un texte absent reste en français.
import { DEFAULT_LOCALE, type Locale } from "./config";
import { localizePlace } from "./places";
import { currentLocale, lazyConst } from "./translate";

type ContentDict = Record<string, string>;
type Pattern = { re: RegExp; out: string };

const DICTS: Partial<Record<Locale, { exact: ContentDict; patterns: Pattern[] }>> = {};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Enregistre un dictionnaire ; « Adulte {0} » vaut pour « Adulte 2 », « Adulte Sami »… */
export function setContentDict(locale: Locale, dict: ContentDict) {
  const exact: ContentDict = {};
  const patterns: Pattern[] = [];
  for (const [fr, out] of Object.entries(dict)) {
    if (!out) continue;
    if (/\{\d+\}/.test(fr)) {
      const parts = fr.split(/\{(\d+)\}/);
      let src = "^";
      const order: number[] = [];
      parts.forEach((part, i) => {
        if (i % 2) {
          order.push(Number(part));
          src += "([\\s\\S]*?)";
        } else src += escape(part);
      });
      const re = new RegExp(src + "$");
      patterns.push({
        re,
        out: out.replace(/\{(\d+)\}/g, (_m, n: string) => `{${order.indexOf(Number(n))}}`),
      });
    } else {
      exact[fr] = out;
      // « \nTexte…\n » : le paragraphe seul se retrouve aussi une fois le texte découpé en lignes.
      if (fr.trim() !== fr && fr.includes("\n")) exact[fr.trim()] ??= out.trim();
    }
  }
  DICTS[locale] = { exact, patterns };
}

/** Le texte d'un contenu dans la langue affichée, sinon tel quel. */
export function tc(text: string): string {
  const locale = currentLocale();
  if (locale === DEFAULT_LOCALE) return text;
  const dict = DICTS[locale];
  if (!dict) return text;
  const hit = dict.exact[text];
  if (hit !== undefined) return hit;
  // Paragraphes assemblés par le code (« A\n\nB ») : chacun est traduit.
  if (text.includes("\n")) return text.split(/(\n+)/).map((part, i) => (i % 2 ? part : tc(part))).join("");
  for (const { re, out } of dict.patterns) {
    const m = re.exec(text);
    if (m) return out.replace(/\{(\d+)\}/g, (_x, n: string) => tc(m[Number(n) + 1] ?? ""));
  }
  // Un nom de lieu seul (« Béjaïa », « Belgique ») : la table des lieux.
  return localizePlace(locale, text);
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Array.isArray(v));

const ORIGINALS = new WeakMap<object, object>();

/** La version française d'un objet traduit par localizeContent (lui-même s'il ne l'a pas été). */
export function originalOf<T extends object>(value: T): T {
  return (ORIGINALS.get(value) as T | undefined) ?? value;
}

/** Copie d'une donnée (objets, tableaux) dont chaque texte est traduit ; en français, la donnée elle-même. */
export function localizeContent<T>(value: T): T {
  if (currentLocale() === DEFAULT_LOCALE) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return tc(v);
    if (Array.isArray(v)) return v.map(walk);
    if (isPlain(v)) {
      const copy = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      ORIGINALS.set(copy, v);
      return copy;
    }
    return v;
  };
  return walk(value) as T;
}

/** Une donnée exportée par src/content qui suit la langue : `export const X = lazyContent([...])`. */
export function lazyContent<T extends object>(value: T): T {
  return lazyConst(() => localizeContent(value));
}
