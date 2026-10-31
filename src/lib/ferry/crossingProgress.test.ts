import { describe, expect, it } from "vitest";
import { crossingProgress } from "./crossingProgress";
import type { Departure, Port } from "./types";
import type { LiveShip } from "./tracking";

const departure = {
  id: "trip",
  departure_at: "2026-10-21T08:00:00Z",
  arrival_at: "2026-10-21T18:00:00Z",
  duration_minutes: 600,
  status: "scheduled",
} as Departure;
const from = { longitude: 5, latitude: 43 } as Port;
const to = { longitude: 5, latitude: 37 } as Port;
const now = Date.parse("2026-10-21T13:00:00Z");
describe("crossing progress provenance", () => {
  it("labels timetable progress without claiming a live position", () => {
    const p = crossingProgress(departure, from, to, null, now);
    expect(p.ratio).toBe(0.5);
    expect(p.source).toBe("Repère horaire");
    expect(p.times.arrival.kind).toBe("scheduled");
  });
  it("does not invent a duration when arrival and duration are absent", () => {
    expect(
      crossingProgress(
        { ...departure, arrival_at: null, duration_minutes: null },
        from,
        to,
        null,
        now,
      ).ratio,
    ).toBeNull();
  });
  it("bounds progress and hides a cancelled crossing's bar", () => {
    expect(crossingProgress(departure, from, to, null, now + 86400000).ratio).toBe(1);
    expect(crossingProgress(departure, from, to, null, now - 86400000).ratio).toBe(0);
    expect(
      crossingProgress({ ...departure, status: "cancelled" }, from, to, null, now).ratio,
    ).toBeNull();
  });
  it("ignores signals from another crossing", () => {
    const other = {
      departure: { ...departure, id: "other" },
      ageMinutes: 1,
      remainingKm: 0,
    } as LiveShip;
    const p = crossingProgress(departure, from, to, other, now);
    expect(p.signal).toBeNull();
    expect(p.ratio).toBe(0.5);
  });
  it("uses recent geographic data, and falls back explicitly when old", () => {
    const live = {
      departure,
      position: { eventDepartureId: "trip" },
      ageMinutes: 2,
      remainingKm: 200,
      etaIso: null,
    } as unknown as LiveShip;
    expect(crossingProgress(departure, from, to, live, now).source).toContain("AIS");
    expect(crossingProgress(departure, from, to, { ...live, ageMinutes: 45 }, now).source).toBe(
      "Repère horaire",
    );
  });
  it("dit toujours si la position est réelle ou estimée", () => {
    const live = {
      departure,
      position: { eventDepartureId: "trip" },
      ageMinutes: 12,
      remainingKm: 200,
      etaIso: null,
    } as unknown as LiveShip;
    expect(crossingProgress(departure, from, to, null, now).trust).toBe("schedule");
    const fresh = crossingProgress(departure, from, to, live, now);
    expect(fresh.trust).toBe("live");
    expect(fresh.trustLabel).toBe("Position réelle · il y a 12 min");
    const old = crossingProgress(departure, from, to, { ...live, ageMinutes: 130 }, now);
    expect(old.trust).toBe("aged");
    expect(old.trustLabel).toBe("Estimation · dernière position il y a 2 h 10");
  });
  it("l'heure passée ne vaut pas arrivée, et un navire resté à quai n'est jamais « arrivé »", () => {
    const after = Date.parse("2026-10-21T20:00:00Z");
    expect(crossingProgress(departure, from, to, null, after).arrivalDue).toBe(true);
    const quay = {
      departure,
      position: {
        latitude: 43,
        longitude: 5,
        speedKnots: 0,
        reportedAt: "2026-10-21T19:50:00Z",
      },
      ageMinutes: 10,
      remainingKm: 660,
      etaIso: null,
    } as unknown as LiveShip;
    const stuck = crossingProgress(departure, from, to, quay, after);
    expect(stuck.hold).toMatchObject({ fresh: true });
    expect(stuck.arrivalDue).toBe(false);
    expect(stuck.ratio).toBe(0);
  });
  it("labels an observed arrival as AIS rather than timetable progress", () => {
    const live = {
      departure,
      position: {
        eventDepartureId: "trip",
        atdAt: departure.departure_at,
        ataAt: departure.arrival_at,
      },
      ageMinutes: 45,
      remainingKm: 0,
      etaIso: null,
    } as unknown as LiveShip;
    const progress = crossingProgress(departure, from, to, live, now);
    expect(progress.ratio).toBe(1);
    expect(progress.source).toBe("Arrivée constatée (AIS)");
  });
});
