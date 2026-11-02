// Où écrire le nom d'un navire : sous sa coque si la place est libre, sinon au-dessus, à droite ou à
// gauche, sans couvrir un autre navire ni un autre nom. Tout se calcule en pixels écran.

export type LabelAnchor = "top" | "bottom" | "left" | "right";
export type LabelSpot = { anchor: LabelAnchor; offset: [number, number]; box: Box };

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

export type Box = { left: number; top: number; right: number; bottom: number };

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

/** `obstacles` : ce qui ne doit pas être couvert non plus, comme le point des ports. */
export function placeLabels(items: LabelItem[], size: number, obstacles: Box[] = []) {
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
    const candidates: { spot: Omit<LabelSpot, "box">; box: Box }[] = [
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
      taken.reduce((sum, other) => sum + overlap(box, other) * 2, 0) +
      obstacles.reduce((sum, other) => sum + overlap(box, other) * 3, 0);
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
      box: best.box,
      anchor: best.spot.anchor,
      offset: [Math.round(best.spot.offset[0] * 100) / 100, Math.round(best.spot.offset[1] * 100) / 100],
    });
  }
  return spots;
}

export type LineLabel = { id: string; text: string; points: [number, number][] };
export type LineSpot = { x: number; y: number; angle: number };

/**
 * La durée d'une ligne : une seule fois par ligne, posée le long du tracé au plus près du milieu,
 * là où elle ne couvre ni navire, ni nom, ni port, ni une autre durée.
 */
export function placeAlongLines(
  lines: LineLabel[],
  size: number,
  obstacles: Box[],
  view: Box,
) {
  const placed: Box[] = [];
  const spots = new Map<string, LineSpot>();
  for (const line of lines) {
    const lengths = [0];
    for (let i = 1; i < line.points.length; i++) {
      const [ax, ay] = line.points[i - 1]!;
      const [bx, by] = line.points[i]!;
      lengths.push(lengths[i - 1]! + Math.hypot(bx - ax, by - ay));
    }
    const total = lengths.at(-1)!;
    const w = line.text.length * size * 0.6 + 6;
    const h = size * 1.3;
    if (total < w * 1.4) continue;
    let best: { spot: LineSpot; box: Box; cost: number } | null = null;
    for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
      const at = total * t;
      const i = Math.max(1, lengths.findIndex((length) => length >= at));
      const [ax, ay] = line.points[i - 1]!;
      const [bx, by] = line.points[i]!;
      const part = (at - lengths[i - 1]!) / Math.max(1e-6, lengths[i]! - lengths[i - 1]!);
      const x = ax + (bx - ax) * part;
      const y = ay + (by - ay) * part;
      let angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;
      // Boîte englobante du texte incliné.
      const rad = (angle * Math.PI) / 180;
      const halfW = (Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h) / 2;
      const halfH = (Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * h) / 2;
      const box = { left: x - halfW, right: x + halfW, top: y - halfH, bottom: y + halfH };
      if (box.left < view.left || box.right > view.right || box.top < view.top || box.bottom > view.bottom)
        continue;
      const cost =
        obstacles.reduce((sum, other) => sum + overlap(box, other), 0) +
        placed.reduce((sum, other) => sum + overlap(box, other) * 2, 0);
      if (!best || cost < best.cost) best = { spot: { x, y, angle }, box, cost };
      if (cost === 0) break;
    }
    // Rien de lisible sans couvrir autre chose : la durée attend une meilleure vue.
    if (!best || best.cost > w * h * 0.15) continue;
    placed.push(best.box);
    spots.set(line.id, { ...best.spot, angle: Math.round(best.spot.angle * 10) / 10 });
  }
  return spots;
}
