import type { Map as MapLibreMap } from "maplibre-gl";

const MARKER_ASSET = "/images/ferry-marker.svg";
const WIDTH = 192;
const HEIGHT = 104;
const HEADINGS = 8;

/** Le ferry reste en perspective stable ; seule la petite flèche indique le cap réel. */
function drawMarker(ship: HTMLImageElement, heading: number | null): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(ship, 0, 0, WIDTH, HEIGHT);
  if (heading !== null) {
    ctx.save();
    ctx.translate(170, 17);
    ctx.fillStyle = "rgba(255,253,247,0.96)";
    ctx.strokeStyle = "#bdd4d5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate((heading * Math.PI * 2) / HEADINGS);
    ctx.fillStyle = "#087846";
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return ctx.getImageData(0, 0, WIDTH, HEIGHT);
}

export function addShipImages(map: MapLibreMap) {
  const ship = new Image();
  ship.decoding = "async";
  ship.onload = () => {
    if (!map.getStyle()) return;
    for (let heading = 0; heading < HEADINGS; heading++) {
      const image = drawMarker(ship, heading);
      if (image && !map.hasImage(`ship-sea-${heading}`)) {
        map.addImage(`ship-sea-${heading}`, image, { pixelRatio: 2 });
      }
    }
    const dock = drawMarker(ship, null);
    if (dock && !map.hasImage("ship-dock")) map.addImage("ship-dock", dock, { pixelRatio: 2 });
  };
  ship.src = MARKER_ASSET;
}
