import type { IllustrationSlot } from "./catalog";
import { CutoutError, cutOut, subjectBox } from "./cutout";

const WORK_SIDE = 1024;

export type PreparedIllustration = { blob: Blob; url: string; alerts: string[] };

function newCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Réduit par moitiés successives : une seule grande réduction crénelle les contours. */
function shrink(source: HTMLCanvasElement, width: number, height: number) {
  let current = source;
  while (current.width > width * 2 && current.height > height * 2) {
    const half = newCanvas(Math.ceil(current.width / 2), Math.ceil(current.height / 2));
    half.getContext("2d")!.drawImage(current, 0, 0, half.width, half.height);
    current = half;
  }
  const final = newCanvas(width, height);
  const context = final.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(current, 0, 0, width, height);
  return final;
}

/** Du fichier de Gemini à l'image finale : détourée, centrée, à la bonne taille, en WebP. */
export async function prepareIllustration(
  file: File,
  slot: IllustrationSlot,
  keepBackground: boolean,
): Promise<PreparedIllustration> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new CutoutError("Fichier illisible : enregistrez-le en PNG ou JPG, puis réessayez.");
  }
  const scale = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
  const work = newCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  const context = work.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, work.width, work.height);
  bitmap.close();

  const alerts: string[] = [];
  const pixels = context.getImageData(0, 0, work.width, work.height);
  let box = { left: 0, top: 0, width: work.width, height: work.height };
  if (!keepBackground) {
    alerts.push(
      ...cutOut(pixels.data, work.width, work.height, { handles: slot.category !== "avatars" }),
    );
    const found = subjectBox(pixels.data, work.width, work.height);
    if (!found) throw new CutoutError("L'image est vide une fois le fond enlevé.");
    box = found;
    context.putImageData(pixels, 0, 0);
    if (
      box.left === 0 ||
      box.top === 0 ||
      box.left + box.width === work.width ||
      box.top + box.height === work.height
    ) {
      alerts.push("Le dessin touche le bord de l'image : il est peut-être coupé.");
    }
  }

  const inner = Math.max(1, Math.round(slot.size * (1 - 2 * (keepBackground ? 0 : slot.margin))));
  if (Math.max(box.width, box.height) < inner) {
    alerts.push("Image source petite : le rendu peut être flou.");
  }
  const crop = newCanvas(box.width, box.height);
  crop.getContext("2d")!.drawImage(work, -box.left, -box.top);
  const ratio = inner / Math.max(box.width, box.height);
  const subject = shrink(
    crop,
    Math.max(1, Math.round(box.width * ratio)),
    Math.max(1, Math.round(box.height * ratio)),
  );
  const output = newCanvas(slot.size, slot.size);
  output
    .getContext("2d")!
    .drawImage(
      subject,
      Math.floor((slot.size - subject.width) / 2),
      Math.floor((slot.size - subject.height) / 2),
    );
  // Safari n'encode pas le WebP : il renvoie alors un PNG, accepté aussi.
  const blob = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, "image/webp", 0.88),
  );
  if (!blob) throw new CutoutError("Conversion impossible sur ce navigateur.");
  return { blob, url: URL.createObjectURL(blob), alerts };
}
