import { normalizeText } from "@/lib/ferry/filtering";
import { intlLocale } from "@/lib/i18n";

/**
 * Pourquoi une recherche de traversée ne donne rien ? La 504 ne dit que ce que les données
 * prouvent ; sinon elle avoue ne pas savoir.
 *
 * - "soldOut" : départs existants ce jour-là mais plus de place (prêt pour la billetterie :
 *   inactif tant qu'aucune donnée de disponibilité n'est fournie).
 * - "notPublished" : la date est au-delà du dernier départ publié pour ces ports.
 * - "notThatDay" : la ligne tourne, mais pas ce jour de la semaine.
 * - "unknown" : rien ne l'explique.
 */
export type NoSailingReason =
  | { kind: "soldOut"; count: number }
  | { kind: "notPublished"; publishedUntil: string }
  | { kind: "notThatDay"; weekdays: number[] }
  | { kind: "unknown" };

export function explainNoSailing(input: {
  /** Date demandée (AAAA-MM-JJ) ; sans date, la raison est inconnue. */
  date: string | null;
  /** Tous les jours avec départ pour la recherche (ports, compagnie), sans limite. */
  availableDays: string[];
  /** Dernier départ publié sur les ports cherchés (AAAA-MM-JJ), si connu. */
  publishedUntil?: string | null;
  /** Départs du jour sans place restante (billetterie). */
  soldOutCount?: number;
}): NoSailingReason {
  const { date, availableDays } = input;
  if (input.soldOutCount && input.soldOutCount > 0) {
    return { kind: "soldOut", count: input.soldOutCount };
  }
  if (!date) return { kind: "unknown" };
  if (input.publishedUntil && date > input.publishedUntil) {
    return { kind: "notPublished", publishedUntil: input.publishedUntil };
  }
  // Rythme de la ligne : jours de la semaine vus dans les 4 semaines autour de la date. Il faut
  // au moins 3 départs pour en tirer un rythme, sinon on ne prétend rien.
  const at = Date.parse(`${date}T00:00:00Z`);
  const near = availableDays.filter(
    (day) => Math.abs(Date.parse(`${day}T00:00:00Z`) - at) <= 28 * 86_400_000,
  );
  if (near.length >= 3) {
    const weekdays = [...new Set(near.map((day) => new Date(`${day}T00:00:00Z`).getUTCDay()))];
    const asked = new Date(at).getUTCDay();
    if (weekdays.length < 7 && !weekdays.includes(asked)) {
      // Lundi d'abord, dimanche à la fin.
      return { kind: "notThatDay", weekdays: weekdays.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) };
    }
  }
  return { kind: "unknown" };
}

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function weekdayList(weekdays: number[]) {
  const names = weekdays.map((d) => WEEKDAYS[d]!);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** Nom du jour demandé, ex. « mardi ». */
export function weekdayName(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(intlLocale(), {
    weekday: "long",
    timeZone: "UTC",
  });
}

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/**
 * « Tu voulais dire… ? » : noms proches d'une saisie mal orthographiée (accents et casse
 * ignorés). Compare aussi chaque mot du nom (« Tassili II » répond à « tasili »).
 */
export function closeMatches<T>(term: string, items: T[], name: (item: T) => string, max = 3) {
  const q = normalizeText(term).trim();
  if (q.length < 3) return [];
  const limit = Math.max(1, Math.round(q.length / 3));
  return items
    .map((item) => {
      const full = normalizeText(name(item));
      const parts = [full, ...full.split(/[\s-]+/)];
      const score = Math.min(...parts.map((part) => distance(q, part.slice(0, q.length + 2))));
      return { item, score };
    })
    .filter((entry) => entry.score > 0 && entry.score <= limit)
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map((entry) => entry.item);
}
