import { describe, expect, it } from "vitest";
import { coutRoute, jourDuMois, REGLAGES_DEFAUT } from "./budget";
import type { Carnet } from "./carnet";
import type { Chemin } from "./porteAPorte";

// Lyon → Almería → Ghazaouet, réduit à ce que le calcul lit.
const chemin = {
  eu: { port: "almeria", approche: { km: 10 }, chain: { km: 1790 } },
  dz: { port: "ghazaouet" },
  km: 1900,
} as unknown as Chemin;
const pas = (km: number, lat: number) => ({ side: "eu", km, point: [3, lat] });
const k = { pas: [pas(0, 45.7), pas(500, 42.7), pas(560, 42.2), pas(1800, 36.8)] } as unknown as Carnet;

describe("coût d'une route du bled", () => {
  it("prend le mois à venir, ou celui de l'an prochain s'il est passé", () => {
    const now = new Date("2026-11-23T12:00:00");
    expect(jourDuMois(7, now)).toBe("2027-07-10");
    expect(jourDuMois(12, now)).toBe("2026-12-10");
  });
  it("additionne traversée, essence des deux côtés et péages en France seulement", () => {
    const c = coutRoute(chemin, k, REGLAGES_DEFAUT, new Date("2026-11-23T12:00:00"));
    // 1 800 km en Europe à 7 L/100 et 1,80 €, 100 km en Algérie à 0,30 €.
    expect(c.essence).toBeCloseTo(1800 * 0.07 * 1.8 + 100 * 0.07 * 0.3);
    // Péages : jusqu'au dernier point au nord du Perthus (500 km).
    expect(c.peages).toBeCloseTo(500 * 0.06);
    expect(c.traversee.amount).toBeGreaterThan(0);
    expect(c.total).toBeCloseTo(c.traversee.amount + c.essence + c.peages);
    expect(c.low).toBeLessThan(c.total);
    expect(c.high).toBeGreaterThan(c.total);
  });
  it("coûte plus cher en août qu'en novembre", () => {
    const now = new Date("2026-11-23T12:00:00");
    const aout = coutRoute(chemin, k, { ...REGLAGES_DEFAUT, mois: 8 }, now);
    const nov = coutRoute(chemin, k, { ...REGLAGES_DEFAUT, mois: 11 }, now);
    expect(aout.traversee.amount).toBeGreaterThan(nov.traversee.amount);
  });
});
