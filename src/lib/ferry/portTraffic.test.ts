import { describe, expect, it } from "vitest";
import { portTraffic } from "./portTraffic";
import type { Departure, RouteLine } from "./types";

const now = Date.parse("2026-10-21T12:00:00Z");
const routes = [
  { id: "out", departure_port_id: "port", arrival_port_id: "other" },
  { id: "in", departure_port_id: "other", arrival_port_id: "port" },
] as RouteLine[];
const sailing = (id: string, changes: Partial<Departure> = {}) =>
  ({
    id,
    route_id: "out",
    departure_at: "2026-10-22T12:00:00Z",
    arrival_at: null,
    duration_minutes: 120,
    status: "scheduled",
    ...changes,
  }) as Departure;

describe("port traffic", () => {
  it("counts all upcoming sailings, rather than the three preview rows", () => {
    const rows = Array.from({ length: 8 }, (_, index) => sailing(String(index)));
    rows.push(
      sailing("cancelled", { status: "cancelled" }),
      sailing("past", { departure_at: "2026-10-20T12:00:00Z" }),
    );
    const traffic = portTraffic("port", routes, rows, now);
    expect(traffic.departures).toHaveLength(8);
    expect(traffic.departures.slice(0, 3)).toHaveLength(3);
    expect(traffic.arrivals).toHaveLength(0);
  });

  it("counts future arrivals using their own timestamp, including a crossing already underway", () => {
    const traffic = portTraffic(
      "port",
      routes,
      [
        sailing("underway", {
          route_id: "in",
          departure_at: "2026-10-21T10:00:00Z",
          arrival_at: "2026-10-21T14:00:00Z",
        }),
        sailing("duration", { route_id: "in" }),
        sailing("unknown", { route_id: "in", duration_minutes: null }),
        sailing("arrived", { route_id: "in", arrival_at: "2026-10-20T12:00:00Z" }),
        sailing("invalid", { route_id: "in", arrival_at: "invalid" }),
        sailing("cancelled", { route_id: "in", status: "cancelled" }),
      ],
      now,
    );
    expect(traffic.arrivals.map((item) => item.departure.id)).toEqual(["underway", "duration"]);
    expect(traffic.arrivals[1]?.arrivalAt).toBe("2026-10-22T14:00:00.000Z");
  });

  it("sorts chronologically and ignores departures with an unknown route", () => {
    const traffic = portTraffic(
      "port",
      routes,
      [
        sailing("later"),
        sailing("earlier", { departure_at: "2026-10-21T16:00:00Z" }),
        sailing("orphan", { route_id: "missing" }),
      ],
      now,
    );
    expect(traffic.departures.map((item) => item.id)).toEqual(["earlier", "later"]);
  });
});
