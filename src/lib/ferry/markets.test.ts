import { describe, expect, it } from "vitest";
import { isNorthShore, isSouthShore, isTowardsSouth } from "./markets";

describe("marchés", () => {
  it("seule l'Algérie est ouverte au lancement", () => {
    expect(isSouthShore("DZ")).toBe(true);
    expect(isSouthShore("TN")).toBe(false);
    expect(isSouthShore("MA")).toBe(false);
    expect(isNorthShore("FR")).toBe(true);
  });
  it("reconnaît le sens vers le bled", () => {
    expect(isTowardsSouth("FR", "DZ")).toBe(true);
    expect(isTowardsSouth("DZ", "FR")).toBe(false);
  });
});
