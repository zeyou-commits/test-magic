import { describe, expect, it } from "vitest";
import {
  isoWeekday,
  nextDates,
  plannedVessel,
  recurrenceLabel,
  runsOn,
  weekIndex,
} from "./recurrence";

// Lundi 9 novembre 2026 : début du calendrier.
const base = {
  weekdays: [2, 5],
  valid_from: "2026-11-09",
  valid_to: "2027-01-10",
  default_vessel_id: "A",
};

describe("calendriers récurrents", () => {
  it("jours ISO et semaines", () => {
    expect(isoWeekday("2026-11-09")).toBe(1);
    expect(isoWeekday("2026-11-15")).toBe(7);
    expect(weekIndex("2026-11-11", "2026-11-15")).toBe(0);
    expect(weekIndex("2026-11-11", "2026-11-16")).toBe(1);
  });

  it("sans les nouvelles colonnes : chaque semaine, même navire (comme avant)", () => {
    expect(nextDates(base, "2026-11-04", 4)).toEqual([
      "2026-11-10",
      "2026-11-13",
      "2026-11-17",
      "2026-11-20",
    ]);
    expect(plannedVessel(base, "2026-11-17")).toBe("A");
  });

  it("toutes les 2 semaines, alternance A puis B (identique au test SQL)", () => {
    const r = { ...base, every_weeks: 2, vessel_rotation: ["A", "B"] };
    const dates = nextDates(r, "2026-11-04", 10);
    expect(dates.map((d) => `${d.slice(5)} ${plannedVessel(r, d)}`)).toEqual([
      "11-10 A",
      "11-13 A",
      "11-24 B",
      "11-27 B",
      "12-08 A",
      "12-11 A",
      "12-22 B",
      "12-25 B",
      "01-05 A",
      "01-08 A",
    ]);
    expect(runsOn(r, "2026-11-17")).toBe(false);
  });

  it("chaque semaine avec un navire différent", () => {
    const r = { ...base, weekdays: [6], vessel_rotation: ["A", "B", "C"] };
    expect(nextDates(r, "2026-11-09", 4).map((d) => plannedVessel(r, d))).toEqual([
      "A",
      "B",
      "C",
      "A",
    ]);
  });

  it("toutes les 3 semaines, fin de validité respectée", () => {
    const r = { ...base, weekdays: [7], every_weeks: 3 };
    expect(nextDates(r, "2026-11-01", 10)).toEqual(["2026-11-15", "2026-12-06", "2026-12-27"]);
    expect(recurrenceLabel(r)).toBe("dim. · toutes les 3 semaines");
    expect(recurrenceLabel(base)).toBe("mar., ven. · chaque semaine");
  });
});
