import { describe, expect, it } from "vitest";
import { departureMinutes, lineStats } from "./lineStats";
import type { Company, Departure, Vessel } from "./types";

const NOW = Date.parse("2026-11-18T12:00:00Z");
const company = (id: string) => ({ id, name: id, logo_url: null }) as unknown as Company;
const vessel = (id: string) => ({ id, name: id }) as unknown as Vessel;
const dep = (over: Partial<Departure>): Departure =>
  ({
    id: Math.random().toString(36),
    route_id: "r",
    company_id: "a",
    vessel_id: null,
    departure_at: "2026-11-19T10:00:00Z",
    arrival_at: null,
    duration_minutes: null,
    status: "scheduled",
    ...over,
  }) as Departure;

describe("les chiffres d'une ligne", () => {
  it("compte les départs à venir, sans les annulés ni les passés", () => {
    const stats = lineStats({
      departures: [
        dep({ departure_at: "2026-11-17T10:00:00Z" }),
        dep({ status: "cancelled" }),
        dep({ departure_at: "2026-11-20T10:00:00Z" }),
        dep({ departure_at: "2026-12-20T10:00:00Z" }),
      ],
      companies: [company("a")],
      vessels: [],
      now: NOW,
    });
    expect(stats.upcoming).toBe(2);
    expect(stats.nextWeek).toBe(1);
    expect(stats.lastAt).toBe("2026-12-20T10:00:00Z");
  });

  it("donne les compagnies, leurs navires et leurs durées publiées", () => {
    const stats = lineStats({
      departures: [
        dep({ company_id: "a", vessel_id: "v1", duration_minutes: 1320 }),
        dep({ company_id: "a", vessel_id: "v1", duration_minutes: 1380 }),
        dep({
          company_id: "b",
          vessel_id: "v2",
          departure_at: "2026-11-25T10:00:00Z",
          arrival_at: "2026-11-26T16:00:00Z",
        }),
      ],
      companies: [company("a"), company("b")],
      vessels: [vessel("v1"), vessel("v2")],
      now: NOW,
    });
    expect(stats.operators.map((item) => item.company.id)).toEqual(["a", "b"]);
    expect(stats.operators[0]).toMatchObject({ count: 2, minMinutes: 1320, maxMinutes: 1380 });
    expect(stats.operators[1]!.minMinutes).toBe(30 * 60);
    expect(stats.vessels.map((item) => item.id)).toEqual(["v1", "v2"]);
    expect(stats.fastestMinutes).toBe(1320);
  });

  it("n'invente pas de durée quand rien n'est publié", () => {
    expect(departureMinutes(dep({}))).toBeNull();
    const stats = lineStats({
      departures: [dep({})],
      companies: [company("a")],
      vessels: [],
      now: NOW,
    });
    expect(stats.operators[0]!.minMinutes).toBeNull();
    expect(stats.fastestMinutes).toBeNull();
  });
});
