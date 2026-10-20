import type { Map as MapLibreMap } from "maplibre-gl";

const W = 56;
const H = 200;
const NAVY = "#0b3a6e";

export const WAKE_FRAMES = 6;

/** Dessine un ferry vu du dessus, proue vers le haut. Le navire est centré pour que la rotation soit juste.
 *  `frame` (0..WAKE_FRAMES-1) fait glisser l'écume vers l'arrière pour animer le sillage. */
function drawFerry(withWake: boolean, frame = 0): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(W / 2, H / 2);

  if (withWake) {
    const phase = frame / WAKE_FRAMES;
    // Écume centrale : traînée qui s'estompe.
    const foam = ctx.createLinearGradient(0, 44, 0, 98);
    foam.addColorStop(0, "rgba(255,255,255,0.7)");
    foam.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = foam;
    ctx.beginPath();
    ctx.moveTo(-6, 44);
    ctx.lineTo(6, 44);
    ctx.lineTo(1, 98);
    ctx.lineTo(-1, 98);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = "round";
    ctx.lineWidth = 2.4;
    [-1, 1].forEach((side) => {
      const line = ctx.createLinearGradient(0, 44, 0, 96);
      line.addColorStop(0, "rgba(255,255,255,0.85)");
      line.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.moveTo(side * 9, 42);
      ctx.quadraticCurveTo(side * 15, 62, side * 24, 96);
      ctx.stroke();
    });
    // Vaguelettes d'écume qui glissent vers l'arrière et se dissolvent.
    for (let i = 0; i < 3; i++) {
      const t = (i / 3 + phase) % 1;
      const y = 46 + t * 50;
      const spread = 8 + t * 15;
      const alpha = 0.9 * (1 - t);
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.ellipse(side * spread, y, 2.2 + t * 1.5, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.beginPath();
      ctx.ellipse(0, y, 1.6, 1.2 + t, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ombre portée sur l'eau.
  ctx.save();
  ctx.shadowColor = "rgba(8, 30, 60, 0.45)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  // Coque.
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.bezierCurveTo(9, -34, 12, -20, 12, -10);
  ctx.lineTo(12, 36);
  ctx.quadraticCurveTo(12, 45, 7, 45);
  ctx.lineTo(-7, 45);
  ctx.quadraticCurveTo(-12, 45, -12, 36);
  ctx.lineTo(-12, -10);
  ctx.bezierCurveTo(-12, -20, -9, -34, 0, -46);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = NAVY;
  ctx.stroke();

  // Pont principal.
  ctx.fillStyle = "#cfe0f2";
  ctx.beginPath();
  ctx.moveTo(0, -38);
  ctx.bezierCurveTo(6, -29, 8, -18, 8, -10);
  ctx.lineTo(8, 38);
  ctx.lineTo(-8, 38);
  ctx.lineTo(-8, -10);
  ctx.bezierCurveTo(-8, -18, -6, -29, 0, -38);
  ctx.closePath();
  ctx.fill();

  // Passerelle (avant) et superstructure.
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-7, -14, 14, 38, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = NAVY;
  ctx.fillRect(-6, -13, 12, 5); // vitres de la passerelle

  // Bossoirs et canots de sauvetage.
  ctx.fillStyle = "#e4572e";
  ctx.fillRect(-10, -2, 3, 11);
  ctx.fillRect(7, -2, 3, 11);

  // Cheminée aux couleurs de la marque.
  ctx.fillStyle = "#e4572e";
  ctx.beginPath();
  ctx.ellipse(0, 12, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = NAVY;
  ctx.stroke();

  // Pont arrière.
  ctx.fillStyle = "rgba(11,58,110,0.18)";
  ctx.fillRect(-6, 28, 12, 8);

  return ctx.getImageData(0, 0, W, H);
}

/** Enregistre « ship-sea-0..N » (sillage animé) et « ship-dock » (au port, statique). */
export function addShipImages(map: MapLibreMap) {
  for (let f = 0; f < WAKE_FRAMES; f++) {
    const sea = drawFerry(true, f);
    if (sea && !map.hasImage(`ship-sea-${f}`)) map.addImage(`ship-sea-${f}`, sea, { pixelRatio: 2 });
  }
  const dock = drawFerry(false);
  if (dock && !map.hasImage("ship-dock")) map.addImage("ship-dock", dock, { pixelRatio: 2 });
}
