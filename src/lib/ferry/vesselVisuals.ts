/** Rendus fournis par BledWay, associés uniquement au nom exact du navire. */
const visuals: Record<string, string> = {
  "rosalind franklin": "/vessel-visuals/rosalind-franklin.jpeg",
};

export const ROSALIND_MAP_ICON = "vessel-rosalind-franklin";
export const ROSALIND_MAP_ICON_URL = "/vessel-visuals/rosalind-franklin-map.png";

export function vesselMapIcon(name: string): string | null {
  return normalizedName(name) === "rosalind franklin" ? ROSALIND_MAP_ICON : null;
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
