import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import type { RoutesData } from "./data";
import {
  chemins,
  heuresEnTout,
  optionsAlgerie,
  optionsEurope,
  parPort,
  type LonLat,
} from "./porteAPorte";

const data = JSON.parse(readFileSync("public/data/routes-du-bled.json", "utf8")) as RoutesData;
const eu = (p: LonLat) => optionsEurope(data.routes, (r) => r.stops, p);
const dz = (p: LonLat) => optionsAlgerie(data.routes, (r) => r.stops, p);

const SAINT_ETIENNE: LonLat = [4.387, 45.44];
const BORDEAUX: LonLat = [-0.579, 44.838];
const MARSEILLE: LonLat = [5.37, 43.296];
const AKBOU: LonLat = [4.535, 36.458];
const TLEMCEN: LonLat = [-1.315, 34.878];

describe("porte à porte", () => {
  it("raccroche Saint-Étienne à l'Autoroute du Soleil, à moins de 100 km", () => {
    const m = parPort(eu(SAINT_ETIENNE)).find((o) => o.port === "marseille")!;
    expect(m.chain?.segs[0]?.route.id).toBe("E1");
    expect(m.approche.km).toBeLessThan(100);
    expect(m.approche.mesure).toBe(false);
  });
  it("fait passer Bordeaux par la route de Madrid", () => {
    const o = eu(BORDEAUX).find((x) => x.key.includes("E5"))!;
    expect(o.approche.km).toBeLessThan(40);
  });
  it("va directement au port depuis Marseille", () => {
    const m = parPort(eu(MARSEILLE)).find((o) => o.port === "marseille")!;
    expect(m.chain).toBeNull();
  });
  it("arrive à Tlemcen par Oran ou Ghazaouet, avec la route jusqu'au plus près", () => {
    const best = dz(TLEMCEN)[0]!;
    expect(["oran", "ghazaouet"]).toContain(best.port);
    expect(best.dernier.km).toBeLessThan(40);
  });
  it("propose trois chemins Saint-Étienne → Akbou au plus, sur des lignes qui existent", () => {
    const list = chemins(eu(SAINT_ETIENNE), dz(AKBOU));
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(new Set(list.map((c) => c.eu.key)).size).toBe(list.length);
    for (let i = 1; i < list.length; i++) expect(list[i]!.h).toBeGreaterThanOrEqual(list[i - 1]!.h);
  });
  it("classe porte à porte avec la traversée, et met les lignes sans durée à la fin", () => {
    // Durées fictives : Marseille longue, Barcelone courte, Valence inconnue.
    const mer = (p: string) => ({ marseille: 1440, barcelone: 600 })[p] ?? null;
    const list = chemins(eu(SAINT_ETIENNE), dz(TLEMCEN), 3, mer);
    expect(list[0]!.eu.port).toBe("barcelone");
    expect(heuresEnTout(list[0]!)).toBeCloseTo(list[0]!.h + 10);
    const sans = list.findIndex((c) => c.mer == null);
    if (sans >= 0) expect(list.slice(sans).every((c) => c.mer == null)).toBe(true);
  });
  it("depuis Montauban, ne garde pas de doublon rejoint de loin (Espagne par la côte ou par Madrid)", () => {
    const keys = eu([1.355, 44.018]).map((o) => o.key);
    expect(keys).toContain("alicante:E2>E3");
    expect(keys).toContain("alicante:E5>E6");
    expect(keys).not.toContain("alicante:E3");
    expect(keys).not.toContain("alicante:E6");
  });
  it("compte les heures des pauses depuis la maison", () => {
    const lille: LonLat = [3.057, 50.629];
    const c = chemins(eu(lille), dz(AKBOU))[0]!;
    expect(c.eu.approche.h).toBeGreaterThan(2.25);
    const first = c.etapes[0]!;
    expect(first.horsAxe).toBe(true);
    expect(first.h).toBeLessThan(c.eu.approche.h);
  });
});
