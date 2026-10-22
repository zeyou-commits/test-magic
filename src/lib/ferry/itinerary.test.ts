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
    sailing("trop-tot", "2026-10-22T12:59:00Z", "2026-10-23T00:59:00Z"),
    sailing("atteignable", "2026-10-22T13:00:00Z", "2026-10-23T01:00:00Z"),
  ], roadIn, roadOut, startedAt, () => 200, 7, 2, 0.05);
  assert.deepEqual(options.map((option) => option.sailing.departure.id), ["atteignable"]);
  assert.equal(options[0]?.roadKm, 150);
  assert.equal(options[0]?.roadEuro, 29);
  assert.equal(options[0]?.totalEuro, 229);
  assert.equal(options[0]?.totalMinutes, 60 + 240 + 720 + 240 + 45);
  assert.equal(options[0]?.waitUntilTravelMin, 0);
});

test("n'ajoute pas les jours d'attente à la durée porte à porte", () => {
  const options = buildItineraryOptions([
    sailing("dans-une-semaine", "2026-10-29T13:00:00Z", "2026-10-30T01:00:00Z"),
  ], roadIn, roadOut, startedAt, () => 200, 7, 2, 0.05);
  assert.equal(options[0]?.totalMinutes, 1305);
  assert.equal(options[0]?.waitUntilTravelMin, 7 * 24 * 60);
});

test("propose une seule fois chaque couple de ports, avec le premier départ atteignable", () => {
  const options = buildItineraryOptions([
    sailing("premier", "2026-10-23T13:00:00Z", "2026-10-24T01:00:00Z"),
    sailing("semaine-suivante", "2026-10-30T13:00:00Z", "2026-10-31T01:00:00Z"),
  ], roadIn, roadOut, startedAt, () => 200, 7, 2, 0.05);
  assert.deepEqual(distinctItineraries(options, "cost").map((option) => option.sailing.departure.id), ["premier"]);
});

test("les classements coût, arrivée et conduite restent distincts", () => {
  const basic = buildItineraryOptions([
    sailing("a", "2026-10-22T13:00:00Z", "2026-10-23T01:00:00Z"),
    sailing("b", "2026-10-22T14:00:00Z", "2026-10-22T22:00:00Z"),
  ], roadIn, roadOut, startedAt, (trip) => trip.departure.id === "a" ? 100 : 300, 7, 2, 0.05);
  assert.equal(sortItineraries(basic, "cost")[0]?.sailing.departure.id, "a");
  assert.equal(sortItineraries(basic, "time")[0]?.sailing.departure.id, "b");
  assert.equal(sortItineraries(basic, "driving")[0]?.sailing.departure.id, "b");
});

test("avec des enfants, la recommandation évite un long trajet routier pour une faible économie", () => {
  const base = buildItineraryOptions([sailing("a", "2026-10-22T13:00:00Z", "2026-10-23T01:00:00Z")], roadIn, roadOut, startedAt, () => 200, 7, 2, 0.05)[0]!;
  const cheapLongRoad = { ...base, totalEuro: 320, roadKm: 900, sailing: sailing("economique", "2026-10-22T13:00:00Z", "2026-10-23T01:00:00Z") };
  const shortRoad = { ...base, totalEuro: 410, roadKm: 150, sailing: sailing("confort", "2026-10-22T13:00:00Z", "2026-10-23T01:00:00Z") };
  assert.equal(sortItineraries([cheapLongRoad, shortRoad], "cost")[0]?.sailing.departure.id, "economique");
  assert.equal(sortItineraries([cheapLongRoad, shortRoad], "recommended", 2)[0]?.sailing.departure.id, "confort");
});
