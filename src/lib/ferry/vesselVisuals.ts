/** Rendus fournis par BledWay, associés uniquement au nom exact du navire. */
const visuals: Record<string, string> = {
  "rosalind franklin": "/vessel-visuals/rosalind-franklin.jpeg",
};

export function vesselVisual(name: string): string | null {
  const key = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return visuals[key] ?? null;
}
