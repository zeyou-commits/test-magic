/** Rendus fournis par BledWay, associés uniquement au nom exact du navire. */
const visuals: Record<string, string> = {
  "rosalind franklin": "/vessel-visuals/rosalind-franklin.jpeg",
};

/** Navires détourés pour la carte (public/vessel-visuals/map), proue vers la gauche. */
export const MAP_VESSELS = [
  "almariya",
  "badji-mokhtar-iii",
  "danielle-casanova",
  "el-djazair-ii",
  "fantastic",
  "gnv-auriga",
  "gnv-cristal",
  "hypatia-de-alejandria",
  "jean-nicoli",
  "le-cracovia",
  "mediterranee",
  "regina-baltica",
  "rosalind-franklin",
  "tariq-ibn-ziyad",
  "tassili-ii",
];

export function vesselMapIcon(name: string): string | null {
  const slug = normalizedName(name).replace(/ /g, "-");
  return MAP_VESSELS.includes(slug) ? slug : null;
}

function normalizedName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function vesselVisual(name: string): string | null {
  return visuals[normalizedName(name)] ?? null;
}
