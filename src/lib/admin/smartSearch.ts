/**
 * Recherche « intelligente » de l'espace équipe : on tape librement (compagnie, navire, port,
 * jour, heure, statut) et chaque mot doit se retrouver quelque part dans la ligne.
 * Sans accents ni majuscules : « bejaia » trouve « Béjaïa », « annulee » trouve « Annulée ».
 */
export const plainText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr")
    .trim();

export function smartMatch(query: string, parts: (string | null | undefined)[]) {
  const words = plainText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = plainText(parts.filter(Boolean).join(" · "));
  return words.every((word) => haystack.includes(word));
}

/** Les mots-clés de statut ajoutés à chaque départ, pour les retrouver en tapant. */
export function departureKeywords(input: {
  status: string;
  vesselId: string | null;
}) {
  return [
    input.status === "cancelled" ? "annulée annulé" : input.status === "modified" ? "modifiée" : "prévue",
    input.vesselId ? null : "à choisir sans navire bateau à choisir",
  ];
}
