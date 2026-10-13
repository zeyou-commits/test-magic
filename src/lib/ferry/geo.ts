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
