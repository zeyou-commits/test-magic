import { describe, expect, it } from "vitest";
import { defaultTripProfile } from "@/components/panel/TripProfile";
import { preparationFromTravelProfile } from "./travelProfile";

describe("preparationFromTravelProfile", () => {
  it("ne devine rien sans profil choisi", () => {
    expect(preparationFromTravelProfile(null)).toBeNull();
  });

  it("à pied : pas de checklist véhicule", () => {
    expect(preparationFromTravelProfile({ ...defaultTripProfile, vehicle: "none" })).toEqual({
      vehicle: false,
      kids: false,
      pet: false,
    });
  });

  it("enfants, bébés et animal : leurs papiers à préparer", () => {
    const profile = {
      ...defaultTripProfile,
      passengers: { ...defaultTripProfile.passengers, children: 0, babies: 1, pets: 1 },
    };
    expect(preparationFromTravelProfile(profile)).toEqual({ vehicle: true, kids: true, pet: true });
  });
});
