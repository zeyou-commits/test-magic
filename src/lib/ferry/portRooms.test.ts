import { describe, expect, it } from "vitest";
import { portRooms } from "./portRooms";
import type { Departure, RouteLine } from "./types";

const now = Date.parse("2026-11-02T12:00:00Z");
const routes = [
  { id: "out", departure_port_id: "oran", arrival_port_id: "ali" },
  { id: "in", departure_port_id: "mrs", arrival_port_id: "oran" },
] as RouteLine[];
const dep = (id: string, route: string, at: string, arrival: string | null = null) =>
  ({ id, route_id: route, departure_at: at, arrival_at: arrival, status: "scheduled", vessel_id: null }) as Departure;

describe("salons d'un port", () => {
  const rooms = portRooms(
    "oran",
    routes,
    [
      dep("bientot", "out", "2026-11-02T19:00:00Z"),
      dep("parti", "out", "2026-11-02T10:30:00Z"),
      dep("ancien", "out", "2026-11-02T08:00:00Z"),
      dep("demain", "out", "2026-11-03T19:00:00Z"),
      dep("arrive", "in", "2026-11-01T20:00:00Z", "2026-11-02T15:00:00Z"),
    ],
    now,
  );
  it("met en avant les traversées de 12 h avant à 2 h après, arrivées comprises", () => {
    expect(rooms.soon.map((room) => room.departureId)).toEqual(["parti", "arrive", "bientot"]);
    expect(rooms.soon.find((room) => room.departureId === "arrive")?.kind).toBe("arrival");
  });
  it("garde les suivantes à part, sans les traversées passées", () => {
    expect(rooms.later.map((room) => room.departureId)).toEqual(["demain"]);
  });
});
