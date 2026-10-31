import type { Map as MapLibreMap } from "maplibre-gl";

/** Jeton du bateau : 128 × 128 px dessinés en 2x, soit 64 px à l'échelle 1. */
const SIZE = 128;
const CENTER = SIZE / 2;
const RADIUS = 50;

/** Allure du sillage : « slow » en manœuvre (< 8 nœuds), « sea » en route. */
export type WakeLevel = "dock" | "slow" | "sea";

export function wakeLevel(
  state: "sea" | "port" | string,
  speedKnots: number | null | undefined,
): WakeLevel {
  if (speedKnots != null) return speedKnots < 1.5 ? "dock" : speedKnots < 8 ? "slow" : "sea";
  return state === "sea" ? "sea" : "dock";
}

/** Le ferry de profil regarde vers l'est (cap 0–180°) ou vers l'ouest. */
export function shipIcon(level: WakeLevel, course: number) {
  const heading = ((course % 360) + 360) % 360;
  return `ship-${level}-${heading < 180 ? "e" : "w"}`;
}

/** Rayon du jeton en pixels écran à ce zoom (même courbe que « icon-size » de la carte). */
export function shipTokenRadius(zoom: number) {
  const steps: [number, number][] = [
    [3, 0.5],
    [5, 0.6],
    [7, 0.7],
    [9, 0.82],
    [11, 0.98],
    [13, 1.12],
    [15, 1.24],
  ];
  let scale = steps.at(-1)![1];
  if (zoom <= steps[0]![0]) scale = steps[0]![1];
  else
    for (let i = 1; i < steps.length; i++) {
      const [z1, s1] = steps[i]!;
      const [z0, s0] = steps[i - 1]!;
      if (zoom <= z1) {
        scale = s0 + ((zoom - z0) / (z1 - z0)) * (s1 - s0);
        break;
      }
    }
  return (RADIUS / 2) * scale;
}

const RING: Record<WakeLevel, string> = { sea: "#0e7a43", slow: "#1d6fb8", dock: "#5b6b7a" };

/** Le ferry de profil (proue à droite), dans un repère de 64 × 36, comme la mini-illustration du site. */
function drawFerry(ctx: CanvasRenderingContext2D, smoke: number | null) {
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  if (smoke !== null)
    for (let i = 0; i < 3; i++) {
      const t = (smoke + i / 3) % 1;
      ctx.fillStyle = `rgba(160,174,184,${0.55 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(41 - t * 7, 6 - t * 8, 1.8 + t * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  // Cheminée verte à bande blanche.
  ctx.fillStyle = "#0e7a43";
  round(38, 7, 7, 8, 1.2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(38, 9.5, 7, 1.6);
  // Superstructure blanche, hublots bleus.
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = "rgba(22,50,74,0.35)";
  ctx.fillStyle = "#ffffff";
  round(18, 14, 30, 7, 2);
  ctx.fill();
  ctx.stroke();
  round(24, 10, 14, 5, 1.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2c7fb8";
  for (const x of [21, 26, 31, 36, 41]) {
    round(x, 16, 3, 2.4, 0.6);
    ctx.fill();
  }
  round(27, 11.3, 8, 2, 0.6);
  ctx.fill();
  // Le cabas à carreaux de BledWay, posé sur le pont avant.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(48, 15, 8, 6, 1.2);
  ctx.clip();
  ctx.fillStyle = "#f3efe6";
  ctx.fillRect(48, 15, 8, 6);
  ctx.fillStyle = "rgba(29,111,184,0.75)";
  for (const x of [49.5, 52.5, 55.5]) ctx.fillRect(x, 15, 1, 6);
  ctx.fillStyle = "rgba(226,64,58,0.7)";
  for (const y of [16.5, 19]) ctx.fillRect(48, y, 8, 0.9);
  ctx.restore();
  ctx.strokeStyle = "#1d6fb8";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(50.5, 15, 1.4, Math.PI, 0);
  ctx.moveTo(55, 15);
  ctx.arc(53.5, 15, 1.4, 0, Math.PI, true);
  ctx.stroke();
  // Coque marine, proue arrondie, liseré rouge.
  ctx.fillStyle = "#16324a";
  ctx.beginPath();
  ctx.moveTo(9, 21);
  ctx.lineTo(57, 21);
  ctx.quadraticCurveTo(60, 21, 58.5, 23.5);
  ctx.lineTo(53, 30);
  ctx.lineTo(15, 30);
  ctx.quadraticCurveTo(11, 26, 9, 21);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#e2403a";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(11.5, 23.5);
  ctx.lineTo(56.5, 23.5);
  ctx.stroke();
}

/**
 * Un jeton : rond blanc cerclé (vert en mer, bleu en manœuvre, gris à quai), ciel et mer stylisés,
 * le ferry de profil qui tangue, écume et fumée en mouvement. `phase` va de 0 à 1.
 */
function drawToken(level: WakeLevel, west: boolean, phase: number): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const angle = phase * Math.PI * 2;
  const sea = 86;
  const clip = () => {
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, RADIUS - 3, 0, Math.PI * 2);
    ctx.clip();
  };
  // Ombre portée et disque blanc.
  ctx.save();
  ctx.shadowColor = "rgba(20,55,69,0.32)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  clip();
  const sky = ctx.createLinearGradient(0, CENTER - RADIUS, 0, CENTER + 10);
  sky.addColorStop(0, "#e3f2fc");
  sky.addColorStop(1, "#ffffff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // La mer, avec une crête qui ondule.
  const water = ctx.createLinearGradient(0, sea, 0, SIZE);
  water.addColorStop(0, "#9fd4ea");
  water.addColorStop(1, "#4fa3c9");
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.moveTo(0, sea);
  for (let x = 0; x <= SIZE; x += 4) ctx.lineTo(x, sea + Math.sin(x / 9 + angle) * 1.6);
  ctx.lineTo(SIZE, SIZE);
  ctx.lineTo(0, SIZE);
  ctx.closePath();
  ctx.fill();
  // Le ferry et son sillage, tournés vers leur direction.
  ctx.translate(CENTER, 0);
  if (west) ctx.scale(-1, 1);
  ctx.translate(-CENTER, 0);
  const moving = level !== "dock";
  if (moving) {
    const strength = level === "sea" ? 1 : 0.45;
    for (let i = 0; i < 4; i++) {
      const t = (phase + i / 4) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - t) * 0.85 * strength + 0.1})`;
      ctx.lineWidth = 2.2 - t;
      ctx.beginPath();
      const x = 36 - t * 28 * strength;
      ctx.moveTo(x - 6, sea + 5 + t * 3);
      ctx.quadraticCurveTo(x, sea + 2 + t * 3, x + 6, sea + 5 + t * 3);
      ctx.stroke();
    }
  }
  const bob = Math.sin(angle) * (moving ? 2 : 1.2);
  const tilt = (Math.sin(angle + 0.8) * (moving ? 2.2 : 1.2) * Math.PI) / 180;
  ctx.translate(CENTER, sea - 2 + bob);
  ctx.rotate(tilt);
  ctx.scale(1.78, 1.78);
  ctx.translate(-34, -29);
  drawFerry(ctx, moving ? phase : null);
  ctx.restore();
  // Écume au pied de la coque.
  ctx.save();
  clip();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(40 + i * 24, sea + 3 + Math.sin(angle + i), 7, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Cercle de couleur selon l'allure.
  ctx.strokeStyle = RING[level];
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS - 2, 0, Math.PI * 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** Petite flèche sur le bord du jeton, tournée selon le cap (couche « fleet-heading »). */
function drawHeading(): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#0e7a43";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(CENTER, 1);
  ctx.lineTo(CENTER + 10, 14);
  ctx.lineTo(CENTER - 10, 14);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** Point d'exclamation sur le jeton d'un navire en alerte (couche « fleet-alert »). */
function drawAlert(): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const x = CENTER + RADIUS * 0.68;
  const y = CENTER + RADIUS * 0.68;
  ctx.fillStyle = "#c81e1e";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 23px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x, y + 1);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/**
 * Navire debout, face à nous : un rendu 3D ne se tourne pas sans paraître couché. Une carte ne lisse pas
 * une grande image réduite : chacune est préparée à trois largeurs, une par plage de zoom.
 */
export const VESSEL_IMAGE_STEPS = [
  { width: 120, minzoom: 0, maxzoom: 6.5 },
  { width: 240, minzoom: 6.5, maxzoom: 9 },
  { width: 480, minzoom: 9, maxzoom: 24 },
];

/** Largeur à l'écran, en pixels : minuscule en vue générale, détaillé de près. */
export const VESSEL_SCREEN_WIDTH = [3, 22, 5, 32, 6, 46, 7, 84, 9, 170, 11, 320, 13, 480];

/** Écart entre navires à quai : la file s'élargit avec eux pour qu'ils ne s'empilent pas au zoom. */
export function dockSpread(zoom: number) {
  const steps = VESSEL_SCREEN_WIDTH;
  let width = steps.at(-1)!;
  for (let i = 0; i < steps.length; i += 2) {
    if (zoom > steps[i]!) continue;
    if (i === 0) width = steps[1]!;
    else {
      const ratio = (zoom - steps[i - 2]!) / (steps[i]! - steps[i - 2]!);
      width = steps[i - 1]! + ratio * (steps[i + 1]! - steps[i - 1]!);
    }
    break;
  }
  return Math.max(1, width / 26);
}

export const vesselImageId = (slug: string, width: number) => `vessel-${slug}-${width}`;

/**
 * Prépare les navires, et anime ceux qui font route : tangage, écume à la proue, sillage derrière la poupe.
 * Seule la largeur affichée au zoom courant est redessinée, et rien pour un navire à quai.
 */
export function addVesselImages(map: MapLibreMap, slugs: string[]) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sources = new Map<string, { image: HTMLImageElement; bowY: number; sternY: number }>();
  const canvases = new Map<string, CanvasRenderingContext2D>();
  let sailing = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const contextFor = (width: number, height: number) => {
    const key = `${width}x${height}`;
    let ctx = canvases.get(key);
    if (!ctx) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext("2d", { willReadFrequently: true }) ?? undefined;
      if (ctx) canvases.set(key, ctx);
    }
    return ctx;
  };

  /** `phase` en secondes ; `null` pour un navire immobile. La marge autour accueille le sillage. */
  const frame = (slug: string, width: number, phase: number | null) => {
    const source = sources.get(slug);
    if (!source) return null;
    const height = Math.round((source.image.height * width) / source.image.width);
    const fullWidth = Math.round(width * 1.3);
    const fullHeight = Math.round(height * 1.12);
    const ctx = contextFor(fullWidth, fullHeight);
    if (!ctx) return null;
    const left = (fullWidth - width) / 2;
    const top = fullHeight - height;
    ctx.clearRect(0, 0, fullWidth, fullHeight);
    ctx.imageSmoothingQuality = "high";
    const bowY = top + source.bowY * height;
    const sternY = top + source.sternY * height;
    if (phase !== null) {
      const unit = width / 100;
      for (let i = 0; i < 4; i++) {
        const t = (phase / 1.8 + i / 4) % 1;
        const x = left + width * 0.93 + t * 15 * unit;
        const y = sternY + (i % 2 ? 1 : -1) * (1 + t * 3) * unit;
        ctx.strokeStyle = `rgba(120, 205, 218, ${0.8 * (1 - t)})`;
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1, 1.4 * unit);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 5 * unit, y);
        ctx.stroke();
      }
    }
    ctx.save();
    if (phase !== null) {
      ctx.translate(fullWidth / 2, fullHeight);
      ctx.rotate((Math.sin((phase * Math.PI * 2) / 3.4) * 1.3 * Math.PI) / 180);
      ctx.translate(-fullWidth / 2, -fullHeight + Math.sin((phase * Math.PI * 2) / 2.3) * width * 0.006);
    }
    ctx.drawImage(source.image, left, top, width, height);
    ctx.restore();
    if (phase !== null) {
      const unit = width / 100;
      for (let i = 0; i < 3; i++) {
        const t = (phase / 1.3 + i / 3) % 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * Math.sin(t * Math.PI)})`;
        ctx.beginPath();
        ctx.ellipse(left + width * 0.07 - t * 5 * unit, bowY - i * unit, (1 + t * 2) * unit, unit, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return ctx.getImageData(0, 0, fullWidth, fullHeight);
  };

  const widthNow = () =>
    VESSEL_IMAGE_STEPS.find(({ minzoom, maxzoom }) => map.getZoom() >= minzoom && map.getZoom() < maxzoom)?.width ??
    VESSEL_IMAGE_STEPS.at(-1)!.width;

  const repaint = (slug: string, width: number, phase: number | null) => {
    const id = vesselImageId(slug, width);
    const image = map.hasImage(id) ? frame(slug, width, phase) : null;
    if (image) map.updateImage(id, image);
  };

  const sync = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (!sailing.size || media.matches) return;
    timer = setInterval(() => {
      if (document.hidden) return;
      const phase = performance.now() / 1000;
      const width = widthNow();
      sailing.forEach((slug) => repaint(slug, width, phase));
    }, 90);
  };

  for (const slug of slugs) {
    const image = new Image();
    image.onload = () => {
      // La proue et la poupe du socle : le point opaque le plus à gauche et le plus à droite.
      const probe = contextFor(120, Math.round((image.height * 120) / image.width));
      if (!probe) return;
      const { width: w, height: h } = probe.canvas;
      probe.clearRect(0, 0, w, h);
      probe.drawImage(image, 0, 0, w, h);
      const { data } = probe.getImageData(0, 0, w, h);
      const edge = (from: number, to: number, step: number) => {
        for (let x = from; x !== to; x += step)
          for (let y = h - 1; y >= 0; y--) if (data[(y * w + x) * 4 + 3]! > 200) return y / h;
        return 0.8;
      };
      sources.set(slug, { image, bowY: edge(0, w, 1), sternY: edge(w - 1, -1, -1) });
      for (const { width } of VESSEL_IMAGE_STEPS) {
        const still = frame(slug, width, null);
        const id = vesselImageId(slug, width);
        if (still && !map.hasImage(id)) map.addImage(id, still);
      }
    };
    image.src = `/vessel-visuals/map/${slug}.webp`;
  }

  media.addEventListener("change", sync);
  map.once("remove", () => {
    if (timer) clearInterval(timer);
    media.removeEventListener("change", sync);
  });

  return {
    /** Navires qui font route : les autres reprennent leur image immobile. */
    setSailing(next: Set<string>) {
      if (next.size === sailing.size && [...next].every((slug) => sailing.has(slug))) return;
      const stopped = [...sailing].filter((slug) => !next.has(slug));
      sailing = next;
      for (const slug of stopped)
        for (const { width } of VESSEL_IMAGE_STEPS) repaint(slug, width, null);
      sync();
    },
  };
}

/** La carte reste à plate de loin, où l'on lit les lignes, et s'incline quand on s'approche des navires. */
export function pitchForZoom(zoom: number) {
  return zoom <= 5.5 ? 0 : zoom >= 8 ? 50 : ((zoom - 5.5) / 2.5) * 50;
}

export function addShipImages(map: MapLibreMap) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const animated: { id: string; frames: ImageData[] }[] = [];
  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const paint = () => {
    if (document.hidden) return;
    frame++;
    animated.forEach(({ id, frames }) => {
      if (!map.hasImage(id) || !frames.length) return;
      map.updateImage(id, frames[media.matches ? 0 : frame % frames.length]!);
    });
  };
  const syncMotion = () => {
    if (timer) clearInterval(timer);
    paint();
    if (!media.matches) timer = setInterval(paint, 140);
  };

  for (const level of ["sea", "slow", "dock"] as const)
    for (const west of [false, true]) {
      const frames: ImageData[] = [];
      for (let i = 0; i < 16; i++) {
        const image = drawToken(level, west, i / 16);
        if (image) frames.push(image);
      }
      const id = `ship-${level}-${west ? "w" : "e"}`;
      if (frames[0] && !map.hasImage(id)) map.addImage(id, frames[0], { pixelRatio: 2 });
      animated.push({ id, frames });
    }
  const heading = drawHeading();
  if (heading && !map.hasImage("ship-heading"))
    map.addImage("ship-heading", heading, { pixelRatio: 2 });
  const alert = drawAlert();
  if (alert && !map.hasImage("ship-alert")) map.addImage("ship-alert", alert, { pixelRatio: 2 });
  syncMotion();
  media.addEventListener("change", syncMotion);
  map.once("remove", () => {
    if (timer) clearInterval(timer);
    media.removeEventListener("change", syncMotion);
  });
}
