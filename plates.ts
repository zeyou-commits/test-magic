import { pixelate, type Box } from "./blur";

/**
 * Plaques d'immatriculation floutées sur l'appareil, avant tout envoi : modèle open source
 * YOLOv9 « license plates » d'open-image-models (MIT), exécuté par ONNX Runtime Web (MIT).
 * Modèle (public/models/plates) et moteur sont hébergés par BledWay et chargés
 * seulement quand une photo est jointe.
 */
type Tensor = { data: Float32Array; dims: readonly number[] };
type Session = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, Tensor>>;
};
type Runtime = { session: Session; makeTensor: (data: Float32Array, dims: number[]) => unknown };

const SIZE = 512;
let runtime: Promise<Runtime> | null = null;

const loadRuntime: () => Promise<Runtime> = import.meta.env.SSR
  ? () => Promise.reject(new Error("Indisponible sur le serveur"))
  : async () => {
      const [ort, wasm, glue] = await Promise.all([
        import("onnxruntime-web/wasm"),
        import("onnxruntime-web/ort-wasm-simd-threaded.wasm?url"),
        import("onnxruntime-web/ort-wasm-simd-threaded.mjs?url"),
      ]);
      // Le moteur est servi par le site lui-même (fichiers fournis par la construction).
      ort.env.wasm.wasmPaths = { wasm: wasm.default, mjs: glue.default };
      // Sans isolation d'origine, un seul fil de calcul : c'est ce que permet le navigateur.
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create("/models/plates/plates-512.onnx", {
        executionProviders: ["wasm"],
      });
      return {
        session: session as unknown as Session,
        makeTensor: (data, dims) => new ort.Tensor("float32", data, dims),
      };
    };

const getRuntime = () =>
  (runtime ??= loadRuntime().catch((error: unknown) => {
    runtime = null;
    throw error;
  }));

export function warmPlateDetector() {
  void getRuntime().catch(() => undefined);
}

/** Image mise à 512 × 512 sans déformation (bandes grises), comme à l'entraînement du modèle. */
function letterbox(source: HTMLCanvasElement) {
  const ratio = Math.min(SIZE / source.width, SIZE / source.height);
  const w = Math.round(source.width * ratio);
  const h = Math.round(source.height * ratio);
  const dx = (SIZE - w) / 2;
  const dy = (SIZE - h) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "rgb(114,114,114)";
  context.fillRect(0, 0, SIZE, SIZE);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, Math.round(dx - 0.1), Math.round(dy - 0.1), w, h);
  const pixels = context.getImageData(0, 0, SIZE, SIZE).data;
  const input = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0, p = 0; i < SIZE * SIZE; i += 1, p += 4) {
    input[i] = pixels[p]! / 255;
    input[SIZE * SIZE + i] = pixels[p + 1]! / 255;
    input[2 * SIZE * SIZE + i] = pixels[p + 2]! / 255;
  }
  return { input, ratio, dx, dy };
}

async function findPlates(source: HTMLCanvasElement, { session, makeTensor }: Runtime) {
  const { input, ratio, dx, dy } = letterbox(source);
  const outputs = await session.run({
    [session.inputNames[0]!]: makeTensor(input, [1, 3, SIZE, SIZE]),
  });
  const result = outputs[session.outputNames[0]!]!;
  const rows = result.dims[0] ?? 0;
  const cols = result.dims[1] ?? 7;
  const boxes: Box[] = [];
  // Chaque ligne : [lot, x1, y1, x2, y2, classe, score], déjà triée (NMS incluse dans le modèle).
  for (let r = 0; r < rows; r += 1) {
    const row = result.data.subarray(r * cols, (r + 1) * cols);
    if ((row[6] ?? 0) < 0.35) continue;
    const x1 = (row[1]! - dx) / ratio;
    const y1 = (row[2]! - dy) / ratio;
    const x2 = (row[3]! - dx) / ratio;
    const y2 = (row[4]! - dy) / ratio;
    boxes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  return boxes;
}

/** Floute chaque plaque trouvée (marge pour le cadre de la plaque) ; renvoie leur nombre. */
export async function blurPlates(canvas: HTMLCanvasElement): Promise<number> {
  const plates = await findPlates(canvas, await getRuntime());
  for (const plate of plates) pixelate(canvas, plate, 0.2, 8);
  return plates.length;
}
