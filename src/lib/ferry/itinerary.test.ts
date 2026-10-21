import test from "node:test";
import assert from "node:assert/strict";
import { buildItineraryOptions, sortItineraries } from "./itinerary.ts";
import type { Sailing } from "./trips";

const startedAt = Date.parse("2026-10-22T08:00:00Z");
const sailing = (id: string, departureAt: string, arrivalAt: string): Sailing => ({
  departure: { id, departure_at: departureAt, arrival_at: arrivalAt },
  from: { id: "europe" }, to: { id: "algerie" }, durationMin: 720,
} as Sailing);
const roadIn = [{ portId: "europe", distanceKm: 100, durationMin: 60 }];
const roadOut = [{ portId: "algerie", distanceKm: 50, durationMin: 45 }];

test("écarte une traversée inaccessible avec la marge d'embarquement", () => {
  const options = buildItineraryOptions([
    sailing("trop-tot", "2026-10-22T10:59:00Z", "2026-10-22T22:59:00Z"),
    sailing("atteignable", "2026-10-22T11:00:00Z", "2026-10-22T23:00:00Z"),
  ], roadIn, roadOut, startedAt, () => 200, 7, 2, 0.05);
  assert.deepEqual(options.map((option) => option.sailing.departure.id), ["atteignable"]);
  assert.equal(options[0]?.roadKm, 150);
  assert.equal(options[0]?.roadEuro, 29);
  assert.equal(options[0]?.totalEuro, 229);
});

test("les classements coût, arrivée et conduite restent distincts", () => {
  const basic = buildItineraryOptions([
    sailing("a", "2026-10-22T11:00:00Z", "2026-10-22T23:00:00Z"),
    sailing("b", "2026-10-22T12:00:00Z", "2026-10-22T20:00:00Z"),
  ], roadIn, roadOut, startedAt, (trip) => trip.departure.id === "a" ? 100 : 300, 7, 2, 0.05);
  assert.equal(sortItineraries(basic, "cost")[0]?.sailing.departure.id, "a");
  assert.equal(sortItineraries(basic, "time")[0]?.sailing.departure.id, "b");
  assert.equal(sortItineraries(basic, "driving")[0]?.sailing.departure.id, "b");
});
