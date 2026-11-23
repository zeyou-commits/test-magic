import { describe, expect, it } from "vitest";
import { heure, horaires, type Pas } from "./carnet";

const pas = (id: string, k: Pas["k"], h: number, side: Pas["side"] = "eu"): Pas => ({
  id,
  k,
  side,
  h,
  km: 0,
  point: [0, 0],
  jour: 1,
});

describe("horaires du carnet", () => {
  it("ajoute 20 min par pause faite et repart à la même heure après une nuit", () => {
    const l = [
      pas("d", "depart", 0),
      pas("v", "ville", 1),
      pas("p1", "pause", 2),
      pas("p2", "priere", 4),
      pas("n", "nuit", 10),
      pas("v", "ville", 11),
      pas("p3", "pause", 12),
      pas("port", "port", 13),
      pas("dz", "portdz", 0, "dz"),
    ];
    const c = horaires(l, 6);
    const at = (i: number) => c.get(l[i]!);
    expect(at(0)).toBe(6);
    // Deux villes du même nom gardent chacune leur heure.
    expect(at(1)).toBe(7);
    expect(at(2)).toBe(8);
    expect(at(3)).toBeCloseTo(10 + 1 / 3);
    expect(at(4)).toBeCloseTo(16 + 2 / 3);
    expect(at(5)).toBe(7);
    expect(at(6)).toBe(8);
    expect(at(7)).toBeCloseTo(9 + 1 / 3);
    expect(at(8)).toBeUndefined();
  });
  it("écrit l'heure au quart d'heure, sans « 00 »", () => {
    const nb = String.fromCharCode(160);
    expect(heure(6)).toBe(`6${nb}h`);
    expect(heure(10 + 1 / 3)).toBe(`10${nb}h${nb}15`);
    expect(heure(25.5)).toBe(`1${nb}h${nb}30`);
  });
});
