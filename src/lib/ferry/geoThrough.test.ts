import { describe, expect, it } from "vitest";
import { routeThrough } from "./geo";
import type { Port } from "./types";

const port = (id: string, longitude: number, latitude: number) =>
  ({ id, longitude, latitude }) as unknown as Port;

describe("routeThrough", () => {
  const alger = port("a", 3.06, 36.78);
  const marseille = port("m", 5.37, 43.3);

  it("passe par la position réelle du navire, d'un port à l'autre", () => {
    // Le Cracovia le 27/11/2026 : au large de la Costa Brava, à l'ouest de la ligne droite.
    const via: [number, number] = [3.62, 42.02];
    const points = routeThrough(alger, marseille, via)!;
    expect(points[0]).toEqual([3.06, 36.78]);
    expect(points.at(-1)![0]).toBeCloseTo(5.37, 6);
    expect(points.at(-1)![1]).toBeCloseTo(43.3, 6);
    const closest = Math.min(...points.map((p) => Math.hypot(p[0] - via[0], p[1] - via[1])));
    expect(closest).toBeLessThan(0.1);
  });

  it("laisse le trait normal quand le navire est encore collé au port", () => {
    expect(routeThrough(alger, marseille, [3.07, 36.85])).toBeNull();
  });
});
