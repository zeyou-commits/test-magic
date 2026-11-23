import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import type { RoutesData } from "./data";
import {
  buildChain,
  dureeRonde,
  planEtapes,
  reprise,
  TRAJETS,
  variants,
  volantDuJour,
} from "./trajets";

const data = JSON.parse(readFileSync("public/data/routes-du-bled.json", "utf8")) as RoutesData;
const chainOf = (from: string, port: string, i = 0) => {
  const t = variants(from as never, port as never)[i]!;
  return buildChain(`${from}-${port}`, t.legs, data.routes, (r) => r.stops)!;
};

describe("trajets", () => {
  it("assemble chaque trajet déclaré", () => {
    for (const t of TRAJETS) {
      const c = buildChain("t", t.legs, data.routes, (r) => r.stops);
      expect(c, `${t.from} → ${t.port}`).not.toBeNull();
      expect(c!.km).toBeGreaterThan(20);
    }
  });
  it("coupe Paris → Lyon dans Paris → Barcelone", () => {
    const c = chainOf("paris", "barcelone", 0);
    expect(c.km).toBeGreaterThan(1000);
    expect(c.km).toBeLessThan(1150);
  });
  it("découpe Lyon → Alicante en pauses et une nuit", () => {
    const e = planEtapes(chainOf("lyon", "alicante"));
    if (process.env["SHOW"])
      console.log(
        e.map((x) => [
          x.type,
          dureeRonde(x.h),
          Math.round(x.km),
          x.best?.n,
          x.best?.k,
          x.others.length,
          x.priere.map((p) => p.n),
          x.manger.map((p) => p.n),
        ]),
      );
    expect(e.filter((x) => x.type === "nuit")).toHaveLength(1);
    expect(e.filter((x) => x.type === "pause").length).toBeGreaterThanOrEqual(4);
    expect(e.every((x, i) => i === 0 || x.h >= e[i - 1]!.h)).toBe(true);
  });
  it("dort le soir, pas en pleine journée : 10 h de volant au plus, et pas après 20 h", () => {
    expect(volantDuJour(6)).toBe(10);
    // Parti à midi : 7 h de volant et 3 pauses, arrêt à 20 h.
    expect(volantDuJour(12)).toBe(7);
    // Parti le soir : on roule de nuit, 10 h.
    expect(volantDuJour(21)).toBe(10);
    expect(reprise(6)).toBe(6);
    expect(reprise(21)).toBe(7);
    // La nuit tombe après 10 h de route depuis la maison, plus de « nuit vers 13 h ».
    const e = planEtapes(chainOf("lyon", "alicante"), 0, 6);
    const n = e.find((x) => x.type === "nuit");
    // Calée sur le meilleur endroit pour dormir, à quelques kilomètres près.
    expect(n?.h).toBeGreaterThan(9);
    expect(n?.h).toBeLessThanOrEqual(10.5);
  });
  it("pas de pause sur un trajet court", () => {
    expect(planEtapes(chainOf("montpellier", "sete"))).toHaveLength(0);
  });
  it("arrondit au quart d'heure", () => {
    expect(dureeRonde(6.9)).toBe("7 h");
    expect(dureeRonde(6.7)).toBe("6 h 45");
    expect(dureeRonde(0.7)).toBe("45 min");
  });
});
