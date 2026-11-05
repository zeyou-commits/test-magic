export type Box = { x: number; y: number; w: number; h: number };

/**
 * Mosaïque épaisse et irréversible sur une zone (visage, plaque), agrandie de `margin` de chaque
 * côté : `blocks` pavés dans la largeur, aucun trait ni caractère ne reste lisible.
 */
export function pixelate(canvas: HTMLCanvasElement, box: Box, margin: number, blocks = 6) {
  const x = Math.max(0, Math.round(box.x - box.w * margin));
  const y = Math.max(0, Math.round(box.y - box.h * margin));
  const w = Math.min(canvas.width - x, Math.round(box.w * (1 + 2 * margin)));
  const h = Math.min(canvas.height - y, Math.round(box.h * (1 + 2 * margin)));
  if (w < 2 || h < 2) return;
  const small = document.createElement("canvas");
  small.width = blocks;
  small.height = Math.max(1, Math.round((blocks * h) / w));
  const tiny = small.getContext("2d")!;
  tiny.imageSmoothingEnabled = true;
  tiny.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
  const context = canvas.getContext("2d")!;
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  context.restore();
}
