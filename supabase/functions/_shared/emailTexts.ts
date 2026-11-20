// Outils communs aux e-mails modifiables dans l'admin (rubrique « E-mails »).
// Chaque modèle garde ses textes d'origine ; l'admin n'enregistre que ce qu'il change, par langue :
// { fr: { champ: "texte" }, ar: {…}, en: {…} } dans bw_admin_settings. Aucun import : le fichier
// tourne sous Deno (fonctions Edge) comme dans le site (aperçu de l'admin).

export const SITE = "https://www.bledway.com";
export type Texts = Record<string, string>;

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * Textes à utiliser dans une langue : ceux de l'admin quand ils sont remplis et pas trop longs,
 * sinon ceux d'origine. Accepte n'importe quelle valeur lue en base, sans jamais échouer.
 */
export function textsFor<T extends Texts>(
  defaults: T,
  limits: Record<keyof T, number>,
  overrides: unknown,
  lang: string,
): T {
  const source =
    overrides && typeof overrides === "object"
      ? (overrides as Record<string, unknown>)[lang]
      : undefined;
  const custom = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const value = custom[key];
    if (typeof value === "string" && value.trim() && value.length <= limits[key])
      (out as Texts)[key] = value.trim();
  }
  return out;
}

/** Ne garde, langue par langue, que les champs qui diffèrent du texte d'origine. */
export function changedOnly(
  defaults: Record<string, Texts>,
  all: Record<string, Texts>,
): Record<string, Texts> {
  const result: Record<string, Texts> = {};
  for (const lang of Object.keys(defaults)) {
    const changed: Texts = {};
    for (const key of Object.keys(defaults[lang]!)) {
      const value = (all[lang]?.[key] ?? "").trim();
      if (value && value !== defaults[lang]![key]) changed[key] = value;
    }
    if (Object.keys(changed).length) result[lang] = changed;
  }
  return result;
}

/**
 * Texte saisi → HTML : échappé, {variables} remplacées (valeurs échappées, en gras si demandé),
 * espaces insécables du français devant : ; ? ! » et après «.
 */
export function rich(
  text: string,
  lang: string,
  vars: Record<string, string> = {},
  bold: string[] = [],
) {
  let html = escapeHtml(text);
  for (const [name, value] of Object.entries(vars)) {
    const safe = escapeHtml(value);
    html = html.split(`{${name}}`).join(bold.includes(name) ? `<b>${safe}</b>` : safe);
  }
  if (lang === "fr") html = html.replace(/ ([:;?!»])/g, "&nbsp;$1").replace(/« /g, "«&nbsp;");
  return html;
}

/** Même remplacement, en texte brut (objet, version texte de l'e-mail). */
export function plain(text: string, vars: Record<string, string> = {}) {
  let out = text;
  for (const [name, value] of Object.entries(vars)) out = out.split(`{${name}}`).join(value);
  return out;
}
