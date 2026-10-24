import type { Map as MapLibreMap } from "maplibre-gl";
import { ROSALIND_MAP_ICON, ROSALIND_MAP_ICON_URL } from "@/lib/ferry/vesselVisuals";

const WIDTH = 128;
const HEIGHT = 192;

/** Allure du sillage : « slow » en manœuvre (< 8 nœuds), « sea » en route. */
export type WakeLevel = "dock" | "slow" | "sea";

export function wakeLevel(state: "sea" | "port" | string, speedKnots: number | null | undefined): WakeLevel {
  if (speedKnots != null) return speedKnots < 1.5 ? "dock" : speedKnots < 8 ? "slow" : "sea";
  return state === "sea" ? "sea" : "dock";
}

interface Sprite {
  base: string;
  url: string;
  /** Zone utile de l'image source (proue vers le haut). */
  source?: [number, number, number, number];
  dest: [number, number, number, number];
}

const SPRITES: Sprite[] = [
  { base: "ship", url: "/images/ferry-overhead.svg", dest: [43, 61, 42, 70] },
  // Rendu 3D vue du ciel fourni pour le Rosalind Franklin.
  {
    base: ROSALIND_MAP_ICON,
    url: ROSALIND_MAP_ICON_URL,
    source: [430, 50, 430, 1110],
    dest: [46, 50, 36, 92],
  },
];

/** Proue vers le nord ; le sillage reste derrière après rotation de la carte. */
function drawMarker(
  sprite: Sprite,
  ship: HTMLImageElement,
  phase: number | null,
  strength: number,
): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const stern = sprite.dest[1] + sprite.dest[3] - 8;

  if (phase !== null) {
    const length = 30 + strength * 40;
    for (let i = 0; i < 5; i++) {
      const distance = (i / 5 + phase) % 1;
      const y = stern + distance * length;
      const spread = 4 + distance * (8 + strength * 16);
      ctx.strokeStyle = `rgba(255,255,255,${(1 - distance) * (0.45 + strength * 0.45)})`;
      ctx.lineWidth = (2.5 - distance) * (0.7 + strength * 0.4);
      ctx.beginPath();
      ctx.moveTo(64 - spread, y + 2);
      ctx.quadraticCurveTo(64, y - 4, 64 + spread, y + 2);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(74,139,155,${0.1 + strength * 0.12})`;
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64 + side * 10, stern);
      ctx.quadraticCurveTo(
        64 + side * (12 + strength * 4),
        stern + length * 0.45,
        64 + side * (14 + strength * 16),
        Math.min(HEIGHT - 2, stern + length),
      );
      ctx.stroke();
    }
  }
  ctx.shadowColor = "rgba(20,55,69,0.18)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  const [dx, dy, dw, dh] = sprite.dest;
  if (sprite.source) {
    const [sx, sy, sw, sh] = sprite.source;
    ctx.drawImage(ship, sx, sy, sw, sh, dx, dy, dw, dh);
  } else ctx.drawImage(ship, dx, dy, dw, dh);
  return ctx.getImageData(0, 0, WIDTH, HEIGHT);
}

export function addShipImages(map: MapLibreMap) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animated: { id: string; frames: ImageData[] }[] = [];
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const images: HTMLImageElement[] = [];

  const paint = () => {
    if (document.hidden) return;
    frame++;
    animated.forEach(({ id, frames }) => {
      if (!map.hasImage(id) || !frames.length) return;
      map.updateImage(id, frames[media.matches ? 2 : frame % frames.length]!);
    });
  };
  const syncMotion = () => {
    if (timer) clearInterval(timer);
    paint();
    if (!media.matches) timer = setInterval(paint, 160);
  };

  SPRITES.forEach((sprite) => {
    const img = new Image();
    images.push(img);
    img.onload = () => {
      if (!map.getStyle()) return;
      (
        [
          ["sea", 1],
          ["slow", 0.25],
        ] as const
      ).forEach(([level, strength]) => {
        const frames: ImageData[] = [];
        for (let i = 0; i < 12; i++) {
          const image = drawMarker(sprite, img, i / 12, strength);
          if (image) frames.push(image);
        }
        const id = `${sprite.base}-${level}`;
        if (frames[0] && !map.hasImage(id)) map.addImage(id, frames[0], { pixelRatio: 2 });
        animated.push({ id, frames });
      });
      const dock = drawMarker(sprite, img, null, 0);
      const dockId = `${sprite.base}-dock`;
      if (dock && !map.hasImage(dockId)) map.addImage(dockId, dock, { pixelRatio: 2 });
      syncMotion();
    };
    img.src = sprite.url;
  });
  media.addEventListener("change", syncMotion);
  map.once("remove", () => {
    if (timer) clearInterval(timer);
    images.forEach((img) => (img.onload = null));
    media.removeEventListener("change", syncMotion);
  });
}
