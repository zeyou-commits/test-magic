import { describe, expect, it } from "vitest";
import { defaultPlan, perDayLeft, planBudget, pocketTotal, roundUpTo, sanitizePlan } from "./plan";

describe("Combien je change", () => {
  it("additionne les postes d'un séjour normal à deux, en voiture", () => {
    const { lines, total } = planBudget({ ...defaultPlan(), days: 10, km: 400, gifts: 0 });
    const by = Object.fromEntries(lines.map((line) => [line.id, line.dinars]));
    expect(by["courses"]).toBe(1200 * 2 * 10);
    expect(by["resto"]).toBe(1000 * 2 * 10);
    // (400 × 2 + 25 × 10) km × 7,5 l / 100 × 47 DA
    expect(by["essence"]).toBe(Math.round((1050 * 7.5 * 47) / 100));
    expect(by["cadeaux"]).toBeUndefined();
    expect(total).toBe(lines.reduce((sum, line) => sum + line.dinars, 0));
  });

  it("compte un enfant pour moitié et ignore l'essence sans voiture", () => {
    const { lines } = planBudget({ ...defaultPlan(), days: 1, adults: 1, children: 2, car: false, gifts: 0 });
    expect(lines.find((line) => line.id === "courses")?.dinars).toBe(2400);
    expect(lines.some((line) => line.id === "essence")).toBe(false);
  });

  it("borne les valeurs saisies", () => {
    const plan = sanitizePlan({ days: -4, adults: 0, style: "luxe", fuelPrice: "abc", car: "oui" });
    expect(plan.days).toBe(1);
    expect(plan.adults).toBe(1);
    expect(plan.style).toBe("normal");
    expect(plan.fuelPrice).toBe(47);
    expect(plan.car).toBe(true);
  });

  it("arrondit et répartit ce qui reste", () => {
    expect(roundUpTo(1234)).toBe(1240);
    expect(perDayLeft(10000, 4)).toBe(2500);
    expect(perDayLeft(10000, 0)).toBeNull();
    expect(pocketTotal({ 2000: 3, 500: 1, 100: 2 })).toBe(6700);
  });
});
