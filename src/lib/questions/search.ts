import type { Article } from "@/content/types";
import type { PrepItem } from "@/lib/ferry/preparation";

/**
 * « Une question ? » : la recherche dans ce que BledWay sait déjà (questions fréquentes,
 * dossiers du guide, conseils de préparation). Tout se passe sur l'appareil, sans service payant.
 */
export type HelpSource = "ligne" | "faq" | "guide" | "preparation";

export type HelpAnswer = {
  id: string;
  q: string;
  a: string;
  source: HelpSource;
  /** Page où lire la suite (dossier du guide, page de l'appli). */
  href?: string;
  hrefLabel?: string;
  /** Titre du dossier d'où vient la réponse. */
  from?: string;
};

export const SOURCE_LABELS: Record<HelpSource, string> = {
  ligne: "Cette ligne",
  faq: "Questions fréquentes",
  guide: "Dossier du guide",
  preparation: "Préparation du voyage",
};

/** Le corpus : la ligne d'abord (si on en regarde une), puis le général, le guide, la préparation. */
export function buildCorpus({
  line = [],
  general = [],
  articles = [],
  prep = [],
}: {
  line?: { q: string; a: string }[];
  general?: { q: string; a: string }[];
  articles?: Pick<Article, "slug" | "title" | "answer" | "faq">[];
  prep?: PrepItem[];
}): HelpAnswer[] {
  const out: HelpAnswer[] = [];
  const seen = new Set<string>();
  const push = (answer: HelpAnswer) => {
    const key = plain(answer.q);
    if (!answer.a.trim() || seen.has(key)) return;
    seen.add(key);
    out.push(answer);
  };
  line.forEach((item, index) => push({ id: `ligne-${index}`, ...item, source: "ligne" }));
  general.forEach((item, index) => push({ id: `faq-${index}`, ...item, source: "faq" }));
  for (const article of articles) {
    const href = `/guide/${article.slug}`;
    push({
      id: `guide-${article.slug}`,
      q: article.title,
      a: article.answer,
      source: "guide",
      href,
      hrefLabel: "Lire le dossier",
    });
    article.faq.forEach((item, index) =>
      push({
        id: `guide-${article.slug}-${index}`,
        ...item,
        source: "guide",
        href,
        hrefLabel: "Lire le dossier",
        from: article.title,
      }),
    );
  }
  for (const item of prep) {
    if (!item.tip) continue;
    push({
      id: `prep-${item.id}`,
      q: item.label,
      a: item.tip,
      source: "preparation",
      ...(item.href ? { href: item.href, hrefLabel: item.linkLabel ?? "En savoir plus" } : {}),
    });
  }
  return out;
}

/** Sans accents ni majuscules ni ponctuation. */
export const plain = (value: string) =>
  value
    // « 10 000 € » et « 10000 » : le même nombre.
    .replace(/(\d)[\s  .](?=\d{3}\b)/g, "$1")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9€\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(
  (
    "a au aux avec ce ces cette dans de des du elle en est et il je la le les leur ma mais me mes mon " +
    "ne nous on ou par pas pour qu que quel quelle quelles quels qui sa se ses son sont sur ta te tes " +
    "ton tu un une vos votre vous y ai as avez peut peux faut il-y comment combien est-ce quoi " +
    "dois doit faire fait bien tres plus moins si c d j l m n s t"
  ).split(" "),
);

/** Mots voisins : on trouve « véhicule » en cherchant « voiture », « animal » avec « chien »… */
const SYNONYMS: string[][] = [
  ["voiture", "vehicule", "auto", "automobile", "camping", "remorque", "moto"],
  ["ferry", "bateau", "navire", "traversee"],
  ["papiers", "documents", "passeport", "passeports", "visa", "carte", "identite", "formalites"],
  ["argent", "especes", "euros", "devises", "dinars", "liquide", "10000"],
  ["douane", "douanes", "declaration", "declarer", "controle", "controles"],
  ["enfant", "enfants", "bebe", "famille", "mineur", "poussette"],
  ["animal", "animaux", "chien", "chat", "chiens", "chats"],
  ["prix", "cout", "tarif", "tarifs", "cher", "budget", "payer", "euros"],
  ["heure", "horaire", "horaires", "arriver", "presentation", "avance", "embarquement", "embarquer"],
  ["retard", "retards", "annule", "annulation", "reporte", "decale"],
  ["port", "quai", "terminal", "gare"],
  ["cabine", "fauteuil", "couchette", "siege", "dormir"],
  ["duree", "temps", "longtemps", "heures"],
  ["tpd", "temporaire", "admission"],
  ["importer", "importation", "dedouaner", "dedouanement"],
  ["billet", "billets", "reservation", "reserver", "reservations"],
];
const SYNONYM_OF = new Map<string, string[]>();
for (const group of SYNONYMS)
  for (const word of group) SYNONYM_OF.set(word, [...new Set([...(SYNONYM_OF.get(word) ?? []), ...group])]);

/** Une forme courte : « voitures », « voiture » et « voiturer » se rejoignent. */
const stem = (word: string) =>
  word.length > 4 ? word.replace(/(ements|ement|ations|ation|euses|euse|ees|es|s|x|e)$/, "") : word;

export const queryTerms = (query: string) =>
  plain(query)
    .split(" ")
    .filter((word) => word.length > 1 && !STOP.has(word));

/** Une faute de frappe près (pour les mots assez longs). */
function near(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Le mot de la question se retrouve-t-il dans ce texte (déjà découpé) ? 2 = exact, 1 = voisin. */
function matchIn(term: string, words: string[]) {
  const forms = SYNONYM_OF.get(term) ?? [term];
  const termStem = stem(term);
  let best = 0;
  for (const word of words) {
    if (word === term || stem(word) === termStem) return 2;
    if (term.length >= 4 && word.startsWith(term)) best = Math.max(best, 2);
    else if (forms.includes(word) || forms.some((form) => stem(form) === stem(word)))
      best = Math.max(best, 1);
    else if (term.length >= 5 && word.length >= 5 && near(stem(term), stem(word)))
      best = Math.max(best, 0.75);
  }
  return best;
}

export type HelpHit = HelpAnswer & { score: number };

/** Les réponses les plus proches de la question, les mieux couvertes d'abord. */
export function searchHelp(corpus: HelpAnswer[], query: string, limit = 20): HelpHit[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const hits: HelpHit[] = [];
  for (const answer of corpus) {
    const inQuestion = plain(answer.q).split(" ");
    const inAnswer = plain(`${answer.a} ${answer.from ?? ""}`).split(" ");
    let score = 0;
    let covered = 0;
    for (const term of terms) {
      const q = matchIn(term, inQuestion);
      const a = matchIn(term, inAnswer);
      if (q || a) covered++;
      score += q * 3 + a;
    }
    // Il faut retrouver la majorité des mots cherchés (un seul suffit pour une question d'un mot).
    if (!covered || covered < Math.ceil(terms.length / 2)) continue;
    const boost = answer.source === "ligne" ? 1.2 : answer.source === "faq" ? 1.1 : 1;
    hits.push({ ...answer, score: score * (covered / terms.length) * boost });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Les mots du texte à surligner : ceux qui répondent à un mot de la question. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = queryTerms(query);
  if (!terms.length) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  for (const piece of text.split(/(\s+)/)) {
    const words = plain(piece).split(" ").filter(Boolean);
    const hit = words.length > 0 && terms.some((term) => matchIn(term, words) >= 1);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += piece;
    else parts.push({ text: piece, hit });
  }
  return parts;
}

/** La question à confier à un assistant IA : avec le contexte du voyage, et une demande de sources. */
export function assistantPrompt(query: string, line?: string | null) {
  return [
    line
      ? `Je prépare une traversée en ferry ${line} (entre l'Europe et l'Algérie).`
      : "Je prépare une traversée en ferry entre l'Europe et l'Algérie.",
    `Ma question : ${query.trim()}`,
    "Réponds en français, simplement, et indique les sources officielles à vérifier (douane, compagnie, consulat).",
  ].join("\n");
}
