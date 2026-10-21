import type { Map as MapLibreMap } from "maplibre-gl";

const MARKER_ASSET = "/images/ferry-3d-marker.png";
const SIZE = 128;

/** Prépare le rendu 3D pour MapLibre. La proue pointe vers le haut afin de
 * conserver la rotation exacte selon le cap du navire. */
function drawMarker(ship: HTMLImageElement, atSea: boolean): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (atSea) {
    const wake = ctx.createLinearGradient(0, 94, 0, 128);
    wake.addColorStop(0, "rgba(255,255,255,0.8)");
    wake.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wake;
    ctx.beginPath();
    ctx.moveTo(47, 94);
    ctx.lineTo(81, 94);
    ctx.lineTo(96, 128);
    ctx.lineTo(32, 128);
    ctx.closePath();
    ctx.fill();
  }

  // L'image source est transparente et cadrée en trois quarts.
  ctx.drawImage(ship, 4, 0, 120, 120);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** Enregistre le visuel 3D une fois l'image chargée, sans bloquer la carte. */
export function addShipImages(map: MapLibreMap) {
  const ship = new Image();
  ship.decoding = "async";
  ship.onload = () => {
    if (!map.getStyle()) return;
    const sea = drawMarker(ship, true);
    const dock = drawMarker(ship, false);
    if (sea && !map.hasImage("ship-sea-0")) map.addImage("ship-sea-0", sea, { pixelRatio: 2 });
    if (dock && !map.hasImage("ship-dock")) map.addImage("ship-dock", dock, { pixelRatio: 2 });
  };
  ship.src = MARKER_ASSET;
}
