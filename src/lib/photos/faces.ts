/**
 * Visages floutés sur l'appareil, avant tout envoi : modèle open source BlazeFace (Apache 2.0),
 * hébergé par BledWay (public/models/blazeface), chargé seulement quand une photo est jointe.
 * Les enfants, les passants, l'auteur lui-même : aucun visage ne quitte le téléphone en clair.
 */
type Face = { topLeft: [number, number]; bottomRight: [number, number]; probability: number[] };
type Detector = {
  estimateFaces: (input: HTMLCanvasElement, returnTensors: false) => Promise<Face[]>;
};
let detector: Promise<Detector> | null = null;

const loadDetector: () => Promise<Detector> = import.meta.env.SSR
  ? () => Promise.reject(new Error("Indisponible sur le serveur"))
  : async () => {
      const [tf, blazeface] = await Promise.all([
        import("@tensorflow/tfjs"),
        import("@tensorflow-models/blazeface"),
      ]);
      await tf.ready();
      return (await blazeface.load({
        modelUrl: "/models/blazeface/model.json",
        maxFaces: 20,
        scoreThreshold: 0.6,
      })) as unknown as Detector;
    };

const getDetector = () =>
  (detector ??= loadDetector().catch((error: unknown) => {
    detector = null;
    throw error;
  }));

/** Préchargé dès qu'un formulaire propose une photo. */
export function warmFaceDetector() {
  void getDetector().catch(() => undefined);
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * Le modèle voit l'image en 128 × 128 : un visage lointain y disparaît. On cherche donc dans
 * l'image entière, puis dans 9 morceaux qui se chevauchent (visages plus petits, groupes).
 */
async function findFaces(source: HTMLCanvasElement, model: Detector): Promise<Box[]> {
  const boxes: Box[] = [];
  const zones: Box[] = [{ x: 0, y: 0, w: source.width, h: source.height }];
  const side = Math.round(Math.min(source.width, source.height) * 0.55);
  for (const fx of [0, 0.5, 1])
    for (const fy of [0, 0.5, 1])
      zones.push({
        x: Math.round((source.width - side) * fx),
        y: Math.round((source.height - side) * fy),
        w: side,
        h: side,
      });
  const tile = document.createElement("canvas");
  for (const zone of zones) {
    // Chaque zone réduite à 256 px : 25 ms par recherche au lieu de 2 s, sans perte (le modèle voit 128 px).
    const ratio = Math.min(1, 256 / Math.max(zone.w, zone.h));
    tile.width = Math.max(1, Math.round(zone.w * ratio));
    tile.height = Math.max(1, Math.round(zone.h * ratio));
    tile
      .getContext("2d")!
      .drawImage(source, zone.x, zone.y, zone.w, zone.h, 0, 0, tile.width, tile.height);
    for (const face of await model.estimateFaces(tile, false)) {
      const [x1, y1] = face.topLeft;
      const [x2, y2] = face.bottomRight;
      const w = (x2 - x1) / ratio;
      const h = (y2 - y1) / ratio;
      // Un visage : assez sûr, à peu près carré, pas plus de la moitié de la zone.
      if ((face.probability[0] ?? 0) < 0.75) continue;
      if (w / h < 0.6 || w / h > 1.7 || w > zone.w * 0.5) continue;
      boxes.push({ x: zone.x + x1 / ratio, y: zone.y + y1 / ratio, w, h });
    }
  }
  // Un même visage trouvé dans plusieurs morceaux ne compte qu'une fois.
  const unique: Box[] = [];
  for (const box of boxes) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const twin = unique.find(
      (other) =>
        Math.abs(other.x + other.w / 2 - cx) < Math.max(other.w, box.w) / 2 &&
        Math.abs(other.y + other.h / 2 - cy) < Math.max(other.h, box.h) / 2,
    );
    // Le cadre le plus serré est le plus précis (vu de plus près) ; la marge couvre le reste.
    if (!twin) unique.push(box);
    else if (box.w * box.h < twin.w * twin.h) Object.assign(twin, box);
  }
  return unique;
}

/** Floute (mosaïque épaisse, irréversible) chaque visage, avec une marge pour cheveux et menton. */
export async function blurFaces(canvas: HTMLCanvasElement): Promise<number> {
  const model = await getDetector();
  const faces = await findFaces(canvas, model);
  const context = canvas.getContext("2d")!;
  const small = document.createElement("canvas");
  for (const face of faces) {
    const margin = 0.45;
    const x = Math.max(0, Math.round(face.x - face.w * margin));
    const y = Math.max(0, Math.round(face.y - face.h * margin));
    const w = Math.min(canvas.width - x, Math.round(face.w * (1 + 2 * margin)));
    const h = Math.min(canvas.height - y, Math.round(face.h * (1 + 2 * margin)));
    if (w < 2 || h < 2) continue;
    // 6 pavés dans la largeur : aucun trait du visage ne reste lisible.
    small.width = 6;
    small.height = Math.max(1, Math.round((6 * h) / w));
    const tiny = small.getContext("2d")!;
    tiny.imageSmoothingEnabled = true;
    tiny.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    context.restore();
  }
  return faces.length;
}
