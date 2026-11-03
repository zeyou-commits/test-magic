import { describe, expect, it } from "vitest";
import { departureKeywords, smartMatch } from "./smartSearch";

describe("recherche de l'espace équipe", () => {
  const ligne = ["Corsica Linea", "Jean Nicoli", "Marseille → Béjaïa", "mardi 4 novembre", "10:00"];

  it("trouve sans accents ni majuscules, mot par mot", () => {
    expect(smartMatch("bejaia corsica", ligne)).toBe(true);
    expect(smartMatch("nicoli mardi", ligne)).toBe(true);
    expect(smartMatch("nicoli jeudi", ligne)).toBe(false);
    expect(smartMatch("", ligne)).toBe(true);
  });

  it("retrouve les départs sans navire et les annulations", () => {
    const sansNavire = [...ligne, ...departureKeywords({ status: "scheduled", vesselId: null })];
    expect(smartMatch("à choisir", sansNavire)).toBe(true);
    expect(smartMatch("annulee", [...ligne, ...departureKeywords({ status: "cancelled", vesselId: "x" })])).toBe(true);
    expect(smartMatch("annulee", sansNavire)).toBe(false);
  });
});
