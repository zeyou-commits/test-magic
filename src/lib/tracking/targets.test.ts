import { describe, expect, it } from "vitest";
import { aisTargets } from "./targets";

const vessels = [
  { id: "v1", mmsi: 111111111, status: "active" },
  { id: "v2", mmsi: 222222222, status: "active" },
  { id: "v3", mmsi: null, status: "active" },
];
const crossing = (vessel: string, start: string, end: string, status = "scheduled") => ({
  vessel_id: vessel,
  departure_at: start,
  arrival_at: end,
  duration_minutes: null,
  status,
});
const at = (iso: string) => Date.parse(iso);

describe("écoute AIS ciblée", () => {
  const departures = [
    crossing("v1", "2026-11-06T18:30:00Z", "2026-11-07T07:30:00Z"),
    crossing("v2", "2026-11-06T10:00:00Z", "2026-11-06T20:00:00Z"),
  ];

  it("écoute autour du départ, de l'arrivée et pendant toute la traversée", () => {
    expect([...aisTargets(departures, vessels, at("2026-11-06T18:00:00Z"))]).toEqual([
      [111111111, "departure"],
      [222222222, "sea"],
    ]);
    // Au milieu de la nuit : v1 est en mer depuis plus de 3 h, il reste écouté.
    expect([...aisTargets(departures, vessels, at("2026-11-07T01:00:00Z"))]).toEqual([
      [111111111, "sea"],
    ]);
    // Vu à l'arrêt : le retard reste écouté comme un départ.
    const stoppedMmsi = new Set(vessels.flatMap((v) => (v.mmsi ? [Number(v.mmsi)] : [])));
    expect([...aisTargets(departures, vessels, at("2026-11-07T01:00:00Z"), stoppedMmsi)]).toEqual([
      [111111111, "departure"],
    ]);
    // Arrivée prévue dépassée : encore écouté 2 h.
    expect([...aisTargets(departures, vessels, at("2026-11-07T08:30:00Z"))]).toEqual([
      [111111111, "arrival"],
    ]);
    expect(aisTargets(departures, vessels, at("2026-11-07T10:00:00Z")).size).toBe(0);
  });

  it("ignore traversées annulées et navires sans MMSI", () => {
    expect(
      aisTargets(
        [
          crossing("v1", "2026-11-06T18:30:00Z", "2026-11-07T07:30:00Z", "cancelled"),
          crossing("v3", "2026-11-06T18:30:00Z", "2026-11-07T07:30:00Z"),
        ],
        vessels,
        at("2026-11-06T18:30:00Z"),
      ).size,
    ).toBe(0);
  });
});
