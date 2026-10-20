import { describe, expect, it } from "vitest";
import {
  fuelCost,
  importBudget,
  journeyBudget,
  parseAmount,
  parseOccupants,
  splitRoadCosts,
  vehicleAge,
} from "./calculations";
describe("Âge calendaire et limite des trois ans", () => {
  it("utilise la date de déclaration et isole le jour exact de la limite", () => {
    expect(vehicleAge("2023-11-15", "2026-11-01")?.remainingDays).toBe(14);
    expect(vehicleAge("2023-11-15", "2026-11-15")?.state).toBe("limit");
    expect(vehicleAge("2023-11-15", "2026-11-20")?.state).toBe("after");
  });
  it("refuse les dates impossibles, manquantes ou inversées", () => {
    expect(vehicleAge("2023-02-29", "2026-01-01")).toBeNull();
    expect(vehicleAge("", "2026-01-01")).toBeNull();
    expect(vehicleAge("2026-01-02", "2026-01-01")).toBeNull();
  });
  it("explicite la convention du 29 février", () => {
    const result = vehicleAge("2024-02-29", "2027-02-28");
    expect(result).toMatchObject({
      anniversary: "2027-02-28",
      state: "limit",
      leapConvention: true,
    });
  });
});
describe("Saisie financière et budgets", () => {
  it("distingue champ vide et zéro, refuse négatif, infini et personnes fractionnaires", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount("1,8")).toBe(1.8);
    expect(parseAmount("-2")).toBeNull();
    expect(parseAmount("Infinity")).toBeNull();
    expect(parseOccupants("2.5")).toBeNull();
    expect(parseOccupants("0")).toBeNull();
    expect(parseOccupants("4")).toBe(4);
  });
  it("ne transforme pas une taxe inconnue en taxe nulle", () => {
    expect(importBudget(12000, 700, 300, null, null, 10)).toMatchObject({
      knownSubtotal: 13000,
      taxEur: null,
      total: null,
    });
    expect(importBudget(12000, 700, 300, 135000, 135, 10)).toMatchObject({
      taxEur: 1000,
      reserve: 1400,
      total: 15400,
    });
    expect(importBudget(12000, 700, 300, 135000, 0, 10).total).toBeNull();
  });
  it("calcule le carburant et ne double pas les dépenses totales du voyage", () => {
    expect(fuelCost(1000, 6.5, 1.8)).toBeCloseTo(117);
    expect(
      journeyBudget({
        ticket: 900,
        km: 1000,
        consumption: 6.5,
        fuelPrice: 1.8,
        tolls: 90,
        lodging: 0,
        other: 50,
      }).total,
    ).toBeCloseTo(1157);
  });
  it("inclut le conducteur dans le partage des frais", () => {
    expect(splitRoadCosts(600, 6.5, 1.8, 55, 0, 4).perPerson).toBeCloseTo(31.3);
  });
});
