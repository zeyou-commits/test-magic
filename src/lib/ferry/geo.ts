// Géométrie des trajets : arcs courbes et position d'un navire le long d'une ligne.
import type { Port } from "./types";

export type LngLat = [number, number];

/**
 * Arc de Bézier entre deux ports. La courbure est identique dans les deux sens
 * (on part toujours du port dont l'identifiant est le plus petit) afin que
 * Marseille → Alger et Alger → Marseille se superposent exactement.
 */
export function routeArc(from: Port, to: Port, steps = 40): LngLat[] {
  const forward = from.id < to.id;
  const a: LngLat = forward ? [from.longitude, from.latitude] : [to.longitude, to.latitude];
  const b: LngLat = forward ? [to.longitude, to.latitude] : [from.longitude, from.latitude];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  // Perpendiculaire ; on préfère bomber vers le nord (la mer pour la côte algérienne),
  // sinon vers l'est pour les lignes presque verticales.
  let px = -dy / length;
  let py = dx / length;
  if (Math.abs(py) > 0.35 ? py < 0 : px < 0) {
    px = -px;
    py = -py;
  }
  const bend = Math.min(0.22, 0.12 + length * 0.012);
  const control: LngLat = [
    (a[0] + b[0]) / 2 + px * length * bend,
    (a[1] + b[1]) / 2 + py * length * bend,
  ];
  const points: LngLat[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
    ]);
  }
  return forward ? points : points.reverse();
}

/**
 * Trajet qui passe par la position réelle d'un navire en mer : une seule courbe douce
 * du port de départ au port d'arrivée, qui touche le navire là où il se trouve.
 * Renvoie null si le navire est trop près d'un port pour que le détour ait un sens.
 */
export function routeThrough(from: Port, to: Port, via: LngLat, steps = 48): LngLat[] | null {
  const a: LngLat = [from.longitude, from.latitude];
  const b: LngLat = [to.longitude, to.latitude];
  const done = Math.hypot(via[0] - a[0], via[1] - a[1]);
  const left = Math.hypot(b[0] - via[0], b[1] - via[1]);
  if (done + left === 0) return null;
  const share = done / (done + left);
  if (share < 0.06 || share > 0.94) return null;
  // Bézier quadratique qui passe par le navire au paramètre « part du trajet faite ».
  const t = Math.min(0.85, Math.max(0.15, share));
  const u = 1 - t;
  const control: LngLat = [
    (via[0] - u * u * a[0] - t * t * b[0]) / (2 * u * t),
    (via[1] - u * u * a[1] - t * t * b[1]) / (2 * u * t),
  ];
  const points: LngLat[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    const r = 1 - s;
    points.push([
      r * r * a[0] + 2 * r * s * control[0] + s * s * b[0],
      r * r * a[1] + 2 * r * s * control[1] + s * s * b[1],
    ]);
  }
  return points;
}

/** Position le long d'une polyligne, t entre 0 et 1. */
export function pointAlong(points: LngLat[], t: number): LngLat {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const p = points[index]!;
  const q = points[index + 1]!;
  return [p[0] + (q[0] - p[0]) * local, p[1] + (q[1] - p[1]) * local];
}

/** Nombre pseudo-aléatoire stable à partir d'un texte (pour désynchroniser les navires). */
export function stableRandom(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 9973;
  return (hash % 1000) / 1000;
}
