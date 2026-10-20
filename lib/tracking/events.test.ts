import { describe, expect, it } from "vitest";
import { acceptableReport, observePortEvent, type PreviousObservation } from "./events";
import type { ParsedPosition } from "./parse";
const now = Date.parse("2026-10-20T00:00:00Z");
const ports = [{ id: "from", latitude: 37, longitude: 2 }, { id: "to", latitude: 38, longitude: 2 }];
const previous: PreviousObservation = { latitude: 37, longitude: 2, speed_knots: 0, reported_at: new Date(now - 10 * 60_000).toISOString(), last_port_id: "from", departure_port_id: null, arrival_port_id: null, atd_at: null, ata_at: null, event_departure_id: null };
const p: ParsedPosition = { mmsi: 1, vesselName: null, status: null, latitude: 37.05, longitude: 2, speedKnots: 15, courseDeg: 0, reportedAt: new Date(now).toISOString() };
describe("événements portuaires observés", () => {
  it("un passage du quai à plus de 3 km en navigation constate le départ à la date du signal", () => {
    expect(observePortEvent(p, previous, ports, now)).toMatchObject({ atd_at: "2026-10-20T00:00:00.000Z", atd_after: "2026-10-19T23:50:00.000Z", departure_port_id: "from" });
  });
  it("sans observation préalable au quai, aucune heure de départ n'est inventée", () => {
    expect(observePortEvent(p, null, ports, now).atd_at).toBeUndefined();
  });
  it("un ancien signal ne remplace jamais une observation plus récente", () => {
    expect(acceptableReport({ ...p, reportedAt: previous.reported_at }, previous, now)).toBe(false);
  });
  it("être proche du port en mouvement ne constitue pas une arrivée", () => {
    expect(observePortEvent({ ...p, latitude: 38 }, { ...previous, atd_at: "2026-10-19T20:00:00Z", departure_port_id: "from" }, ports, now).ata_at).toBeUndefined();
  });
  it("l'arrivée à moins de 2 km à moins de 1,5 nœud est conservée, sans recréer un départ", () => {
    const event = observePortEvent({ ...p, latitude: 38, speedKnots: 0 }, { ...previous, atd_at: "2026-10-19T20:00:00Z", departure_port_id: "from" }, ports, now);
    expect(event.ata_at).toBe("2026-10-20T00:00:00.000Z");
    expect(event.atd_at).toBeUndefined();
  });
});