import { describe, expect, it } from "vitest";
import { buildTrafficSnapshot, type SnapshotDeparture } from "./trafficSnapshot";

const ports = [
  { id: "mrs", name: "Marseille", country_code: "FR" },
  { id: "alg", name: "Alger", country_code: "DZ" },
];
const routes = [
  { id: "out", departure_port_id: "mrs", arrival_port_id: "alg" },
  { id: "back", departure_port_id: "alg", arrival_port_id: "mrs" },
];
const companies = [{ id: "c", name: "Compagnie" }];
// Vendredi 27 novembre 2026, 18 h à Paris.
const now = Date.parse("2026-11-27T17:00:00Z");
const dep = (id: string, route: string, at: string, extra: Partial<SnapshotDeparture> = {}): SnapshotDeparture => ({
  id,
  route_id: route,
  company_id: "c",
  departure_at: at,
  arrival_at: null,
  duration_minutes: 1200,
  status: "scheduled",
  reported_delay_minutes: null,
  reported_postponed_at: null,
  is_demo: false,
  ...extra,
});

describe("buildTrafficSnapshot", () => {
  const snapshot = buildTrafficSnapshot({
    now,
    routes,
    ports,
    companies,
    departures: [
      dep("sea", "out", "2026-11-27T08:00:00Z"),
      dep("done", "back", "2026-11-26T08:00:00Z"),
      dep("tonight", "out", "2026-11-27T21:00:00Z"),
      dep("tomorrow", "back", "2026-11-28T10:00:00Z", { status: "modified" }),
      dep("cancel", "out", "2026-11-28T12:00:00Z", { status: "cancelled" }),
      dep("demo", "out", "2026-11-27T20:00:00Z", { is_demo: true }),
      dep("far", "out", "2026-12-10T10:00:00Z"),
    ],
  });

  it("date le point et déduit les traversées en cours de l'horaire", () => {
    expect(snapshot.at).toBe("2026-11-27T17:00:00.000Z");
    expect(snapshot.underway.map((c) => c.id)).toEqual(["sea"]);
  });

  it("compte les départs restants, de demain et sur 7 jours sans les annulés ni la démo", () => {
    expect(snapshot.leftToday).toBe(1);
    expect(snapshot.tomorrow).toBe(1);
    expect(snapshot.nextSevenDays).toBe(2);
  });

  it("donne le prochain départ dans chaque sens", () => {
    expect(snapshot.nextToAlgeria?.id).toBe("tonight");
    expect(snapshot.nextFromAlgeria?.id).toBe("tomorrow");
    expect(snapshot.nextToAlgeria?.zone).toBe("Europe/Paris");
  });

  it("liste les perturbations publiées", () => {
    expect(snapshot.disruptions.map((d) => [d.id, d.kind])).toEqual([
      ["tomorrow", "modified"],
      ["cancel", "cancelled"],
    ]);
  });
});
