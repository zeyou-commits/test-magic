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

  // Silhouette trois-quarts : la proue reste dans l'axe du cap, tandis que
  // le flanc ombré donne du relief même lorsque l'icône est très petite.
  ctx.save();
  ctx.shadowColor = "rgba(8, 30, 60, 0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#0b3a6e";
  ctx.beginPath();
  ctx.moveTo(-3, -43);
  ctx.quadraticCurveTo(14, -28, 17, -8);
  ctx.lineTo(19, 28);
  ctx.quadraticCurveTo(17, 39, 8, 42);
  ctx.lineTo(-9, 35);
  ctx.quadraticCurveTo(-18, 30, -18, 23);
  ctx.lineTo(-18, -10);
  ctx.quadraticCurveTo(-17, -30, -3, -43);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Flanc éclairé et pont en perspective.
  const hull = ctx.createLinearGradient(-20, 0, 18, 0);
  hull.addColorStop(0, "#f7f4ec");
  hull.addColorStop(0.55, "#ffffff");
  hull.addColorStop(1, "#aec5d5");
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-3, -39);
  ctx.quadraticCurveTo(9, -26, 10, -10);
  ctx.lineTo(12, 29);
  ctx.lineTo(8, 37);
  ctx.lineTo(-10, 31);
  ctx.lineTo(-13, 23);
  ctx.lineTo(-13, -10);
  ctx.quadraticCurveTo(-12, -27, -3, -39);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.fillStyle = "#c4dfec";
  ctx.beginPath();
  ctx.moveTo(-3, -34);
  ctx.quadraticCurveTo(5, -23, 6, -9);
  ctx.lineTo(7, 27);
  ctx.lineTo(-8, 22);
  ctx.lineTo(-8, -10);
  ctx.quadraticCurveTo(-8, -24, -3, -34);
  ctx.fill();

  // Passerelle relevée, vitrage et ponts lisibles à l'échelle de la carte.
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-7, -12, 13, 34, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = NAVY;
  ctx.fillRect(-6, -11, 11, 5);
  ctx.fillStyle = "#4284a4";
  ctx.fillRect(-6, 1, 11, 2);
  ctx.fillRect(-6, 7, 11, 2);

  // Bossoirs et canots de sauvetage.
  ctx.fillStyle = "#e4572e";
  ctx.fillRect(-12, -2, 3, 10);
  ctx.fillRect(8, -2, 3, 10);

  // Cheminée aux couleurs de la marque.
  ctx.fillStyle = "#e4572e";
  ctx.beginPath();
  ctx.ellipse(0, 14, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = NAVY;
  ctx.stroke();

  // Pont arrière.
  ctx.fillStyle = "rgba(11,58,110,0.3)";
  ctx.fillRect(-6, 27, 12, 5);

  return ctx.getImageData(0, 0, W, H);
}

/** Enregistre « ship-sea-0..N » (sillage animé) et « ship-dock » (au port, statique). */
export function addShipImages(map: MapLibreMap) {
  for (let f = 0; f < WAKE_FRAMES; f++) {
    const sea = drawFerry(true, f);
    if (sea && !map.hasImage(`ship-sea-${f}`))
      map.addImage(`ship-sea-${f}`, sea, { pixelRatio: 2 });
  }
  const dock = drawFerry(false);
  if (dock && !map.hasImage("ship-dock")) map.addImage("ship-dock", dock, { pixelRatio: 2 });
}
