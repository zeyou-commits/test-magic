/**
 * Rapprochement des noms d'un fichier d'import (ports, compagnies, navires) avec les fiches
 * BledWay : accents, majuscules, chiffres romains, préfixes de compagnie et petites fautes
 * de frappe sont tolérés. Fonctions pures, testées sans base de données.
 */

export type MatchKind = "port" | "company" | "vessel";

export type MatchCandidate = {
  id: string;
  name: string;
  /** Autres façons d'écrire ce nom (slug, ville…). */
  altNames?: (string | null | undefined)[];
  /** Mots à ignorer pour ce candidat, par ex. le nom de sa compagnie pour un navire. */
  noise?: string[];
};

export type MatchReason = "exact" | "alias" | "spelling" | "prefix" | "close" | "none";

export type MatchResult = {
  id: string | null;
  score: number;
  reason: MatchReason;
  /** Libellé lisible de la raison, affiché à l'écran. */
  why: string;
};

/** Au-delà : rattachement automatique proposé. Entre les deux : à vérifier. */
export const SURE_SCORE = 0.88;
export const REVIEW_SCORE = 0.72;

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };
const FILLERS = new Set([
  "ferry",
  "ferries",
  "ms",
  "mv",
  "m",
  "s",
  "nave",
  "the",
  "de",
  "la",
  "le",
]);

/** Forme de comparaison : sans accents ni ponctuation, chiffres romains en chiffres. */
export function normalizeName(value: string, noise: string[] = []): string {
  const plain = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const noiseWords = new Set<string>(noise.flatMap((item) => normalizeName(item).split(" ")));
  const words = plain
    .split(" ")
    .filter(Boolean)
    .map((word, index) => (index > 0 && ROMAN[word] ? ROMAN[word] : word));
  const kept = words.filter((word) => !noiseWords.has(word) && !FILLERS.has(word));
  return (kept.length ? kept : words).join(" ");
}

/** Clé d'alias enregistrée en base : la forme normalisée simple (sans retirer de bruit). */
export const aliasKey = (value: string) => normalizeName(value);

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

/** Tous les mots (d'au moins 4 lettres au total) de l'un se retrouvent dans l'autre. */
function containsWords(a: string, b: string) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.replace(/ /g, "").length < 4) return false;
  const shortWords = short.split(" ");
  const longWords = long.split(" ");
  // « Tassili » et « Tassili 2 » sont deux navires possibles : un numéro en plus compte.
  const extra = longWords.filter((word) => !shortWords.includes(word));
  if (extra.some((word) => /^\d+$/.test(word))) return false;
  return shortWords.every((word) => longWords.includes(word));
}

export function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Trouve la fiche la plus proche d'un nom brut du fichier. */
export function matchName(
  raw: string,
  candidates: MatchCandidate[],
  aliases: Map<string, string> = new Map(),
): MatchResult {
  const none: MatchResult = { id: null, score: 0, reason: "none", why: "Aucune fiche proche" };
  if (!raw.trim()) return none;
  const known = aliases.get(aliasKey(raw));
  if (known && candidates.some((c) => c.id === known)) {
    return {
      id: known,
      score: 1,
      reason: "alias",
      why: "Correspondance retenue à un import précédent",
    };
  }
  const rawPlain = normalizeName(raw);
  let best = none;
  for (const candidate of candidates) {
    const names = [candidate.name, ...(candidate.altNames ?? [])].filter((name): name is string =>
      Boolean(name),
    );
    for (const name of names) {
      const target = normalizeName(name);
      const rawClean = normalizeName(raw, candidate.noise);
      const targetClean = normalizeName(name, candidate.noise);
      let result: MatchResult;
      if (rawPlain === target) {
        result = {
          id: candidate.id,
          score: 1,
          reason: "exact",
          why: "Identique sans accents ni majuscules",
        };
      } else if (rawClean === targetClean) {
        result = {
          id: candidate.id,
          score: 0.97,
          reason: "prefix",
          why: "Identique sans le nom de la compagnie",
        };
      } else if (containsWords(rawClean, targetClean)) {
        result = {
          id: candidate.id,
          score: 0.9,
          reason: "prefix",
          why: "Même nom, avec des mots en plus",
        };
      } else {
        const score = similarity(rawClean, targetClean);
        result = {
          id: candidate.id,
          score,
          reason: score >= SURE_SCORE ? "spelling" : "close",
          why: score >= SURE_SCORE ? "Très proche : orthographe" : "Ressemble, à vérifier",
        };
      }
      if (result.score > best.score) best = result;
    }
  }
  return best.score >= REVIEW_SCORE ? best : none;
}
