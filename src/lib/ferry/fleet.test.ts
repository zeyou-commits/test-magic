import { describe, expect, it } from "vitest";
import { buildFleet, DOCK_GAP } from "./fleet";
import type { Departure, Port, RouteLine, Vessel } from "./types";

const now = Date.parse("2026-10-30T12:00:00Z");
const port = (id: string, longitude: number, latitude: number) =>
  ({ id, name: id, longitude, latitude, status: "active", country_code: "FR" }) as Port;
const ports = [port("mrs", 5.36, 43.3), port("alg", 3.06, 36.78), port("ali", -0.48, 38.33)];
const routes = [{ id: "r", departure_port_id: "mrs", arrival_port_id: "alg" }] as RouteLine[];
const vessels = [{ id: "v", name: "Tariq Ibn Ziyad" }] as Vessel[];
// Traversée en cours selon l'horaire.
const departures = [
  {
    id: "d",
    route_id: "r",
    vessel_id: "v",
    status: "scheduled",
    departure_at: "2026-10-30T09:00:00Z",
    arrival_at: "2026-10-31T07:00:00Z",
  },
] as Departure[];
const build = (immobilized?: Map<string, string | null>) =>
  buildFleet(departures, routes, ports, vessels, [], now, immobilized)[0];

describe("navire immobilisé sur la carte", () => {
  it("sans dossier, l'horaire le place en mer", () => {
    expect(build()?.state).toBe("sea");
  });
  it("avec un port, il y est à quai, pas sur sa ligne", () => {
    expect(build(new Map([["v", "ali"]]))).toMatchObject({
      state: "docked",
      portId: "ali",
      lngLat: [-0.48, 38.33],
    });
  });
  it("sans port connu, il n'est jamais présenté en mer", () => {
    expect(build(new Map([["v", null]]))?.state).not.toBe("sea");
  });
});

describe("plusieurs navires au même port", () => {
  const two = [...vessels, { id: "w", name: "Le Cracovia" }] as Vessel[];
  const fromAli = [{ id: "ra", departure_port_id: "ali", arrival_port_id: "alg" }] as RouteLine[];
  // Deux départs d'Alicante dans quelques heures : les deux navires attendent à quai.
  const soon = ["v", "w"].map((vessel) => ({
    ...departures[0]!,
    id: `d-${vessel}`,
    route_id: "ra",
    vessel_id: vessel,
    departure_at: "2026-10-30T20:00:00Z",
    arrival_at: "2026-10-31T06:00:00Z",
  })) as Departure[];
  it("sont rangés en file indienne, sans se chevaucher", () => {
    const fleet = buildFleet(soon, fromAli, ports, two, [], now);
    const gaps = fleet.map((ship) => ship.dx).sort((a, b) => a - b);
    expect(fleet.every((ship) => ship.portId === "ali" && ship.state === "docked")).toBe(true);
    expect(gaps[1]! - gaps[0]!).toBe(DOCK_GAP);
  });
  it("un navire immobilisé est posé à terre, hors de la file", () => {
    const fleet = buildFleet(soon, fromAli, ports, two, [], now, new Map([["v", "ali"]]));
    expect(fleet.find((ship) => ship.vesselId === "v")).toMatchObject({ ashore: true, dx: 0 });
    expect(fleet.find((ship) => ship.vesselId === "w")?.dx).toBe(0);
  });
});
