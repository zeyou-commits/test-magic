import { describe, expect, it } from "vitest";
import { findAlternatives, isDisrupted } from "./alternatives";

const routes = [
  { id: "mrs-alg", departure_port_id: "mrs", arrival_port_id: "alg" },
  { id: "set-alg", departure_port_id: "set", arrival_port_id: "alg" },
  { id: "mrs-ora", departure_port_id: "mrs", arrival_port_id: "ora" },
  { id: "ali-ora", departure_port_id: "ali", arrival_port_id: "ora" },
];
const dep = (id: string, route_id: string, day: number, vessel_id: string | null = "ok") => ({
  id,
  route_id,
  vessel_id,
  departure_at: `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`,
  status: "scheduled",
});
const now = Date.parse("2026-11-01T00:00:00Z");
const target = dep("t", "mrs-alg", 11, "down");
const alerted = (id: string) => id === "down";

describe("findAlternatives", () => {
  it("propose la même ligne d'abord, du plus proche au plus lointain", () => {
    const found = findAlternatives(
      target,
      [dep("far", "mrs-alg", 16), dep("near", "mrs-alg", 12), dep("side", "set-alg", 11)],
      routes,
      alerted,
      [],
      now,
    );
    expect(found.sameLine.map((d) => d.id)).toEqual(["near", "far"]);
    expect(found.nearby.map((d) => d.id)).toEqual(["side"]);
  });

  it("écarte le navire en alerte, les lignes sans port commun et ce qui sort de la semaine", () => {
    const found = findAlternatives(
      target,
      [dep("same", "mrs-alg", 12, "down"), dep("other", "ali-ora", 11), dep("late", "mrs-alg", 25)],
      routes,
      alerted,
      [],
      now,
    );
    expect(found.sameLine).toEqual([]);
    expect(found.nearby).toEqual([]);
  });

  it("garde la ligne quand l'alerte ne vise qu'un navire", () => {
    const news = [{ kind: "alerte", route_ids: ["mrs-alg"], departure_ids: [], vessel_id: "down" }];
    const found = findAlternatives(target, [dep("near", "mrs-alg", 12)], routes, alerted, news, now);
    expect(found.sameLine.map((d) => d.id)).toEqual(["near"]);
  });

  it("oublie une perturbation sans date de fin au bout de 48 h", () => {
    const old = { kind: "perturbation", route_ids: ["set-alg"], departure_ids: [] };
    const started = { ...old, starts_at: "2026-11-01T00:00:00Z" };
    const departure = { id: "x", route_id: "set-alg" };
    expect(isDisrupted(departure, [started], Date.parse("2026-11-02T00:00:00Z"))).toBe(true);
    expect(isDisrupted(departure, [started], Date.parse("2026-11-04T00:00:00Z"))).toBe(false);
  });

  it("écarte aussi une ligne perturbée, et ne propose rien de passé", () => {
    const news = [{ kind: "perturbation", route_ids: ["set-alg"], departure_ids: [] }];
    const found = findAlternatives(
      target,
      [dep("hit", "set-alg", 12), dep("past", "mrs-alg", 10)],
      routes,
      alerted,
      news,
      Date.parse("2026-11-10T20:00:00Z"),
    );
    expect(found.nearby).toEqual([]);
    expect(found.sameLine).toEqual([]);
    expect(isDisrupted({ id: "x", route_id: "set-alg" }, news)).toBe(true);
  });
});
