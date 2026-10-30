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

  it("écoute autour du départ et de l'arrivée, pas en pleine traversée", () => {
    expect([...aisTargets(departures, vessels, at("2026-11-06T18:00:00Z"))]).toEqual([
      [111111111, "departure"],
      [222222222, "arrival"],
    ]);
    // Au milieu de la nuit : v1 est en mer depuis plus de 3 h, rien à écouter.
    expect(aisTargets(departures, vessels, at("2026-11-07T01:00:00Z")).size).toBe(0);
    expect([...aisTargets(departures, vessels, at("2026-11-07T05:00:00Z"))]).toEqual([
      [111111111, "arrival"],
    ]);
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
