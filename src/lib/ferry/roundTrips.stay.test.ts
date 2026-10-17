import { describe, expect, it } from "vitest";
import { estimateStayMinutes, formatStay } from "./roundTrips";

const leg = (dep: string, arr: string) =>
  ({ departure: { departure_at: dep, arrival_at: arr }, durationMin: null }) as never;

describe("temps sur place estimé", () => {
  it("déduit 1 h 30 de débarquement et 3 h de présentation au port", () => {
    // Arrivée aller 21/10 16:00, départ retour 22/10 12:00 → 20 h brutes − 4 h 30.
    const trip = { out: leg("2026-10-20T18:00:00Z", "2026-10-21T16:00:00Z"), back: leg("2026-10-22T12:00:00Z", "2026-10-23T10:00:00Z") };
    expect(estimateStayMinutes(trip)).toBe(15.5 * 60);
    expect(formatStay(estimateStayMinutes(trip))).toBe("16 h");
  });
  it("n'est jamais négatif", () => {
    const trip = { out: leg("2026-10-20T00:00:00Z", "2026-10-21T10:00:00Z"), back: leg("2026-10-21T12:00:00Z", "2026-10-22T10:00:00Z") };
    expect(estimateStayMinutes(trip)).toBe(0);
  });
});
