import { describe, expect, it } from "vitest";
import {
  activeWave,
  departedFromTrack,
  dockedFromTrack,
  quietHours,
  stageFor,
  stageNotice,
  voyageStage,
} from "./roomInvites";

const VALENCE = { latitude: 39.45, longitude: -0.32 };
const MOSTAGANEM = { latitude: 35.94, longitude: 0.09 };
const START = "2026-11-02T10:00:00Z";
const at = (hours: number) => Date.parse(START) + hours * 3_600_000;
const iso = (hours: number) => new Date(at(hours)).toISOString();
const base = {
  departureAt: START,
  leadMinutes: 240,
  departedAt: null,
  arrivedAt: null,
  postponed: false,
};

describe("les invitations au salon selon l'état du voyage", () => {
  it("suit l'embarquement, la mer, puis l'arrivée à quai", () => {
    expect(voyageStage({ ...base, now: at(-5) })).toBeNull();
    expect(voyageStage({ ...base, now: at(-3) })).toBe("boarding");
    expect(voyageStage({ ...base, departedAt: iso(1), now: at(2) })).toBe("sea");
    expect(voyageStage({ ...base, departedAt: iso(1), arrivedAt: iso(9), now: at(10) })).toBe(
      "docked",
    );
    expect(voyageStage({ ...base, arrivedAt: iso(9), now: at(18) })).toBeNull();
  });

  it("n'invite pas si le départ est reporté, ni longtemps après sans signal", () => {
    expect(voyageStage({ ...base, postponed: true, now: at(-1) })).toBeNull();
    expect(voyageStage({ ...base, now: at(7) })).toBeNull();
  });

  it("garde l'arrivée pour ceux qui suivent seulement", () => {
    expect(stageFor("boarding", false)).toBeNull();
    expect(stageFor("sea", false)).toBeNull();
    expect(stageFor("docked", false)).toBe("docked");
    expect(stageFor("sea", true)).toBe("sea");
    expect(stageNotice("docked", "A → B", false).body).toMatch(/suivez/);
    expect(stageNotice("docked", "A → B", true).body).toMatch(/partagez/);
  });

  it("ne prend pas le voyage précédent pour un départ", () => {
    const arrivingLate = [
      { reported_at: iso(0.5), latitude: 39.7, longitude: -0.1, speed_knots: 20 },
    ];
    expect(departedFromTrack(arrivingLate, VALENCE, START)).toBeNull();
    const track = [
      ...arrivingLate,
      { reported_at: iso(1), latitude: 39.45, longitude: -0.32, speed_knots: 0.2 },
      { reported_at: iso(2), latitude: 39.3, longitude: -0.1, speed_knots: 18 },
    ];
    expect(departedFromTrack(track, VALENCE, START)).toBe(iso(2));
  });

  it("repère l'arrêt au port d'arrivée", () => {
    const track = [
      { reported_at: iso(8), latitude: 36.3, longitude: 0.05, speed_knots: 19 },
      { reported_at: iso(9), latitude: 35.94, longitude: 0.09, speed_knots: 0.4 },
    ];
    expect(dockedFromTrack(track, MOSTAGANEM, START)).toBe(iso(9));
    expect(dockedFromTrack(track.slice(0, 1), MOSTAGANEM, START)).toBeNull();
  });

  it("limite le salon animé à 2 rappels", () => {
    expect(activeWave(4)).toBe(0);
    expect(activeWave(5)).toBe(1);
    expect(activeWave(15)).toBe(2);
    expect(activeWave(500)).toBe(2);
  });

  it("reconnaît la nuit à Paris", () => {
    expect(quietHours(Date.parse("2026-11-02T23:30:00Z"))).toBe(true);
    expect(quietHours(Date.parse("2026-11-02T12:00:00Z"))).toBe(false);
  });
});
