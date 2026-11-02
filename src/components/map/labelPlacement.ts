// Où écrire le nom d'un navire : sous sa coque si la place est libre, sinon au-dessus, à droite ou à
// gauche, sans couvrir un autre navire ni un autre nom. Tout se calcule en pixels écran.

export type LabelAnchor = "top" | "bottom" | "left" | "right";
export type LabelSpot = { anchor: LabelAnchor; offset: [number, number] };

export type LabelItem = {
  id: string;
  /** Point d'ancrage du navire à l'écran : le bas de la coque pour un navire debout. */
  x: number;
  y: number;
  /** Navire debout (image posée sur son point) ou jeton rond centré sur son point. */
  standing: boolean;
  width: number;
  height: number;
  /** La ligne la plus longue du libellé, et le nombre de lignes. */
  text: string;
  lines: number;
  priority: number;
};

type Box = { left: number; top: number; right: number; bottom: number };

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** La taille du nom selon le zoom : la même échelle que le navire. */
export const LABEL_SIZE_STOPS = [3, 8, 6, 9, 7, 10, 9, 12, 11, 15, 13, 18];
export function labelSize(zoom: number) {
  const stops = LABEL_SIZE_STOPS;
  if (zoom <= stops[0]!) return stops[1]!;
  for (let i = 2; i < stops.length; i += 2) {
    if (zoom <= stops[i]!) {
      const ratio = (zoom - stops[i - 2]!) / (stops[i]! - stops[i - 2]!);
      return stops[i - 1]! + ratio * (stops[i + 1]! - stops[i - 1]!);
    }
  }
  return stops.at(-1)!;
}

function shipBox(item: LabelItem): Box {
  return item.standing
    ? {
        left: item.x - item.width / 2,
        right: item.x + item.width / 2,
        top: item.y - item.height,
        bottom: item.y,
      }
    : {
        left: item.x - item.width / 2,
        right: item.x + item.width / 2,
        top: item.y - item.height / 2,
        bottom: item.y + item.height / 2,
      };
}

export function placeLabels(items: LabelItem[], size: number) {
  const ships = new Map(items.map((item) => [item.id, shipBox(item)]));
  const taken: Box[] = [];
  const spots = new Map<string, LabelSpot>();
  const ordered = [...items].sort((a, b) => a.priority - b.priority || a.y - b.y);
  for (const item of ordered) {
    const own = ships.get(item.id)!;
    const w = item.text.length * size * 0.56;
    const h = item.lines * size * 1.25;
    const gap = size * 0.25;
    const midY = (own.top + own.bottom) / 2;
    // Les quatre places possibles, de la plus naturelle (sous la coque) à la moins naturelle.
    const candidates: { spot: LabelSpot; box: Box }[] = [
      {
        spot: { anchor: "top", offset: [0, (own.bottom - item.y + gap) / size] },
        box: { left: item.x - w / 2, right: item.x + w / 2, top: own.bottom + gap, bottom: own.bottom + gap + h },
      },
      {
        spot: { anchor: "bottom", offset: [0, (own.top - item.y - gap) / size] },
        box: { left: item.x - w / 2, right: item.x + w / 2, top: own.top - gap - h, bottom: own.top - gap },
      },
      {
        spot: { anchor: "left", offset: [(own.right - item.x + gap) / size, (midY - item.y) / size] },
        box: { left: own.right + gap, right: own.right + gap + w, top: midY - h / 2, bottom: midY + h / 2 },
      },
      {
        spot: { anchor: "right", offset: [(own.left - item.x - gap) / size, (midY - item.y) / size] },
        box: { left: own.left - gap - w, right: own.left - gap, top: midY - h / 2, bottom: midY + h / 2 },
      },
    ];
    const cost = (box: Box) =>
      [...ships].reduce((sum, [id, other]) => sum + (id === item.id ? 0 : overlap(box, other)), 0) +
      taken.reduce((sum, other) => sum + overlap(box, other) * 2, 0);
    let best = candidates[0]!;
    let bestCost = cost(best.box);
    for (const candidate of candidates.slice(1)) {
      if (bestCost === 0) break;
      const value = cost(candidate.box);
      if (value < bestCost) {
        best = candidate;
        bestCost = value;
      }
    }
    taken.push(best.box);
    spots.set(item.id, {
      anchor: best.spot.anchor,
      offset: [Math.round(best.spot.offset[0] * 100) / 100, Math.round(best.spot.offset[1] * 100) / 100],
    });
  }
  return spots;
}
