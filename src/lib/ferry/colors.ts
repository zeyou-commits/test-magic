// Une couleur stable par port, réutilisée pour ses liaisons sur la carte.
const palette = [
  "#1d6fb8",
  "#c2410c",
  "#0f766e",
  "#7c3aed",
  "#b91c1c",
  "#0369a1",
  "#a16207",
  "#15803d",
  "#be185d",
  "#4d7c0f",
  "#0891b2",
  "#7e22ce",
];

function hash(value: string) {
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    sum = (sum * 31 + value.charCodeAt(index)) % 100000;
  }
  return sum;
}

/** Couleur stable d'un port : basée sur son slug, indépendante de l'ordre de chargement. */
export function portColor(slug: string): string {
  return palette[hash(slug) % palette.length] as string;
}
