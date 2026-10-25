import { describe, expect, it } from "vitest";
import { defaultTripProfile } from "./TripProfile";
import { emptyFilters } from "@/lib/ferry/types";

describe("réglages par défaut de la recherche", () => {
  it("propose la berline par défaut", () => {
    expect(defaultTripProfile.vehicle).toBe("sedan");
  });
  it("propose l'aller-retour par défaut", () => {
    expect(emptyFilters.roundTrip).toBe(true);
  });
});
