import { describe, expect, it } from "vitest";
import { lineCalendar } from "./lineCalendar";

const departure = (company_id: string, departure_at: string, duration_minutes = 1320, status = "scheduled") => ({
  company_id,
  departure_at,
  duration_minutes,
  status,
});

describe("lineCalendar", () => {
  it("déduit jours, heures et durée des traversées réelles, en heure du port", () => {
    const [entry] = lineCalendar(
      [
        departure("a", "2026-11-07T14:00:00Z"),
        departure("a", "2026-11-11T11:00:00Z"),
        departure("a", "2026-11-14T14:00:00Z", 1380),
        departure("a", "2026-11-21T14:00:00Z"),
      ],
      "Europe/Paris",
    );
    expect(entry).toMatchObject({ companyId: "a", durationMinutes: 1320, count: 4 });
    expect(entry!.slots).toEqual([
      { time: "12:00", days: ["Mer"] },
      { time: "15:00", days: ["Sam"] },
    ]);
  });

  it("ignore les départs annulés et classe les compagnies par nombre de départs", () => {
    const entries = lineCalendar(
      [
        departure("rare", "2026-11-07T14:00:00Z"),
        departure("gone", "2026-11-07T14:00:00Z", 1320, "cancelled"),
        departure("often", "2026-11-08T14:00:00Z"),
        departure("often", "2026-11-09T14:00:00Z"),
      ],
      "Europe/Paris",
    );
    expect(entries.map((entry) => entry.companyId)).toEqual(["often", "rare"]);
  });
});
