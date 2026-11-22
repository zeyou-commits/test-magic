import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import type { RoutesData } from "./data";
import { carnet, viaVilles } from "./carnet";
import { chemins, optionsAlgerie, optionsEurope, type LonLat } from "./porteAPorte";

const data = JSON.parse(readFileSync("public/data/routes-du-bled.json", "utf8")) as RoutesData;
const stopsOf = (r: RoutesData["routes"][number]) => r.stops;
// Durées fictives de traversée, pour les tests seulement.
const mer = (p: string, d: string) =>
  p === "almeria" ? 600 : p === "alicante" ? 780 : d ? 1320 : null;
const trajet = (from: LonLat, to: LonLat) =>
  chemins(
    optionsEurope(data.routes, stopsOf, from),
    optionsAlgerie(data.routes, stopsOf, to),
    6,
    mer,
  );

const TOULOUSE = { label: "Toulouse", point: [1.444, 43.604] as LonLat };
const ALGER = { label: "Alger", point: [3.0588, 36.7538] as LonLat };
const PARIS = { label: "Paris", point: [2.3522, 48.8566] as LonLat };
const TINDOUF = { label: "Tindouf", point: [-8.1474, 27.6711] as LonLat };

describe("carnet", () => {
  it("Toulouse → Alger par Alicante passe par Perpignan, Barcelone et Valence", () => {
    const c = trajet(TOULOUSE.point, ALGER.point).find((x) => x.eu.port === "alicante")!;
    const via = viaVilles(c);
    expect(via.length).toBeGreaterThan(0);
    const villes = carnet(c, TOULOUSE, ALGER)
      .pas.filter((p) => p.k === "ville")
      .map((p) => p.name);
    expect(villes).toEqual(expect.arrayContaining(["Perpignan", "Barcelone", "Valence"]));
  });
  it("garde l'ordre : départ, villes et pauses, port, puis le bled jusqu'au village", () => {
    const c = trajet(TOULOUSE.point, ALGER.point)[0]!;
    const { pas } = carnet(c, TOULOUSE, ALGER);
    expect(pas[0]!.k).toBe("depart");
    expect(pas.at(-1)!.k).toBe("arrivee");
    const iPort = pas.findIndex((p) => p.k === "port");
    expect(pas.findIndex((p) => p.k === "portdz")).toBe(iPort + 1);
    const eu = pas.slice(0, iPort);
    for (let i = 1; i < eu.length; i++) expect(eu[i]!.h).toBeGreaterThanOrEqual(eu[i - 1]!.h);
  });
  it("va jusqu'à Tindouf : le port, puis une route à raconter avec des pauses et une nuit à placer", () => {
    const list = trajet(PARIS.point, TINDOUF.point);
    expect(list.length).toBeGreaterThan(0);
    const c = list[0]!;
    const k = carnet(c, PARIS, TINDOUF);
    expect(k.aRaconter?.km).toBeGreaterThan(500);
    const dz = k.pas.filter((p) => p.side === "dz");
    expect(dz.some((p) => p.k === "vide")).toBe(true);
    expect(dz.some((p) => p.k === "nuitvide")).toBe(true);
    expect(k.jourBled).toBeGreaterThan(1);
  });
  it("met un lieu de prière en tête de pause quand il y en a un tout près", () => {
    const c = trajet(PARIS.point, ALGER.point).find((x) => x.eu.port === "marseille")!;
    const { pas } = carnet(c, PARIS, ALGER);
    expect(pas.some((p) => p.k === "priere" && p.priere)).toBe(true);
  });
  it("pose un lieu ajouté par un voyageur à sa place, même loin des routes relevées", () => {
    const c = trajet(PARIS.point, TINDOUF.point)[0]!;
    const sans = carnet(c, PARIS, TINDOUF);
    // Un point posé sur la ligne de fin de route, à mi-chemin du port au village.
    const fin = sans.pas.filter((p) => p.side === "dz" && p.k === "vide");
    const ici = fin[Math.floor(fin.length / 2)]!.point;
    const k = carnet(c, PARIS, TINDOUF, undefined, [
      {
        id: "x",
        k: "priere",
        n: "Mosquée de test",
        place: "Test",
        lon: ici[0],
        lat: ici[1],
        f: [],
        etat: "attente",
      },
      {
        id: "loin",
        k: "manger",
        n: "Trop loin",
        place: "Test",
        lon: 10,
        lat: 45,
        f: [],
        etat: "publie",
      },
    ]);
    const aj = k.pas.filter((p) => p.k === "ajout");
    expect(aj.map((p) => p.ajout!.id)).toEqual(["x"]);
    const i = k.pas.findIndex((p) => p.k === "ajout");
    expect(k.pas[i]!.side).toBe("dz");
    expect(k.pas[i - 1]!.h).toBeLessThanOrEqual(k.pas[i]!.h);
    expect(k.pas[i + 1]!.h).toBeGreaterThanOrEqual(k.pas[i]!.h);
  });
});
