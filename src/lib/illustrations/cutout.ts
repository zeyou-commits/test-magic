/** Détourage sans dépendance : enlève le fond en partant des bords de l'image. */

export class CutoutError extends Error {}

type Background =
  | { mode: "plain"; ref: number; tolerance: number }
  | { mode: "checker"; low: number; high: number };

const neighbours = (i: number, w: number, h: number) => {
  const x = i % w;
  const list: number[] = [];
  if (x > 0) list.push(i - 1);
  if (x < w - 1) list.push(i + 1);
  if (i >= w) list.push(i - w);
  if (i < w * (h - 1)) list.push(i + w);
  return list;
};

function borderIndexes(w: number, h: number) {
  const list: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < 2 || y >= h - 2 || x < 2 || x >= w - 2) list.push(y * w + x);
    }
  }
  return list;
}

function isTransparent(data: Uint8ClampedArray, border: number[]) {
  return border.filter((i) => data[i * 4 + 3]! < 16).length >= border.length / 2;
}

/** Reconnaît un fond clair uni, ou un faux damier de transparence (deux gris alternés). */
function analyseBackground(data: Uint8ClampedArray, border: number[]): Background {
  const neutral: number[] = [];
  for (const i of border) {
    const [r, g, b] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];
    if (Math.max(r, g, b) - Math.min(r, g, b) <= 16) neutral.push(Math.min(r, g, b));
  }
  // Un personnage cadré de près peut toucher le bord : la moitié de fond suffit.
  if (neutral.length < border.length / 2) throw new CutoutError("Le fond n'est ni blanc ni uni.");
  const bins = new Array<number>(52).fill(0);
  for (const value of neutral) bins[Math.floor(value / 5)]!++;
  const peak = bins.indexOf(Math.max(...bins));
  if (peak * 5 < 170) throw new CutoutError("Le fond est trop sombre.");
  let second = -1;
  bins.forEach((count, bin) => {
    if (Math.abs(bin - peak) >= 3 && bin * 5 >= 150 && (second < 0 || count > bins[second]!)) {
      second = bin;
    }
  });
  if (second >= 0 && bins[second]! >= neutral.length * 0.2) {
    const [low, high] = [peak * 5 + 2, second * 5 + 2].sort((a, b) => a - b);
    return { mode: "checker", low: low!, high: high! };
  }
  const close = neutral
    .filter((v) => Math.abs(Math.floor(v / 5) - peak) <= 2)
    .sort((a, b) => a - b);
  const ref = close[close.length >> 1]!;
  const noise = ref - close[Math.floor(close.length / 50)]!;
  return { mode: "plain", ref, tolerance: Math.max(5, Math.min(14, noise + 3)) };
}

function backgroundMask(data: Uint8ClampedArray, w: number, h: number, bg: Background) {
  const low = bg.mode === "plain" ? bg.ref - bg.tolerance : bg.low - 8;
  const high = bg.mode === "plain" ? 255 : bg.high + 8;
  const spread = bg.mode === "plain" ? 14 : 12;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];
    const min = Math.min(r, g, b);
    mask[i] = min >= low && min <= high && Math.max(r, g, b) - min <= spread ? 1 : 0;
  }
  return mask;
}

/** Une zone blanche entourée par le personnage n'est pas atteinte : les yeux restent. */
function floodFromBorder(mask: Uint8Array, w: number, h: number, border: number[]) {
  const reached = new Uint8Array(w * h);
  const stack = border.filter((i) => mask[i]);
  for (const i of stack) reached[i] = 1;
  while (stack.length) {
    for (const j of neighbours(stack.pop()!, w, h)) {
      if (mask[j] && !reached[j]) {
        reached[j] = 1;
        stack.push(j);
      }
    }
  }
  return reached;
}

function components(active: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(w * h);
  const groups: number[][] = [];
  for (let start = 0; start < w * h; start++) {
    if (!active[start] || seen[start]) continue;
    seen[start] = 1;
    const stack = [start];
    const group: number[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      for (const j of neighbours(i, w, h)) {
        if (active[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Damier vu entre les anses : du fond. Blanc enfermé : vidé seulement entre les anses, en haut. */
function clearEnclosed(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  removed: Uint8Array,
  w: number,
  h: number,
  bg: Background,
  handles: boolean,
  alerts: string[],
) {
  let top = h;
  let bottom = 0;
  for (let i = 0; i < w * h; i++) {
    if (!removed[i]) {
      const y = Math.floor(i / w);
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const leftover = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) leftover[i] = mask[i] && !removed[i] ? 1 : 0;
  for (const group of components(leftover, w, h)) {
    if (bg.mode === "checker") {
      if (group.length < 30) continue;
      const low = group.filter((i) => Math.abs(data[i * 4]! - bg.low) <= 8).length;
      const high = group.filter((i) => Math.abs(data[i * 4]! - bg.high) <= 8).length;
      if (low >= group.length * 0.15 && high >= group.length * 0.15) {
        for (const i of group) removed[i] = 1;
      }
      continue;
    }
    if (group.length < 0.0005 * w * h) continue;
    const pure = group.filter(
      (i) => Math.min(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) >= bg.ref - 2,
    ).length;
    if (pure < group.length * 0.97) continue;
    const first = Math.floor(group[0]! / w);
    const last = Math.floor(group.reduce((max, i) => Math.max(max, i), 0) / w);
    if (first > top + 0.3 * (bottom - top)) continue;
    if (handles && last <= top + 0.45 * (bottom - top)) {
      for (const i of group) removed[i] = 1;
      alerts.push("Blanc enlevé entre les anses : vérifiez qu'il s'agissait bien du fond.");
    } else if (group.length >= 0.004 * w * h) {
      alerts.push("Zone blanche gardée en haut du dessin : vérifiez sur fond sombre.");
    }
  }
}

/** Calcule l'alpha des deux rangées de contour et leur retire la teinte du fond. */
function softenEdge(
  data: Uint8ClampedArray,
  removed: Uint8Array,
  w: number,
  h: number,
  bg: Background,
) {
  const source = data.slice();
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = removed[i] ? 0 : 255;
  let current = removed;
  for (let round = 0; round < 2; round++) {
    const next = current.slice();
    for (let i = 0; i < w * h; i++) {
      if (current[i] || !neighbours(i, w, h).some((j) => current[j])) continue;
      next[i] = 1;
      const rgb = [source[i * 4]!, source[i * 4 + 1]!, source[i * 4 + 2]!];
      const min = Math.min(...rgb);
      const ref =
        bg.mode === "plain"
          ? bg.ref
          : Math.abs(min - bg.high) < Math.abs(min - bg.low)
            ? bg.high
            : bg.low;
      const alpha = Math.max(0, Math.min(1, (ref - min) / 55));
      data[i * 4 + 3] = alpha * 255;
      if (alpha > 0.04 && alpha < 1) {
        rgb.forEach((value, canal) => {
          data[i * 4 + canal] = (value - (1 - alpha) * ref) / alpha;
        });
      }
    }
    current = next;
  }
}

/** Efface les poussières et le petit filigrane en étoile que Gemini met en bas à droite. */
function removeSpecks(data: Uint8ClampedArray, w: number, h: number) {
  const active = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) active[i] = data[i * 4 + 3]! > 16 ? 1 : 0;
  const groups = components(active, w, h);
  const largest = Math.max(0, ...groups.map((group) => group.length));
  const area = w * h;
  for (const group of groups) {
    if (group.length === largest) continue;
    const corner = group.every((i) => i % w > 0.8 * w && i / w > 0.8 * h);
    if (group.length < 0.0005 * area || (corner && group.length < 0.015 * area)) {
      for (const i of group) data[i * 4 + 3] = 0;
    }
  }
}

/** Détoure les pixels RGBA sur place et renvoie les points à faire vérifier. */
export function cutOut(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options: { handles: boolean },
) {
  const alerts: string[] = [];
  const border = borderIndexes(w, h);
  if (!isTransparent(data, border)) {
    const bg = analyseBackground(data, border);
    const mask = backgroundMask(data, w, h, bg);
    const removed = floodFromBorder(mask, w, h, border);
    if (removed.reduce((sum, value) => sum + value, 0) < 0.03 * w * h) {
      throw new CutoutError("Le fond n'a pas pu être enlevé : redemandez un fond blanc uni.");
    }
    clearEnclosed(data, mask, removed, w, h, bg, options.handles, alerts);
    softenEdge(data, removed, w, h, bg);
  }
  removeSpecks(data, w, h);
  return alerts;
}

/** Cadre du dessin une fois le fond enlevé, ou null si l'image est vide. */
export function subjectBox(data: Uint8ClampedArray, w: number, h: number) {
  let [left, top, right, bottom] = [w, h, -1, -1];
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3]! > 12) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}
