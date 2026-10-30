import { describe, expect, it } from "vitest";
import {
  fleetShortcutInfo,
  portCode,
  publishedRouteIds,
  shortCompanyName,
} from "./mapPresentation";
import type { Departure, Port, RouteLine, Schedule } from "./types";
import type { FleetShip } from "./fleet";
const now = Date.parse("2026-10-23T08:00:00Z");
const ports = [
  { id: "a", name: "Sète", country_code: "FR" },
  { id: "b", name: "Béjaïa", country_code: "DZ" },
] as Port[];
const routes = [
  { id: "r", departure_port_id: "a", arrival_port_id: "b", status: "active" },
] as RouteLine[];
const schedule = {
  id: "s",
  route_id: "r",
  status: "active",
  is_demo: false,
  weekdays: [1],
  valid_from: "2027-07-01",
  valid_to: "2027-08-31",
  departure_time: "12:00",
} as Schedule;
const departure = {
  id: "d",
  route_id: "r",
  vessel_id: "v",
  status: "scheduled",
  is_demo: false,
  departure_at: "2026-10-23T11:00:00Z",
} as Departure;
const ship = {
  state: "docked",
  vesselId: "v",
  departureId: "d",
  routeId: "r",
  portId: "a",
} as FleetShip;
describe("Raccourcis et programmes de la carte", () => {
  it("inclut les programmes de l'été suivant sans horizon limité", () =>
    expect(publishedRouteIds([], [schedule], routes, ports, now)).toEqual(["r"]));
  it("exclut les calendriers expirés, inactifs et sans jour effectif", () => {
    for (const patch of [
      { valid_to: "2026-01-01" },
      { status: "draft" as const },
      { weekdays: [] },
      { valid_from: "2027-07-06", valid_to: "2027-07-06" },
    ])
      expect(publishedRouteIds([], [{ ...schedule, ...patch }], routes, ports, now)).toEqual([]);
  });
  it("exclut le dernier horaire déjà passé aujourd'hui", () =>
    expect(
      publishedRouteIds(
        [],
        [
          {
            ...schedule,
            weekdays: [5],
            valid_from: "2026-10-01",
            valid_to: "2026-10-23",
            departure_time: "09:00",
          },
        ],
        routes,
        ports,
        now,
      ),
    ).toEqual([]));
  it("inclut un départ ponctuel futur et exclut annulations et démos", () => {
    expect(publishedRouteIds([departure], [], routes, ports, now)).toEqual(["r"]);
    expect(
      publishedRouteIds([{ ...departure, status: "cancelled" }], [], routes, ports, now),
    ).toEqual([]);
  });
  it("affiche le port réel à quai, la destination et le temps avant départ", () =>
    expect(fleetShortcutInfo(ship, [departure], routes, ports, now)).toMatchObject({
      route: "SET → BEJ",
      dock: "Sète",
      destination: "Béjaïa",
      status: "Départ prévu dans 3 h",
    }));
  it("ne confond pas une arrivée passée avec le prochain départ", () =>
    expect(
      fleetShortcutInfo(
        { ...ship, portId: "b" },
        [{ ...departure, departure_at: "2026-10-22T11:00:00Z" }],
        routes,
        ports,
        now,
      ),
    ).toMatchObject({
      dock: "Béjaïa",
      destination: "Destination à confirmer",
      status: "Aucun départ publié pour le moment",
    }));
  it("vu à quai après l'heure de départ : en retard, avec sa destination", () =>
    expect(
      fleetShortcutInfo(
        { ...ship, source: "live", vesselId: "v" },
        [
          {
            ...departure,
            vessel_id: "v",
            departure_at: new Date(now - 3600000).toISOString(),
            arrival_at: new Date(now + 3600000).toISOString(),
          },
        ],
        routes,
        ports,
        now,
      ),
    ).toMatchObject({
      destination: "Béjaïa",
      status: "En retard · départ non constaté",
      late: true,
    }));
  it("navire suivi par son signal, sans port attribué : son port vient de sa position", () => {
    const located = ports.map((p, i) => ({ ...p, longitude: 3.7 + i, latitude: 43.4 - i * 7 }));
    const sete = located[0]!;
    const info = fleetShortcutInfo(
      {
        ...ship,
        portId: null,
        source: "live",
        vesselId: "v",
        live: { position: { longitude: sete.longitude, latitude: sete.latitude, speedKnots: 0 } },
      } as never,
      [{ ...departure, vessel_id: "v" }],
      routes,
      located,
      now,
    );
    expect(info).toMatchObject({
      dock: "Sète",
      destination: "Béjaïa",
      status: "Départ prévu dans 3 h",
    });
  });
  it("n'invente pas un embarquement à partir de l'heure", () =>
    expect(
      fleetShortcutInfo(ship, [departure], routes, ports, now + 2.9 * 3600000).status,
    ).not.toMatch(/embarquement/i));
  it("abrège les ports et les longues raisons sociales", () => {
    expect(portCode({ name: "Béjaïa" })).toBe("BEJ");
    expect(shortCompanyName("Nouris Elbahr Ferries")).toBe("Nouris Elbahr");
  });
});
