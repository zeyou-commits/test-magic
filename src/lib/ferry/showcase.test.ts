import { describe, expect, it } from "vitest";
import { lineBenchmark, seasonFares, weeklyPace } from "./showcase";
import type { Port } from "./types";

const port = (name: string, country_code = "FR") =>
  ({ id: name, name, country_code }) as unknown as Port;
const NOW = Date.parse("2026-11-23T12:00:00Z");
const DAY = 24 * 3_600_000;

const dep = (days: number, status: "scheduled" | "cancelled" = "scheduled") => ({
  departure_at: new Date(NOW + days * DAY).toISOString(),
  status,
});

describe("weeklyPace", () => {
  it("donne une moyenne par semaine sur les 4 prochaines semaines", () => {
    // 3 départs par semaine pendant 4 semaines, puis un seul départ lointain qui ne doit pas tirer la moyenne.
    const list = [...Array.from({ length: 12 }, (_, i) => dep(1 + i * 2.3)), dep(200)];
    expect(weeklyPace(list, NOW)).toEqual({ value: 3, kind: "average", weeks: 4 });
  });
  it("retombe sur les 7 prochains jours quand le calendrier est court, sans les annulés", () => {
    expect(weeklyPace([dep(1), dep(3), dep(4, "cancelled"), dep(9)], NOW)).toEqual({
      value: 2,
      kind: "nextWeek",
      weeks: 1,
    });
  });
  it("ne dit rien sans départ publié", () => {
    expect(weeklyPace([], NOW)).toBeNull();
  });
});

describe("prix selon la saison", () => {
  it("lit le relevé du sens exact, accents compris", () => {
    expect(lineBenchmark(port("Sète"), port("Béjaïa"))?.withCar).toBe(423);
    expect(lineBenchmark(port("Alger"), port("Marseille"))).toBeNull();
  });
  it("monte de la période calme à la pointe, à pied comme en voiture", () => {
    const fares = seasonFares(port("Marseille"), port("Alger", "DZ"))!;
    expect(fares).toHaveLength(4);
    expect(fares[0]!.car.amount).toBeLessThan(fares[3]!.car.amount);
    expect(fares[0]!.foot.amount).toBeLessThan(fares[0]!.car.amount);
  });
  it("n'invente rien pour une ligne sans relevé", () => {
    expect(seasonFares(port("Gênes"), port("Annaba", "DZ"))).toBeNull();
  });
});
