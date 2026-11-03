import { describe, expect, it } from "vitest";
import { companyOverview } from "./companyOverview";
import type { Departure, RouteLine, Vessel } from "./types";

const now = Date.parse("2026-11-03T12:00:00Z");
const vessel = (id: string, values: Partial<Vessel>) =>
  ({ id, name: id, status: "active", company_id: "c1", ...values }) as Vessel;
const route = (id: string, companies: string[]) =>
  ({ id, slug: id, company_ids: companies }) as RouteLine;
const departure = (route_id: string, days: number, values: Partial<Departure> = {}) =>
  ({
    id: `${route_id}-${days}`,
    route_id,
    company_id: "c1",
    status: "scheduled",
    departure_at: new Date(now + days * 86_400_000).toISOString(),
    ...values,
  }) as Departure;

describe("companyOverview", () => {
  it("résume la flotte en service, son âge moyen et son navire phare", () => {
    const overview = companyOverview(
      { id: "c1" },
      [
        vessel("a", { build_year: 2000, passenger_capacity: 1800, car_capacity: 500 }),
        vessel("b", { build_year: 2010, passenger_capacity: 1300, car_capacity: 300 }),
        vessel("archive", { status: "inactive", build_year: 1970, passenger_capacity: 9000 }),
        vessel("autre", { company_id: "c2", passenger_capacity: 5000 }),
      ],
      [],
      [],
      now,
      2026,
    );
    expect(overview.fleet.map((v) => v.id)).toEqual(["a", "b"]);
    expect(overview.averageAge).toBe(21);
    expect(overview.flagship?.id).toBe("a");
    expect(overview.oldest?.id).toBe("a");
    expect(overview.youngest?.id).toBe("b");
    expect(overview.carsTotal).toBe(800);
  });

  it("calcule les rotations par semaine sur les 8 prochaines semaines, sans les annulations", () => {
    const departures = [
      ...Array.from({ length: 16 }, (_, i) => departure("r1", i * 3 + 1)),
      departure("r1", 2, { status: "cancelled" }),
      departure("r1", -1),
      departure("r1", 90),
      departure("r2", 5, { company_id: "c2" }),
    ];
    const overview = companyOverview(
      { id: "c1" },
      [],
      [route("r1", ["c1"]), route("r2", ["c2"]), route("r3", ["c1"])],
      departures,
      now,
    );
    expect(overview.lines.map((l) => [l.route.id, l.perWeek])).toEqual([
      ["r1", 2],
      ["r3", 0],
    ]);
    expect(overview.perWeek).toBe(2);
    expect(overview.upcoming).toBe(17);
    expect(overview.next?.id).toBe("r1-1");
  });

  it("n'invente pas d'âge sans année de construction", () => {
    expect(companyOverview({ id: "c1" }, [vessel("a", {})], [], [], now).averageAge).toBeNull();
  });
});
