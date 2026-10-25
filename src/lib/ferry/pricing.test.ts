import { describe, expect, it } from "vitest";
import { defaultTripProfile } from "@/components/panel/TripProfile";
import type { Sailing } from "./trips";
import { estimateFerryFare, estimateVehicleFare, priceSeason } from "./pricing";

const sailing = (from: string, to: string, dayKey: string): Sailing => ({
  from: { name: from, country_code: "FR" },
  to: { name: to, country_code: "DZ" },
  dayKey,
} as Sailing);
const car = { ...defaultTripProfile, vehicle: "sedan" as const };

describe("estimation du ferry", () => {
  it("ancre un adulte avec voiture sur la moyenne publiée de la liaison", () => {
    const fare = estimateFerryFare(sailing("Sète", "Béjaïa", "2026-10-22"), { ...car, passengers: { ...car.passengers, adults: 1 } });
    expect(fare.amount).toBe(420);
    expect(fare.vehiclePart).toBe(260);
    expect(fare.benchmarked).toBe(true);
  });

  it("compte la voiture dans le total, y compris pour deux adultes", () => {
    const trip = sailing("Marseille", "Alger", "2026-10-22");
    const withCar = estimateFerryFare(trip, car);
    const onFoot = estimateFerryFare(trip, { ...defaultTripProfile, vehicle: "none" });
    expect(withCar.amount).toBeGreaterThan(onFoot.amount);
    expect(estimateVehicleFare(trip, car)).toBe(withCar.vehiclePart);
    expect(withCar.low).toBeLessThan(withCar.amount);
    expect(withCar.high).toBeGreaterThan(withCar.amount);
  });

  it("augmente le repère en pointe estivale et adapte la catégorie du véhicule", () => {
    const calm = estimateFerryFare(sailing("Sète", "Alger", "2026-02-20"), car);
    const peak = estimateFerryFare(sailing("Sète", "Alger", "2026-08-20"), car);
    const van = estimateFerryFare(sailing("Sète", "Alger", "2026-08-20"), { ...car, vehicle: "van" });
    expect(peak.amount).toBeGreaterThan(calm.amount);
    expect(van.amount).toBeGreaterThan(peak.amount);
    expect(priceSeason("2026-07-15")).toBe("pointe");
  });

  it("élargit la fourchette quand aucune ligne n'a de relevé direct", () => {
    const fare = estimateFerryFare(sailing("Sète", "Skikda", "2026-10-22"), car);
    expect(fare.source).toBeNull();
    expect(fare.high - fare.low).toBeGreaterThan(fare.amount * 0.6);
  });
});
