import { test, assert } from "vitest";
import { buildItineraryOptions, distinctItineraries, sortItineraries } from "./itinerary.ts";
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
  assert.equal(options[0]?.totalMinutes, 60 + 120 + 720 + 45);
  assert.equal(options[0]?.waitUntilTravelMin, 0);
});

test("n'ajoute pas les jours d'attente à la durée porte à porte", () => {
  const options = buildItineraryOptions([
    sailing("dans-une-semaine", "2026-10-29T11:00:00Z", "2026-10-29T23:00:00Z"),
  ], roadIn, roadOut, startedAt, () => 200, 7, 2, 0.05);
  assert.equal(options[0]?.totalMinutes, 945);
  assert.equal(options[0]?.waitUntilTravelMin, 7 * 24 * 60);
});

test("propose une seule fois chaque couple de ports, avec le premier départ atteignable", () => {
  const options = buildItineraryOptions([
    sailing("premier", "2026-10-23T11:00:00Z", "2026-10-23T23:00:00Z"),
    sailing("semaine-suivante", "2026-10-30T11:00:00Z", "2026-10-30T23:00:00Z"),
  ], roadIn, roadOut, startedAt, () => 200, 7, 2, 0.05);
  assert.deepEqual(distinctItineraries(options, "cost").map((option) => option.sailing.departure.id), ["premier"]);
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
