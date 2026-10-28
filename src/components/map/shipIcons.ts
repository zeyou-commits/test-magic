import type { Map as MapLibreMap } from "maplibre-gl";

const WIDTH = 128;
const HEIGHT = 192;

/** Proue vers le nord ; le sillage reste derrière après rotation de la carte. */
function drawMarker(ship: HTMLImageElement, phase: number | null): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (phase !== null) {
    for (let i = 0; i < 5; i++) {
      const distance = (i / 5 + phase) % 1;
      const y = 122 + distance * 64;
      const spread = 4 + distance * 20;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - distance) * 0.85})`;
      ctx.lineWidth = 2.5 - distance;
      ctx.beginPath();
      ctx.moveTo(64 - spread, y + 2);
      ctx.quadraticCurveTo(64, y - 4, 64 + spread, y + 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(74,139,155,0.18)";
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64 + side * 10, 122);
      ctx.quadraticCurveTo(64 + side * 15, 150, 64 + side * 29, 183);
      ctx.stroke();
    }
  }
  ctx.shadowColor = "rgba(20,55,69,0.16)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  // Le point géographique correspond au centre du bateau, pas à celui de sa traîne.
  ctx.drawImage(ship, 43, 61, 42, 70);
  return ctx.getImageData(0, 0, WIDTH, HEIGHT);
}

export function addShipImages(map: MapLibreMap) {
  const ship = new Image();
  let timer: ReturnType<typeof setInterval> | undefined;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const frames: ImageData[] = [];
  let frame = 0;
  const paint = () => {
    if (document.hidden || !map.hasImage("ship-sea") || !frames.length) return;
    map.updateImage("ship-sea", frames[media.matches ? 2 : frame++ % frames.length]!);
  };
  const syncMotion = () => {
    if (timer) clearInterval(timer);
    paint();
    if (!media.matches) timer = setInterval(paint, 160);
  };
  ship.onload = () => {
    if (!map.getStyle()) return;
    for (let i = 0; i < 12; i++) {
      const image = drawMarker(ship, i / 12);
      if (image) frames.push(image);
    }
    const dock = drawMarker(ship, null);
    if (frames[0] && !map.hasImage("ship-sea"))
      map.addImage("ship-sea", frames[0], { pixelRatio: 2 });
    if (dock && !map.hasImage("ship-dock")) map.addImage("ship-dock", dock, { pixelRatio: 2 });
    syncMotion();
    media.addEventListener("change", syncMotion);
  };
  map.once("remove", () => {
    if (timer) clearInterval(timer);
    ship.onload = null;
    media.removeEventListener("change", syncMotion);
  });
  ship.src = "/images/ferry-overhead.svg";
}
