/**
 * Règle commune au téléphone et au serveur pour le modèle NSFWJS : une seule décision, deux
 * contrôles. Les photos de plage (maillots) restent permises : seul le contenu explicite est
 * refusé, ou une photo jugée « Sexy » presque sans doute.
 */
export type NsfwScores = Partial<
  Record<"Drawing" | "Hentai" | "Neutral" | "Porn" | "Sexy", number>
>;

export const NSFW_REFUSAL = "Cette photo ne peut pas être publiée.";

export function nsfwScores(list: { className: string; probability: number }[]): NsfwScores {
  return Object.fromEntries(list.map((item) => [item.className, item.probability])) as NsfwScores;
}

/** Explicite : refusée. */
export function isExplicit(scores: NsfwScores) {
  return (scores.Porn ?? 0) + (scores.Hentai ?? 0) >= 0.4 || (scores.Sexy ?? 0) >= 0.9;
}

/** Douteuse : floutée par défaut dans la file de modération (seuil plus bas que le refus). */
export function isDoubtful(scores: NsfwScores) {
  return (scores.Porn ?? 0) + (scores.Hentai ?? 0) >= 0.2 || (scores.Sexy ?? 0) >= 0.6;
}
