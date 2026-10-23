import type { Map as MapLibreMap } from "maplibre-gl";

const MARKER_ASSET = "/images/ferry-marker.svg";
const WIDTH = 192;
const HEIGHT = 112;

/** Deux profils stables : jamais de rotation qui renverse le ferry ou son texte. */
function drawMarker(ship: HTMLImageElement, west = false): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (west) {
    ctx.translate(WIDTH, 0);
    ctx.scale(-1, 1);
  }
  ctx.shadowColor = "rgba(20,55,69,0.16)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.drawImage(ship, 0, 0, WIDTH, HEIGHT);
  return ctx.getImageData(0, 0, WIDTH, HEIGHT);
}

export function addShipImages(map: MapLibreMap) {
  const ship = new Image();
  ship.decoding = "async";
  ship.onload = () => {
    if (!map.getStyle()) return;
    for (const direction of ["east", "west"] as const) {
      const image = drawMarker(ship, direction === "west");
      if (image && !map.hasImage(`ship-sea-${direction}`))
        map.addImage(`ship-sea-${direction}`, image, { pixelRatio: 2 });
    }
    const dock = drawMarker(ship);
    if (dock && !map.hasImage("ship-dock")) map.addImage("ship-dock", dock, { pixelRatio: 2 });
  };
  ship.src = MARKER_ASSET;
}
