/**
 * Lecture d'un billet sur l'appareil, sans aucun envoi à un service tiers :
 *   · PDF : le texte est lu directement (pdf.js) ; une page scannée passe par l'OCR ;
 *   · photo : OCR Tesseract (français + anglais), moteur et dictionnaires hébergés par BledWay ;
 *   · QR codes, Aztec, PDF417, codes-barres : lecteur du navigateur s'il existe (Android),
 *     sinon ZXing (iPhone et autres).
 * Le moteur est interchangeable (une application native pourrait utiliser ML Kit à la place).
 */
export type ReadProgress = { step: string; ratio: number };
export type ReadResult = { text: string; codes: string[]; pages: number };

const MAX_PAGES = 4;

// Navigateur seulement : le serveur n'embarque ni pdf.js, ni Tesseract, ni ZXing.
const engines = import.meta.env.SSR
  ? null
  : {
      zxing: () =>
        Promise.all([
          import("zxing-wasm/reader"),
          import("zxing-wasm/reader/zxing_reader.wasm?url"),
        ]),
      tesseract: () => import("tesseract.js"),
      pdf: () =>
        Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]),
    };
const engine = () => {
  if (!engines) throw new Error("Lecture possible seulement dans le navigateur.");
  return engines;
};
const MAX_SIDE = 2400;

/** Une image ramenée à 2 400 px au plus, prête pour la lecture. */
async function imageCanvas(file: Blob) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Gris et contraste renforcé : l'OCR lit mieux un billet photographié. */
function forOcr(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    d[i] = d[i + 1] = d[i + 2] = boosted;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

// --- Codes ---------------------------------------------------------------------------------

type NativeDetector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

async function nativeCodes(canvas: HTMLCanvasElement): Promise<string[] | null> {
  const Detector = (window as unknown as { BarcodeDetector?: new (o?: object) => NativeDetector })
    .BarcodeDetector;
  if (!Detector) return null;
  try {
    const found = await new Detector().detect(canvas);
    return found.map((code) => code.rawValue);
  } catch {
    return null;
  }
}

let zxingReady: Promise<typeof import("zxing-wasm/reader")> | null = null;
const loadZxing = () =>
  (zxingReady ??= (async () => {
    const [reader, wasm] = await engine().zxing();
    // Le moteur est servi par BledWay, pas par un CDN.
    reader.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? wasm.default : prefix + path,
      },
    });
    return reader;
  })());

export async function readCodes(canvas: HTMLCanvasElement): Promise<string[]> {
  const native = await nativeCodes(canvas);
  if (native && native.length) return native;
  try {
    const reader = await loadZxing();
    const image = canvas
      .getContext("2d", { willReadFrequently: true })!
      .getImageData(0, 0, canvas.width, canvas.height);
    const results = await reader.readBarcodes(image, { tryHarder: true, maxNumberOfSymbols: 6 });
    return results.filter((r) => r.isValid && r.text).map((r) => r.text);
  } catch {
    return native ?? [];
  }
}

// --- OCR -----------------------------------------------------------------------------------

type OcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};

async function ocr(canvases: HTMLCanvasElement[], progress: (p: ReadProgress) => void) {
  const { createWorker } = await engine().tesseract();
  let page = 0;
  const worker = (await createWorker(["fra", "eng"], 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/",
    langPath: "/ocr/lang",
    gzip: true,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text")
        progress({
          step: "Lecture du texte…",
          ratio: 0.35 + (0.6 * (page + m.progress)) / canvases.length,
        });
      else if (/loading|initializ/.test(m.status))
        progress({ step: "Préparation de la lecture…", ratio: 0.2 });
    },
  })) as unknown as OcrWorker;
  try {
    const texts: string[] = [];
    for (const canvas of canvases) {
      texts.push((await worker.recognize(forOcr(canvas))).data.text);
      page += 1;
    }
    return texts.join("\n");
  } finally {
    await worker.terminate();
  }
}

// --- PDF -----------------------------------------------------------------------------------

async function readPdf(file: Blob, progress: (p: ReadProgress) => void) {
  const [pdfjs, worker] = await engine().pdf();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(pdf.numPages, MAX_PAGES);
  const texts: string[] = [];
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= pages; n += 1) {
    progress({ step: "Lecture du PDF…", ratio: 0.1 + (0.3 * n) / pages });
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    // Lignes rétablies : un saut à chaque changement de hauteur dans la page.
    let lastY: number | null = null;
    let line = "";
    const lines: string[] = [];
    for (const item of content.items as { str: string; transform: number[] }[]) {
      const y = Math.round(item.transform[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        lines.push(line);
        line = "";
      }
      line += (line && !line.endsWith(" ") ? " " : "") + item.str;
      lastY = y;
    }
    lines.push(line);
    texts.push(lines.join("\n"));
    // Rendu de la page : pour les codes, et pour l'OCR si la page est une image scannée.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    canvases.push(canvas);
  }
  return { text: texts.join("\n"), canvases, pages };
}

/** Lit un billet (PDF ou photo) : texte et codes, rien d'autre. */
export async function readTicket(
  file: Blob,
  progress: (p: ReadProgress) => void,
): Promise<ReadResult> {
  progress({ step: "Ouverture du billet…", ratio: 0.05 });
  let text = "";
  let canvases: HTMLCanvasElement[];
  let pages = 1;
  if (file.type === "application/pdf") {
    const pdf = await readPdf(file, progress);
    text = pdf.text;
    canvases = pdf.canvases;
    pages = pdf.pages;
  } else {
    canvases = [await imageCanvas(file)];
  }
  progress({ step: "Recherche des QR codes…", ratio: 0.3 });
  const codes = [...new Set((await Promise.all(canvases.map(readCodes))).flat())];
  // PDF sans texte (scanné) ou photo : OCR.
  if (text.replace(/\s/g, "").length < 40) text = await ocr(canvases, progress);
  progress({ step: "Analyse des informations…", ratio: 0.97 });
  return { text, codes, pages };
}
