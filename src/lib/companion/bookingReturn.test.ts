import { describe, expect, it } from "vitest";
import { isBookingReturn, MAX_AWAY_MS, MIN_AWAY_MS } from "./bookingReturn";

describe("isBookingReturn", () => {
  const leave = { site: "Algérie Ferries", at: 1_000_000 };
  it("rien sans départ vers une compagnie", () => {
    expect(isBookingReturn(null, 2_000_000)).toBe(false);
  });
  it("aller-retour éclair : on ne demande rien", () => {
    expect(isBookingReturn(leave, leave.at + MIN_AWAY_MS - 1)).toBe(false);
  });
  it("retour après un vrai passage sur le site : on demande", () => {
    expect(isBookingReturn(leave, leave.at + MIN_AWAY_MS)).toBe(true);
    expect(isBookingReturn(leave, leave.at + MAX_AWAY_MS)).toBe(true);
  });
  it("trop tard : la question n'a plus de sens", () => {
    expect(isBookingReturn(leave, leave.at + MAX_AWAY_MS + 1)).toBe(false);
  });
});
