import { describe, expect, it } from "vitest";
import { commercialArrival } from "./commercial";
import { wallTimeInZone } from "@/lib/ferry/time";
describe("durées et arrivées des programmes commerciaux", () => {
  it("conserve une traversée de 26 h en été entre Paris et Alger", () => {
    const iso = commercialArrival("2027-07-01", "08:00", 1560, "Europe/Paris");
    expect(iso).toBe("2027-07-02T08:00:00.000Z");
    expect(wallTimeInZone(iso!, "Africa/Algiers")).toBe("09:00");
  });
  it("un changement de départ d'une heure décale l'arrivée d'une heure", () => {
    expect(
      Date.parse(commercialArrival("2027-07-01", "09:00", 1560, "Europe/Paris")!) -
        Date.parse(commercialArrival("2027-07-01", "08:00", 1560, "Europe/Paris")!),
    ).toBe(3600000);
  });
  it("le passage à l'heure d'hiver conserve la durée réelle", () => {
    expect(commercialArrival("2027-10-30", "20:00", 1440, "Europe/Paris")).toBe(
      "2027-10-31T18:00:00.000Z",
    );
  });
  it("ne calcule pas d'arrivée à partir d'une durée absente", () => {
    expect(commercialArrival("2027-07-01", "08:00", 0, "Europe/Paris")).toBeNull();
  });
});
